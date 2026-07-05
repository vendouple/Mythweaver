export type AquaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AquaToolCall[];
};

export type AquaToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AquaToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export function aquaConfig() {
  return {
    apiKey: process.env.AQUA_API_KEY || "",
    baseUrl: process.env.AQUA_BASE_URL || "https://api.aquadevs.com/v1",
    chatModel: process.env.AQUA_CHAT_MODEL || "grok-4.3",
    imageModel: process.env.AQUA_IMAGE_MODEL || "gptimage-2"
  };
}

export async function aquaFetch(path: string, init: RequestInit, retries = 6) {
  const config = aquaConfig();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (config.apiKey) headers.set("authorization", `Bearer ${config.apiKey}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

    try {
      const response = await fetch(`${config.baseUrl}${path}`, { 
        ...init, 
        headers,
        signal: controller.signal
      });
      const text = await response.text();
      clearTimeout(timeoutId);
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!response.ok) {
        if ((response.status >= 500 || response.status === 429) && attempt < retries) {
          const delay = attempt * 3000;
          console.warn(`Aqua API error ${response.status} on attempt ${attempt}. Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Aqua API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt < retries) {
        const delay = attempt * 3000;
        console.warn(`Aqua fetch failed on attempt ${attempt}: ${error}. Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
