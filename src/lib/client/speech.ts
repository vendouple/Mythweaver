"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bgmDuck } from "@/lib/client/audio";

export type SpeechStatus = "idle" | "pending" | "playing" | "done" | "failed";

const CLIP_POLL_MS = 450;
const CLIP_WAIT_MS = 90_000;

function clipUrl(campaignId: string, batchId: string, clipId: string, hostToken: string) {
  const query = new URLSearchParams({ action: "clip", campaignId, batchId, clipId, hostToken });
  return `/api/tts?${query.toString()}`;
}

/**
 * Owns exactly one ephemeral narration audio element for the TV. A pending or
 * failed clip resolves to `failed`, allowing HostStage to keep its normal text
 * pacing instead of ever freezing the table on a TTS problem.
 */
export function useTtsSpeech(campaignId: string, batchId: string | undefined, hostToken: string, enabled: boolean, volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const serialRef = useRef(0);
  const volumeRef = useRef(volume);
  const [status, setStatus] = useState<SpeechStatus>("idle");

  const stop = useCallback(() => {
    serialRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audioRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    bgmDuck(false);
    setStatus("idle");
  }, []);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  const speak = useCallback(async (clipId: string): Promise<boolean> => {
    stop();
    if (!enabled || !batchId || !clipId) return false;
    const serial = serialRef.current;
    setStatus("pending");
    const deadline = Date.now() + CLIP_WAIT_MS;

    try {
      let response: Response | undefined;
      while (Date.now() < deadline && serial === serialRef.current) {
        response = await fetch(clipUrl(campaignId, batchId, clipId, hostToken), { cache: "no-store" });
        if (response.ok) break;
        // 409 means the server still has the clip queued. Other results are a
        // permanent per-beat fallback (missing, failed, expired, or auth).
        if (response.status !== 409) throw new Error(`clip unavailable (${response.status})`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, CLIP_POLL_MS));
      }
      if (!response?.ok || serial !== serialRef.current) throw new Error("clip was not ready");

      const blob = await response.blob();
      if (!blob.size || serial !== serialRef.current) throw new Error("empty clip");
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.volume = Math.max(0, Math.min(1, volumeRef.current));

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("audio playback failed"));
        audio.play().then(() => {
          if (serial === serialRef.current) {
            bgmDuck(true);
            setStatus("playing");
          }
        }).catch(reject);
      });
      if (serial !== serialRef.current) return false;
      bgmDuck(false);
      setStatus("done");
      return true;
    } catch {
      if (serial === serialRef.current) {
        bgmDuck(false);
        setStatus("failed");
      }
      return false;
    }
  }, [batchId, campaignId, enabled, hostToken, stop]);

  return { status, speak, stop };
}