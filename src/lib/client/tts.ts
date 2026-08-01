"use client";

/**
 * Whether the local Chatterbox sidecar is reachable and serving voices right
 * now. Used to gate the "enable narration" control: TTS should only flip on
 * when speech can actually be produced this session.
 */
export async function ttsSidecarHealthy(): Promise<boolean> {
  try {
    const response = await fetch("/api/tts?action=health", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}
