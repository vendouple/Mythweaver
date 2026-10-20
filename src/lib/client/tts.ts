"use client";

export type TtsServerStatus = {
  online: boolean;
  /** "api" when TTS_PROVIDER=api (hosted /audio/speech); "local" for the Chatterbox sidecar. */
  provider: "local" | "api";
  /** Hosted model name, when provider is "api". */
  model?: string;
};

/**
 * Probe the configured narration backend. For the local sidecar this checks
 * the host/port is reachable; for a hosted API it reports whether the server
 * is configured (key present) without spending a request.
 */
export async function ttsServerStatus(host?: string, port?: number): Promise<TtsServerStatus> {
  try {
    const query = new URLSearchParams({ action: "health" });
    if (host) query.set("host", host);
    if (Number.isInteger(port) && port! >= 1 && port! <= 65535) query.set("port", String(port));
    const response = await fetch(`/api/tts?${query.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { provider?: string; model?: string };
    const provider = data.provider === "api" ? "api" : "local";
    return { online: response.ok, provider, model: typeof data.model === "string" ? data.model : undefined };
  } catch {
    return { online: false, provider: "local" };
  }
}

/**
 * Whether narration speech can be produced right now (local Chatterbox
 * sidecar reachable, or a hosted TTS API configured). Used to gate the
 * "enable narration" control.
 */
export async function ttsSidecarHealthy(host?: string, port?: number): Promise<boolean> {
  return (await ttsServerStatus(host, port)).online;
}
