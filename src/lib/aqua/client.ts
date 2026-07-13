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
  const baseUrl = process.env.AQUA_BASE_URL || "https://api.aquadevs.com/v1";
  const apiKey = process.env.AQUA_API_KEY || "";
  return {
    apiKey,
    baseUrl,
    chatModel: process.env.AQUA_CHAT_MODEL || "grok-4.3",
    // Optional small/fast model for constrained ancillary tasks (backdrop
    // director, theme picker, scene director). Empty → those fall back to the
    // main chat model. The main narrative DM turn ALWAYS uses chatModel.
    fastModel: process.env.FAST_MODEL || process.env.AQUA_FAST_MODEL || "",
    // The small model may live on a DIFFERENT OpenAI-compatible provider. Each
    // field falls back to the main endpoint when left empty, so a same-provider
    // setup needs neither.
    fastBaseUrl: process.env.FAST_BASE_URL || process.env.AQUA_FAST_BASE_URL || baseUrl,
    fastApiKey: process.env.FAST_API_KEY || process.env.AQUA_FAST_API_KEY || apiKey,
    imageModel: process.env.AQUA_IMAGE_MODEL || "gptimage-2"
  };
}

/**
 * Resolve the endpoint for a small/ancillary task: the fast model on its own
 * (possibly different) provider when one is configured, otherwise the main chat
 * model on the main endpoint. Pair the returned `model` with `options` on the
 * same aquaFetch call so the model and its base URL/key never mismatch.
 */
export function fastModelTarget(): { model: string; options: AquaFetchOptions } {
  const config = aquaConfig();
  if (config.fastModel) {
    return { model: config.fastModel, options: { baseUrl: config.fastBaseUrl, apiKey: config.fastApiKey } };
  }
  return { model: config.chatModel, options: {} };
}

/** Progress info reported just before a retry, so callers can surface it. */
export type AquaRetryInfo = { attempt: number; retries: number; status?: number; error?: unknown };

export type AquaFetchOptions = {
  /** Max attempts (default 6). Interactive DM turns pass a small number so a dead endpoint fails fast. */
  retries?: number;
  /** Per-attempt abort timeout in ms (default 60000). */
  timeoutMs?: number;
  /** Called just before each retry with the UPCOMING attempt number, so the TV can show "retrying (2/3)". */
  onRetry?: (info: AquaRetryInfo) => void;
  /** Override the base URL (e.g. the small model on a different provider). Falls back to AQUA_BASE_URL. */
  baseUrl?: string;
  /** Override the bearer token for this request. Falls back to AQUA_API_KEY. */
  apiKey?: string;
};

export async function aquaFetch(path: string, init: RequestInit, options: AquaFetchOptions | number = {}) {
  const config = aquaConfig();
  // Back-compat: a bare number used to mean `retries`.
  const opts: AquaFetchOptions = typeof options === "number" ? { retries: options } : options;
  const retries = Math.max(1, opts.retries ?? 6);
  const timeoutMs = opts.timeoutMs ?? 60000;
  const baseUrl = opts.baseUrl || config.baseUrl;
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : config.apiKey;
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
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
          console.warn(`Aqua API error ${response.status} on attempt ${attempt}/${retries}. Retrying in ${delay / 1000}s...`);
          opts.onRetry?.({ attempt: attempt + 1, retries, status: response.status });
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
        console.warn(`Aqua fetch failed on attempt ${attempt}/${retries}: ${error}. Retrying in ${delay / 1000}s...`);
        opts.onRetry?.({ attempt: attempt + 1, retries, error });
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
