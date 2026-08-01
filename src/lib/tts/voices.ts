import { readdir } from "fs/promises";
import path from "path";

/**
 * Server-only voice discovery.
 *
 * Reference voice prompts live under `public/voice`. We discover them by
 * scanning that directory (top-level files only) and accept a fixed set of
 * audio extensions. Voice ids are the bare filename stems — stable across
 * restarts as long as the underlying file does not change.
 *
 * This module is server-only: it touches the filesystem and must never be
 * imported from client components.
 */

const VOICE_EXTENSIONS = new Set([".wav", ".mp3", ".flac", ".ogg"]);
const VOICE_ID_MAX_LENGTH = 128;

export type VoiceInfo = {
  /** Stable voice id (the file stem, e.g. `clyde` for `clyde.wav`). */
  id: string;
  /** Original file name including extension. */
  fileName: string;
  /** Lower-cased extension (e.g. `.wav`). */
  extension: string;
};

function voiceDir(): string {
  return path.join(process.cwd(), "public", "voice");
}

/**
 * Discover available voices under `public/voice`. Returns a list sorted by
 * id. Missing directory or unreadable entries yield an empty list rather
 * than throwing.
 */
export async function listVoices(): Promise<VoiceInfo[]> {
  let entries;
  try {
    entries = await readdir(voiceDir(), { withFileTypes: true });
  } catch {
    return [];
  }

  const voices: VoiceInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!VOICE_EXTENSIONS.has(ext)) continue;
    const id = entry.name.slice(0, entry.name.length - ext.length);
    if (!isValidVoiceId(id)) continue;
    voices.push({ id, fileName: entry.name, extension: ext });
  }
  voices.sort((a, b) => a.id.localeCompare(b.id));
  return voices;
}

/**
 * Validate that a voice id is a safe, bare filename stem. Rejects anything
 * containing path separators, traversal segments, or absolute path markers.
 */
export function isValidVoiceId(id: string): boolean {
  if (!id || id.length > VOICE_ID_MAX_LENGTH) return false;
  if (id === "." || id === "..") return false;
  // Reject any path separators or drive/absolute markers.
  if (id.includes("/") || id.includes("\\")) return false;
  if (path.isAbsolute(id)) return false;
  // The id must round-trip as a plain basename.
  if (path.basename(id) !== id) return false;
  return true;
}

/**
 * Resolve a voice id to a discovered voice. Returns `undefined` when the id
 * is invalid or not present. Discovery is performed fresh on each call so
 * newly-added files are picked up without a restart.
 */
export async function getVoice(id: string): Promise<VoiceInfo | undefined> {
  if (!isValidVoiceId(id)) return undefined;
  const voices = await listVoices();
  return voices.find((v) => v.id === id);
}

/** Return just the stable voice ids, sorted. */
export async function listVoiceIds(): Promise<string[]> {
  const voices = await listVoices();
  return voices.map((v) => v.id);
}
