/**
 * Which backend synthesizes narration audio. Server-only (reads env).
 *
 *   TTS_PROVIDER=local (default) — the self-hosted Chatterbox sidecar
 *     (`TTS/main.py`), reached at the campaign's host/port or TTS_SIDECAR_URL.
 *   TTS_PROVIDER=api — any OpenAI-compatible `POST {base}/audio/speech`
 *     endpoint (OpenAI, or a compatible proxy/provider). Nothing to self-host;
 *     you pay that provider per character instead.
 */

export type TtsProvider = "local" | "api";

/** OpenAI's built-in speech voices (gpt-4o-mini-tts supports all of them; tts-1 a subset). */
const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"];

const AUDIO_FORMATS: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  opus: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
};

export type TtsApiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  voices: string[];
  defaultVoice: string;
  format: string;
  contentType: string;
  instructions: string;
  speed?: number;
};

export function ttsProvider(): TtsProvider {
  const raw = String(process.env.TTS_PROVIDER ?? "").toLowerCase().trim();
  return raw === "api" || raw === "openai" || raw === "hosted" ? "api" : "local";
}

export function ttsApiConfig(): TtsApiConfig {
  const voices = String(process.env.TTS_API_VOICES ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const list = voices.length ? voices : OPENAI_VOICES;
  const requestedDefault = String(process.env.TTS_API_DEFAULT_VOICE ?? "").trim();
  const rawFormat = String(process.env.TTS_API_FORMAT ?? "mp3").toLowerCase().trim();
  const format = AUDIO_FORMATS[rawFormat] ? rawFormat : "mp3";
  const speed = Number(process.env.TTS_API_SPEED);
  return {
    baseUrl: (process.env.TTS_API_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: process.env.TTS_API_KEY?.trim() || "",
    model: process.env.TTS_API_MODEL?.trim() || "gpt-4o-mini-tts",
    voices: list,
    defaultVoice: list.includes(requestedDefault) ? requestedDefault : list[0],
    format,
    contentType: AUDIO_FORMATS[format],
    instructions: process.env.TTS_API_INSTRUCTIONS?.trim() || "",
    speed: Number.isFinite(speed) && speed >= 0.25 && speed <= 4 ? speed : undefined,
  };
}
