import { aquaConfig, aquaFetch } from "./client";

type ImageResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  url?: string;
  image?: string;
};

export async function generateImage(prompt: string) {
  const config = aquaConfig();
  const data = (await aquaFetch("/images/generations", {
    method: "POST",
    body: JSON.stringify({ model: config.imageModel, prompt })
  }, {
    baseUrl: config.imageBaseUrl,
    apiKey: config.imageApiKey
  })) as ImageResponse;

  const first = data.data?.[0];
  const url = first?.url || data.url || data.image;
  const b64 = first?.b64_json;
  if (url) return { url, prompt };
  if (b64) return { url: `data:image/png;base64,${b64}`, prompt };
  throw new Error("Image generation response did not contain a URL or base64 image");
}
