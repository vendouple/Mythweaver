"use client";

/**
 * Whether the local Chatterbox sidecar is reachable and serving voices right
 * now. Used to gate the "enable narration" control: TTS should only flip on
 * when speech can actually be produced this session.
 */
export async function ttsSidecarHealthy(host?: string, port?: number): Promise<boolean> {
  try {
    const query = new URLSearchParams({ action: "health" });
    if (host) query.set("host", host);
    if (Number.isInteger(port) && port! >= 1 && port! <= 65535) query.set("port", String(port));
    const response = await fetch(`/api/tts?${query.toString()}`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}
