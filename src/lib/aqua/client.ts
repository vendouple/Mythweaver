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
  const baseUrl = process.env.BASE_URL || "";
  const apiKey = process.env.API_KEY || "";
  return {
    apiKey,
    baseUrl,
    chatModel: process.env.CHAT_MODEL || "",
    // Optional small/fast model for constrained HOUSEKEEPING ONLY (context
    // summarization/compaction so the large RP model never context-collapses).
    // It never directs live narration, ambience, effects, or backdrops — those
    // ALWAYS run on chatModel. Empty → housekeeping is skipped; the transcript
    // char budget below is the only safety net.
    fastModel: process.env.FAST_MODEL || "",
    // The small model may live on a DIFFERENT OpenAI-compatible provider. Each
    // field falls back to the main endpoint when left empty, so a same-provider
    // setup needs neither.
    fastBaseUrl: process.env.FAST_BASE_URL || baseUrl,
    fastApiKey: process.env.FAST_API_KEY || apiKey,
    imageModel: process.env.IMAGE_MODEL || "",
    // The image model may live on a DIFFERENT OpenAI-compatible provider. Each
    // field falls back to the main chat endpoint when left empty, so a
    // same-provider setup needs neither.
    imageBaseUrl: process.env.IMAGE_BASE_URL || baseUrl,
    imageApiKey: process.env.IMAGE_API_KEY || apiKey,
    // Character budget (NOT tokens) for the recent-transcript window handed to
    // the DM each turn. The chat model supports up to ~1M tokens of context,
    // but quality degrades well before that ceiling, so this stays a
    // conservative default rather than the true max. Configurable per-deployment.
    maxContextChars: Math.max(20_000, Number(process.env.MAX_CONTEXT_CHARS) || 250_000)
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
  /** Fixed wait between retries in ms. Falls back to RETRY_DELAY_MS (default 1000). */
  retryDelayMs?: number;
  /**
   * When true, delay grows with attempt number (attempt * retryDelayMs).
   * When false, every retry waits exactly retryDelayMs. Falls back to RETRY_BACKOFF.
   * Unstable APIs that just need hammering should leave this off.
   */
  retryBackoff?: boolean;
  /** Called just before each retry with the UPCOMING attempt number, so the TV can show "retrying (2/3)". */
  onRetry?: (info: AquaRetryInfo) => void;
  /** Override the base URL (e.g. the small or image model on a different provider). Falls back to BASE_URL. */
  baseUrl?: string;
  /** Override the bearer token for this request. Falls back to API_KEY. */
  apiKey?: string;
};

/** Parse RETRY_BACKOFF: 0/false/off/no → false; anything else truthy → true. Default false (fixed delay). */
function envRetryBackoff(): boolean {
  const v = String(process.env.RETRY_BACKOFF ?? "0").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function retryDelayForAttempt(attempt: number, delayMs: number, backoff: boolean): number {
  const base = Math.max(0, delayMs);
  return backoff ? attempt * base : base;
}

export async function aquaFetch(path: string, init: RequestInit, options: AquaFetchOptions | number = {}) {
  const config = aquaConfig();
  // Back-compat: a bare number used to mean `retries`.
  const opts: AquaFetchOptions = typeof options === "number" ? { retries: options } : options;
  const retries = Math.max(1, opts.retries ?? 6);
  const timeoutMs = opts.timeoutMs ?? 60000;
  const retryDelayMs = opts.retryDelayMs ?? (Number(process.env.RETRY_DELAY_MS) || 1000);
  const retryBackoff = opts.retryBackoff ?? envRetryBackoff();
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
          const delay = retryDelayForAttempt(attempt, retryDelayMs, retryBackoff);
          console.warn(`API error ${response.status} on attempt ${attempt}/${retries}. Retrying in ${delay / 1000}s...`);
          opts.onRetry?.({ attempt: attempt + 1, retries, status: response.status });
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt < retries) {
        const delay = retryDelayForAttempt(attempt, retryDelayMs, retryBackoff);
        console.warn(`Fetch failed on attempt ${attempt}/${retries}: ${error}. Retrying in ${delay / 1000}s...`);
        opts.onRetry?.({ attempt: attempt + 1, retries, error });
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
