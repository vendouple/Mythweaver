import { createId } from "@/lib/utils/ids";
import { isValidVoiceId } from "./voices";
import { ttsServerHost } from "./config";

/**
 * Server-only, ephemeral turn-scoped TTS clip registry.
 *
 * Audio is synthesized by the standalone local server (`TTS/main.py`) which
 * exposes:
 *   GET  {base}/health     -> { status, voices: string[], ... }
 *   POST {base}/synthesize -> JSON { text, voiceId, exaggeration?, cfgWeight? }
 *                             returns `audio/wav` bytes with
 *                             `X-Audio-Duration` / `X-Audio-Sample-Rate` headers.
 *
 * Batches are keyed by campaign + batch id and live entirely in memory —
 * nothing is persisted to disk and no generated clips are committed anywhere.
 * Clips are generated sequentially in the order supplied. Any failed call
 * marks that clip `failed` and generation continues; the batch call never
 * throws for a single bad clip.
 *
 * This module is server-only and must never be imported from client code.
 */

export type ClipStatus = "pending" | "ready" | "failed" | "cancelled";
export type BatchStatus = "pending" | "generating" | "ready" | "failed" | "cancelled";

export type ClipRequest = {
  /** Stable subtitle chunk id (the same id the TV is currently presenting). */
  id: string;
  text: string;
  voiceId: string;
  exaggeration?: number;
  cfgWeight?: number;
};

export type Clip = {
  id: string;
  index: number;
  text: string;
  voiceId: string;
  exaggeration?: number;
  cfgWeight?: number;
  status: ClipStatus;
  contentType?: string;
  durationSeconds?: number;
  sampleRate?: number;
  byteLength?: number;
  error?: string;
};

export type ClipReadResult = {
  buffer: Buffer;
  contentType: string;
  byteLength: number;
  durationSeconds?: number;
  sampleRate?: number;
};

export type BatchSummary = {
  batchId: string;
  campaignId: string;
  status: BatchStatus;
  createdAt: number;
  clips: Clip[];
};

type StoredClip = Clip & { audio?: Buffer };

type Batch = {
  id: string;
  campaignId: string;
  createdAt: number;
  lastTouchedAt: number;
  clips: StoredClip[];
  cancelled: boolean;
  generating: boolean;
};

const DEFAULT_SIDECAR_URL = "http://127.0.0.1:5123";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_TTL_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sidecarBaseUrl(host?: string, port?: number): string {
  if (Number.isInteger(port) && port! >= 1 && port! <= 65535) {
    return `http://${ttsServerHost(host)}:${port}`;
  }
  const raw = process.env.TTS_SIDECAR_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_SIDECAR_URL;
  return base.replace(/\/+$/, "");
}

function requestTimeoutMs(): number {
  const value = Number(process.env.TTS_SIDECAR_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function ttlMs(): number {
  const value = Number(process.env.TTS_BATCH_TTL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_MS;
}

// Global, dev-server-safe registry (survives HMR within a single process).
const batches: Map<string, Batch> = ((globalThis as any).__ttsBatches ??= new Map<string, Batch>());
let sweeper: ReturnType<typeof setInterval> | undefined = (globalThis as any).__ttsSweeper;

function keyFor(campaignId: string, batchId: string): string {
  return `${campaignId}::${batchId}`;
}

function touch(batch: Batch): void {
  batch.lastTouchedAt = Date.now();
}

function sweep(): void {
  const now = Date.now();
  const ttl = ttlMs();
  for (const [key, batch] of batches) {
    // Never evict an actively-generating batch; its own lifecycle will settle.
    if (batch.generating) continue;
    if (now - batch.lastTouchedAt > ttl) batches.delete(key);
  }
}

function ensureSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(sweep, SWEEP_INTERVAL_MS);
  // Do not keep the Node process alive solely for cleanup.
  if (typeof sweeper === "object" && sweeper && "unref" in sweeper) {
    (sweeper as { unref?: () => void }).unref?.();
  }
  (globalThis as any).__ttsSweeper = sweeper;
}

function toPublicClip(clip: StoredClip): Clip {
  const { audio: _audio, ...rest } = clip;
  return rest;
}

function toSummary(batch: Batch): BatchSummary {
  return {
    batchId: batch.id,
    campaignId: batch.campaignId,
    status: computeBatchStatus(batch),
    createdAt: batch.createdAt,
    clips: batch.clips.map(toPublicClip),
  };
}

function computeBatchStatus(batch: Batch): BatchStatus {
  if (batch.cancelled) return "cancelled";
  if (batch.generating) return "generating";
  const statuses = batch.clips.map((c) => c.status);
  if (statuses.every((s) => s === "pending")) return "pending";
  if (statuses.every((s) => s === "ready")) return "ready";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "cancelled")) return "cancelled";
  return "generating";
}

/**
 * Create a batch and kick off sequential generation in the background.
 * Returns the batch summary immediately; poll `getBatch` for progress.
 */
export function createBatch(campaignId: string, clips: ClipRequest[], sidecarHost?: string, sidecarPort?: number): BatchSummary {
  ensureSweeper();

  const batch: Batch = {
    id: createId("ttsb"),
    campaignId,
    createdAt: Date.now(),
    lastTouchedAt: Date.now(),
    cancelled: false,
    generating: false,
    clips: clips.map((c, index) => ({
      id: c.id,
      index,
      text: c.text,
      voiceId: c.voiceId,
      exaggeration: c.exaggeration,
      cfgWeight: c.cfgWeight,
      status: "pending" as ClipStatus,
    })),
  };

  batches.set(keyFor(campaignId, batch.id), batch);
  void runBatch(batch, sidecarHost, sidecarPort);
  return toSummary(batch);
}

async function runBatch(batch: Batch, sidecarHost?: string, sidecarPort?: number): Promise<void> {
  if (batch.generating) return;
  batch.generating = true;
  touch(batch);

  try {
    // Strictly sequential, in supplied order.
    for (const clip of batch.clips) {
      if (batch.cancelled) {
        if (clip.status === "pending") clip.status = "cancelled";
        continue;
      }
      await generateClip(batch, clip, sidecarHost, sidecarPort);
      touch(batch);
    }
  } finally {
    batch.generating = false;
    // If we were cancelled mid-flight, settle any stragglers.
    if (batch.cancelled) {
      for (const clip of batch.clips) {
        if (clip.status === "pending") clip.status = "cancelled";
      }
    }
    touch(batch);
  }
}

async function generateClip(batch: Batch, clip: StoredClip, sidecarHost?: string, sidecarPort?: number): Promise<void> {
  // Validate the voice id against discovered voices before hitting the model.
  if (!isValidVoiceId(clip.voiceId)) {
    clip.status = "failed";
    clip.error = `unknown or invalid voiceId: ${clip.voiceId}`;
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(`${sidecarBaseUrl(sidecarHost, sidecarPort)}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: clip.text,
        voiceId: clip.voiceId,
        exaggeration: clip.exaggeration,
        cfgWeight: clip.cfgWeight,
      }),
      signal: controller.signal,
      // Ensure this is never cached.
      cache: "no-store",
    });

    if (!response.ok) {
      let message = `sidecar responded ${response.status}`;
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        // keep the generic message
      }
      throw new Error(message);
    }

    const contentType = response.headers.get("content-type") ?? "audio/wav";
    const durationHeader = response.headers.get("x-audio-duration");
    const sampleRateHeader = response.headers.get("x-audio-sample-rate");
    const buffer = Buffer.from(await response.arrayBuffer());

    clip.audio = buffer;
    clip.contentType = contentType;
    clip.byteLength = buffer.byteLength;
    clip.durationSeconds = durationHeader ? Number(durationHeader) : undefined;
    clip.sampleRate = sampleRateHeader ? Number(sampleRateHeader) : undefined;
    clip.status = "ready";
    clip.error = undefined;
  } catch (error) {
    // Never throw: a failed call marks the clip failed and the batch moves on.
    clip.status = batch.cancelled ? "cancelled" : "failed";
    clip.error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch a batch summary (no audio bytes). */
export function getBatch(campaignId: string, batchId: string): BatchSummary | undefined {
  const batch = batches.get(keyFor(campaignId, batchId));
  if (!batch) return undefined;
  touch(batch);
  return toSummary(batch);
}

/** Fetch public metadata for a single clip. */
export function getClip(campaignId: string, batchId: string, clipId: string): Clip | undefined {
  const batch = batches.get(keyFor(campaignId, batchId));
  if (!batch) return undefined;
  touch(batch);
  const clip = batch.clips.find((c) => c.id === clipId);
  return clip ? toPublicClip(clip) : undefined;
}

/**
 * Read a ready clip's audio buffer plus metadata. Returns `undefined` when
 * the clip does not exist or is not ready.
 */
export function readClip(campaignId: string, batchId: string, clipId: string): ClipReadResult | undefined {
  const batch = batches.get(keyFor(campaignId, batchId));
  if (!batch) return undefined;
  touch(batch);
  const clip = batch.clips.find((c) => c.id === clipId);
  if (!clip || clip.status !== "ready" || !clip.audio) return undefined;
  return {
    buffer: clip.audio,
    contentType: clip.contentType ?? "audio/wav",
    byteLength: clip.byteLength ?? clip.audio.byteLength,
    durationSeconds: clip.durationSeconds,
    sampleRate: clip.sampleRate,
  };
}

/**
 * Request cancellation. In-flight clip generation is not aborted mid-call
 * (the sidecar serializes synthesis anyway), but any pending clips are marked
 * cancelled and no further generation starts.
 */
export function cancelBatch(campaignId: string, batchId: string): boolean {
  const batch = batches.get(keyFor(campaignId, batchId));
  if (!batch) return false;
  batch.cancelled = true;
  touch(batch);
  for (const clip of batch.clips) {
    if (clip.status === "pending") clip.status = "cancelled";
  }
  return true;
}

/** Release a single batch, dropping all audio from memory. */
export function releaseBatch(campaignId: string, batchId: string): boolean {
  return batches.delete(keyFor(campaignId, batchId));
}

/** Release every batch belonging to a campaign. Returns the count removed. */
export function releaseCampaign(campaignId: string): number {
  let removed = 0;
  for (const [key, batch] of batches) {
    if (batch.campaignId === campaignId) {
      batches.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Health passthrough for the sidecar. */
export async function sidecarHealth(host?: string, port?: number): Promise<unknown> {
  const controller = new AbortController();
  // A status light must fail fast if a LAN server disappears; synthesis keeps
  // its longer, separately configured timeout.
  const timeout = setTimeout(() => controller.abort(), Math.min(requestTimeoutMs(), 5_000));
  try {
    const response = await fetch(`${sidecarBaseUrl(host, port)}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Return the voice ids advertised by a standalone server. */
export async function sidecarVoiceIds(host?: string, port?: number): Promise<string[]> {
  const health = await sidecarHealth(host, port) as { voices?: unknown };
  return Array.isArray(health.voices)
    ? health.voices.filter((voice): voice is string => typeof voice === "string" && isValidVoiceId(voice))
    : [];
}
