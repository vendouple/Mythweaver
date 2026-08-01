import { NextResponse } from "next/server";
import { getCampaign, isHostSessionToken } from "@/lib/campaign/store";
import { getBatch, getClip, readClip, releaseBatch, releaseCampaign, sidecarHealth } from "@/lib/tts/runtime";
import { listVoices } from "@/lib/tts/voices";

export const dynamic = "force-dynamic";

/**
 * Ephemeral, turn-scoped TTS clip service (see src/lib/tts/runtime.ts).
 *
 * Voices and sidecar health are public — neither carries campaign state.
 * Batch summaries and clip audio are gated: the caller must present either
 * the live host session token OR the id of the campaign's party leader.
 * Anything else gets a 403, and audio is never served unauthenticated.
 * Release actions are host-token only.
 */

async function authorizeBatchAccess(campaignId: string, hostToken: string, playerId: string): Promise<boolean> {
  if (hostToken && isHostSessionToken(campaignId, hostToken)) return true;
  if (playerId) {
    const campaign = await getCampaign(campaignId);
    if (campaign.partyLeaderId && campaign.partyLeaderId === playerId) return true;
  }
  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  if (action === "voices") {
    const voices = await listVoices();
    return NextResponse.json({ voices });
  }

  if (action === "health") {
    try {
      const health = await sidecarHealth();
      return NextResponse.json(health as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 503 });
    }
  }

  if (action === "batch" || action === "clip") {
    const campaignId = url.searchParams.get("campaignId") || "";
    const batchId = url.searchParams.get("batchId") || "";
    const hostToken = (url.searchParams.get("hostToken") || "").trim();
    const playerId = url.searchParams.get("playerId") || "";
    if (!campaignId || !batchId) {
      return NextResponse.json({ error: "campaignId and batchId are required" }, { status: 400 });
    }
    if (!(await authorizeBatchAccess(campaignId, hostToken, playerId))) {
      return NextResponse.json({ error: "Not permitted" }, { status: 403 });
    }

    if (action === "batch") {
      const batch = getBatch(campaignId, batchId);
      if (!batch) return NextResponse.json({ error: "batch not found" }, { status: 404 });
      return NextResponse.json({ batch });
    }

    const clipId = url.searchParams.get("clipId") || "";
    if (!clipId) return NextResponse.json({ error: "clipId is required" }, { status: 400 });

    // readClip returns undefined both for unknown clips and for clips that
    // exist but are not ready; disambiguate so a still-generating clip gets
    // a 409 rather than a misleading 404.
    const clip = readClip(campaignId, batchId, clipId);
    if (!clip) {
      const meta = getClip(campaignId, batchId, clipId);
      if (!meta) return NextResponse.json({ error: "clip not found" }, { status: 404 });
      return NextResponse.json({ error: `clip not ready (status: ${meta.status})` }, { status: 409 });
    }

    const headers = new Headers({
      "Content-Type": clip.contentType,
      "Content-Length": String(clip.byteLength),
      "Cache-Control": "no-store",
    });
    if (clip.durationSeconds != null) headers.set("X-Audio-Duration", String(clip.durationSeconds));
    if (clip.sampleRate != null) headers.set("X-Audio-Sample-Rate", String(clip.sampleRate));
    // Copy into a fresh ArrayBuffer-backed view: the DOM BodyInit typing only
    // accepts Uint8Array<ArrayBuffer>, not Node's Buffer/ArrayBufferLike.
    const body = new Uint8Array(clip.buffer.byteLength);
    body.set(clip.buffer);
    return new Response(body, { status: 200, headers });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const campaignId = String(body.campaignId || "");
  const hostToken = String(body.hostToken || "").trim();

  if (action === "release" || action === "releaseCampaign") {
    if (!campaignId) return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    if (!hostToken || !isHostSessionToken(campaignId, hostToken)) {
      return NextResponse.json({ error: "Only the host screen can do that" }, { status: 403 });
    }

    if (action === "release") {
      const batchId = String(body.batchId || "");
      if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });
      const released = releaseBatch(campaignId, batchId);
      return NextResponse.json({ released });
    }

    const released = releaseCampaign(campaignId);
    return NextResponse.json({ released });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
