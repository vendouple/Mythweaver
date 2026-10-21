import { createHash, randomBytes } from "crypto";
import { mkdir, rename, rm, writeFile } from "fs/promises";
import path from "path";

/**
 * Campaign image assets on disk, plus the atomic-write helper the store uses.
 *
 * Image providers may answer with a URL or with base64 (`b64_json`). Base64
 * must never live inside campaign.json: a handful of 300 KB portraits made a
 * save 2.8 MB, every poll re-read it, and because the DM context lists image
 * URLs, the inlined bytes pushed a turn past the model's context window
 * (2,067,374 tokens) — after which every turn failed. Images are written to
 * the campaign folder under a content hash and referenced by a short
 * /api/campaigns/<id>/assets URL instead.
 */

export type ImageCategory = "players" | "npcs" | "backgrounds" | "inline";

const dataRoot = path.join(process.cwd(), "data", "campaigns");

const DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
/** Long enough to be real image bytes, not a 1×1 placeholder. */
const INLINE_MIN_LENGTH = 256;

function safe(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function isInlineImage(value: unknown): value is string {
  return typeof value === "string" && value.length > INLINE_MIN_LENGTH && DATA_IMAGE.test(value);
}

/** Sniff the real format; providers label everything "png". */
export function imageExtension(buffer: Buffer, hint?: string | null): "png" | "jpg" | "webp" | "gif" {
  if (buffer.length > 12) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
    if (buffer.toString("ascii", 0, 3) === "GIF") return "gif";
  }
  const h = (hint || "").toLowerCase();
  if (h.includes("jpeg") || h.includes("jpg")) return "jpg";
  if (h.includes("webp")) return "webp";
  if (h.includes("gif")) return "gif";
  return "png";
}

/**
 * Write image bytes under a content-hashed name and return the asset URL.
 * Hashed names matter twice over: identical bytes dedupe to one file, and a
 * regenerated portrait gets a NEW url — the asset route serves with
 * `immutable` caching, so reusing "<id>.png" left browsers showing the old face.
 */
export async function saveImageBuffer(
  campaignId: string,
  buffer: Buffer,
  category: ImageCategory,
  subId?: string,
  typeHint?: string | null
): Promise<string> {
  const ext = imageExtension(buffer, typeHint);
  const hash = createHash("sha1").update(buffer).digest("hex").slice(0, 20);
  const relativeDir = subId && (category === "players" || category === "npcs") ? `${category}/${safe(subId)}` : category;
  const destDir = path.join(dataRoot, safe(campaignId), ...relativeDir.split("/"));
  await mkdir(destDir, { recursive: true });
  const filename = `${hash}.${ext}`;
  await writeFile(path.join(destDir, filename), buffer);
  return `/api/campaigns/${safe(campaignId)}/assets?path=${encodeURIComponent(`${relativeDir}/${filename}`)}`;
}

export function decodeInlineImage(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is);
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  return buffer.length ? { buffer, mime: match[1] } : null;
}

/**
 * Replace every inline `data:image` string anywhere in a campaign-shaped
 * object with an asset URL (in place). Returns how many were moved out. Used
 * on load (to heal saves written before this existed) and before every write.
 */
// Memo across calls: until a legacy save is rewritten, every poll re-reads
// the same inline strings — don't re-hash and re-write them each time.
const inlineMemo: Map<string, string> = ((globalThis as any).__inlineImageMemo ??= new Map<string, string>());
function memoKey(campaignId: string, value: string) {
  return `${campaignId}|${createHash("sha256").update(value).digest("hex")}`;
}

export async function externalizeInlineImages(campaignId: string, root: unknown): Promise<number> {
  let moved = 0;
  const visit = async (node: unknown): Promise<void> => {
    if (!node || typeof node !== "object") return;
    const entries: Array<[string | number, unknown]> = Array.isArray(node) ? node.map((v, i) => [i, v]) : Object.entries(node);
    for (const [key, value] of entries) {
      if (isInlineImage(value)) {
        const memo = memoKey(campaignId, value);
        let url = inlineMemo.get(memo);
        if (!url) {
          const decoded = decodeInlineImage(value);
          if (!decoded) continue;
          url = await saveImageBuffer(campaignId, decoded.buffer, "inline", undefined, decoded.mime);
          if (inlineMemo.size > 500) inlineMemo.clear();
          inlineMemo.set(memo, url);
        }
        (node as Record<string | number, unknown>)[key] = url;
        moved += 1;
      } else if (value && typeof value === "object") {
        await visit(value);
      }
    }
  };
  await visit(root);
  return moved;
}

/**
 * Crash- and reader-safe file write: write a sibling temp file, then rename
 * it over the target. A poll that reads campaign.json mid-save now sees the
 * old or the new file, never half of one ("save is corrupt (invalid JSON)").
 * Windows refuses the rename while another handle has the target open
 * (EPERM/EBUSY/EACCES), so retry briefly before falling back to a plain write.
 */
export async function writeFileAtomic(target: string, data: string | Buffer) {
  const temp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, data, typeof data === "string" ? "utf8" : undefined);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temp, target);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (!["EPERM", "EBUSY", "EACCES"].includes(code || "") || attempt >= 6) {
        // Last resort: a direct write still beats losing the save.
        await rm(temp, { force: true }).catch(() => undefined);
        if (attempt >= 6) {
          await writeFile(target, data, typeof data === "string" ? "utf8" : undefined);
          return;
        }
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}
