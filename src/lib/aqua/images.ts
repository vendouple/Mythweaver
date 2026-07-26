import { aquaConfig, aquaFetch, type AquaFetchOptions } from "./client";

type ImageResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  url?: string;
  image?: string;
};

/**
 * Framing for a generated image. Scene backdrops fill a TV (16:9); portraits
 * are shown in tall phone/talisman frames (9:16); square suits anything that
 * shouldn't be cropped either way. Without this, a square image stretched
 * across the TV or letterboxed into a portrait frame wastes most of the
 * generation.
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
let sizeRejected = false;

export async function generateImage(
  prompt: string,
  opts: { aspect?: ImageAspect; onRetry?: AquaFetchOptions["onRetry"] } = {}
) {
  const config = aquaConfig();
  const size = !sizeRejected && opts.aspect ? ASPECT_SIZES[opts.aspect] : undefined;

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
      body: JSON.stringify({ model: config.imageModel, prompt, ...(withSize ? { size: withSize } : {}) })
    }, fetchOptions)) as ImageResponse;

  let data: ImageResponse;
  try {
    data = await send(size);
  } catch (err) {
    // A sized request that failed might have failed BECAUSE of the size, so try
    // once more without it — an unsized image still beats no image, and a
    // provider that dislikes the parameter (or these particular dimensions)
    // must not be able to take image generation down entirely. Deliberately not
    // restricted to 400: providers disagree about which status a rejected
    // parameter earns. If the unsized attempt fails too, the original error
    // propagates and `size` is NOT blamed.
    if (!size) throw err;
    console.warn(`[Image] Sized request (size=${size}) failed; retrying without size. Cause: ${err instanceof Error ? err.message : String(err)}`);
    data = await send(undefined);
    // The unsized retry worked where the sized one didn't — that's the evidence
    // needed to stop asking for a size at all.
    sizeRejected = true;
    console.warn(`[Image] Provider does not accept size=${size}; dropping the size parameter for the rest of this process.`);
  }

  const first = data.data?.[0];
  const url = first?.url || data.url || data.image;
  const b64 = first?.b64_json;
  if (url) return { url, prompt };
  if (b64) return { url: `data:image/png;base64,${b64}`, prompt };
  throw new Error("Image generation response did not contain a URL or base64 image");
}
