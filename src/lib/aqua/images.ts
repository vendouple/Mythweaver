import { aquaConfig, aquaFetch, type AquaFetchOptions } from "./client";

type ImageResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  url?: string;
  image?: string;
};

/**
 * Scene backdrops fill a TV (16:9); player and NPC cards use square portraits.
 * Keep framing in the prompt too for providers that do not accept dimensions.
 */
export type ImageAspect = "16:9" | "9:16" | "1:1";

/**
 * Pixel dimensions per aspect. Kept near common diffusion-friendly multiples of
 * 64 so providers that quantize dimensions don't silently re-crop.
 */
const ASPECT_SIZES: Record<ImageAspect, string> = {
  "16:9": "1344x768",
  "9:16": "768x1344",
  "1:1": "1024x1024"
};

/**
 * Not every OpenAI-compatible provider accepts `size` (or accepts these
 * particular dimensions). Rather than making every deployment configure that,
 * a failed sized request is retried WITHOUT `size` — and the parameter is only
 * abandoned for the rest of the process once that unsized retry actually
 * succeeds. That proof matters: latching on the failure alone would mean any
 * unrelated 400 (a content-policy refusal on a model-authored prompt, say)
 * silently cost every later image its framing, with only a restart to recover.
 */
const rejectedSizes = new Set<string>();

export async function generateImage(
  prompt: string,
  opts: { aspect?: ImageAspect; onRetry?: AquaFetchOptions["onRetry"] } = {}
) {
  const config = aquaConfig();
  const requestedSize = opts.aspect ? ASPECT_SIZES[opts.aspect] : undefined;
  const sizeKey = `${config.imageBaseUrl}|${config.imageModel}|${requestedSize}`;
  const size = rejectedSizes.has(sizeKey) ? undefined : requestedSize;
  const framing = opts.aspect === "1:1"
    ? "Square 1:1 character portrait, centered head and shoulders, face fully visible with space around the head, no text or borders."
    : opts.aspect === "16:9"
      ? "Wide landscape composition for a 16:9 cinematic backdrop, no text or borders."
      : opts.aspect === "9:16" ? "Tall 9:16 portrait composition, no text or borders." : "";
  const framedPrompt = [prompt.trim(), framing].filter(Boolean).join("\n\n");

  const fetchOptions: AquaFetchOptions = {
    baseUrl: config.imageBaseUrl,
    apiKey: config.imageApiKey,
    retries: Math.max(1, Number(process.env.IMAGE_RETRIES) || 3),
    timeoutMs: Math.max(5000, Number(process.env.IMAGE_TIMEOUT_MS) || 60000),
    onRetry: opts.onRetry
  };

  const send = async (withSize?: string) =>
    (await aquaFetch("/images/generations", {
      method: "POST",
      body: JSON.stringify({ model: config.imageModel, prompt: framedPrompt, ...(withSize ? { size: withSize } : {}) })
    }, fetchOptions)) as ImageResponse;

  let data: ImageResponse;
  try {
    data = await send(size);
  } catch (err) {
    // Authentication, rate limits and outages say nothing about size support.
    // Only downgrade framing on an explicit invalid/unsupported size response.
    const status = (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : String(err);
    if (!size || ![400, 422].includes(status || 0) || !/\b(size|dimensions?|resolution|aspect[ _-]?ratio)\b/i.test(message)) throw err;
    console.warn(`[Image] Sized request (size=${size}) failed; retrying without size. Cause: ${err instanceof Error ? err.message : String(err)}`);
    try {
      data = await send(undefined);
    } catch {
      throw err;
    }
    // The unsized retry worked where the sized one didn't — that's the evidence
    // needed to stop asking for a size at all.
    rejectedSizes.add(sizeKey);
    console.warn(`[Image] Provider does not accept size=${size}; omitting that size for this endpoint/model.`);
  }

  const first = data.data?.[0];
  const url = first?.url || data.url || data.image;
  const b64 = first?.b64_json;
  if (url) return { url, prompt };
  if (b64) return { url: `data:image/png;base64,${b64}`, prompt };
  throw new Error("Image generation response did not contain a URL or base64 image");
}
