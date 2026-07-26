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

/**
 * A named narration target the host can manually switch to after a provider
 * failure. Each target is resolved SERVER-SIDE from environment variables —
 * the campaign JSON stores only the alias id, never credentials. The default
 * target ("default") is the legacy CHAT_MODEL/BASE_URL/API_KEY triple.
 *
 * Additional targets are declared with a numbered prefix, e.g.:
 *   CHAT_TARGET_1_ALIAS=gemini
 *   CHAT_TARGET_1_MODEL=gemini-3.6
 *   CHAT_TARGET_1_BASE_URL=https://...
 *   CHAT_TARGET_1_API_KEY=...
 *   CHAT_TARGET_1_LABEL=Gemini 3.6
 *
 * Targets are validated at resolution time: a target whose model is empty is
 * skipped. The UI receives alias + label + whether it's the current selection;
 * it never sees base URLs or keys.
 */
export type ChatTargetSummary = {
  id: string;
  alias: string;
  label: string;
  model: string;
};

export type ChatTarget = {
  id: string;
  alias: string;
  label: string;
  model: string;
  baseUrl: string;
  apiKey: string;
};

/** The default target id — always resolves to CHAT_MODEL/BASE_URL/API_KEY. */
export const DEFAULT_CHAT_TARGET_ID = "default";

/**
 * Resolve a single chat target by id (alias). Falls back to the default
 * (CHAT_MODEL/BASE_URL/API_KEY) when the id is unknown or the named target
 * is misconfigured. Never throws — an unknown target returns the default so
 * a stale campaign.json selection can never brick narration.
 */
export function resolveChatTarget(targetId?: string): ChatTarget {
  const config = aquaConfig();
  const defaultTarget: ChatTarget = {
    id: DEFAULT_CHAT_TARGET_ID,
    alias: "default",
    label: process.env.CHAT_TARGET_DEFAULT_LABEL || config.chatModel || "Default",
    model: config.chatModel,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey
  };
  if (!targetId || targetId === DEFAULT_CHAT_TARGET_ID) return defaultTarget;

  const target = findChatTarget(targetId);
  return target || defaultTarget;
}

/**
 * List all configured chat targets for the host selector UI. The default
 * target is always first. Returns alias + label + model only — never base
 * URLs or API keys. Used by the party API to populate the Director's Drawer.
 */
export function listChatTargets(): ChatTargetSummary[] {
  const config = aquaConfig();
  const summaries: ChatTargetSummary[] = [{
    id: DEFAULT_CHAT_TARGET_ID,
    alias: "default",
    label: process.env.CHAT_TARGET_DEFAULT_LABEL || config.chatModel || "Default",
    model: config.chatModel
  }];
  for (const t of readNamedChatTargets()) {
    summaries.push({ id: t.id, alias: t.alias, label: t.label, model: t.model });
  }
  return summaries;
}

/** Internal: read all CHAT_TARGET_N_* groups from env, in index order. */
function readNamedChatTargets(): ChatTarget[] {
  const targets: ChatTarget[] = [];
  const config = aquaConfig();
  // Scan indices 1..20 — more than enough for any deployment, and bounded so
  // a typo can't spin a huge loop.
  for (let i = 1; i <= 20; i += 1) {
    const alias = (process.env[`CHAT_TARGET_${i}_ALIAS`] || "").trim();
    if (!alias) continue;
    const model = (process.env[`CHAT_TARGET_${i}_MODEL`] || "").trim();
    if (!model) continue; // a target with no model is unusable; skip it
    const baseUrl = (process.env[`CHAT_TARGET_${i}_BASE_URL`] || config.baseUrl).trim();
    const apiKey = (process.env[`CHAT_TARGET_${i}_API_KEY`] || config.apiKey).trim();
    const label = (process.env[`CHAT_TARGET_${i}_LABEL`] || alias).trim();
    targets.push({ id: alias, alias, label, model, baseUrl, apiKey });
  }
  return targets;
}

/** Internal: find a named target by alias (case-insensitive). */
function findChatTarget(targetId: string): ChatTarget | null {
  const needle = targetId.trim().toLowerCase();
  if (!needle) return null;
  for (const t of readNamedChatTargets()) {
    if (t.alias.toLowerCase() === needle) return t;
  }
  return null;
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

/**
 * Hard ceiling on per-request retries. Prevents a misconfigured env value
 * (e.g. INTERACTIVE_RETRIES=1000) from trapping a turn on one dead provider
 * for an hour. The observed "attempt 1/1000" log proves this clamp is needed.
 */
const MAX_RETRIES_HARD_CAP = 10;

/** Parse RETRY_BACKOFF: 0/false/off/no → false; anything else truthy → true. Default false (fixed delay). */
function envRetryBackoff(): boolean {
  const v = String(process.env.RETRY_BACKOFF ?? "0").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function retryDelayForAttempt(attempt: number, delayMs: number, backoff: boolean): number {
  const base = Math.max(0, delayMs);
  return backoff ? attempt * base : base;
}

/**
 * A deliberate abort signal: when the host manually switches the narration
 * provider mid-request, the in-flight fetch is aborted so the turn can be
 * re-issued on the new target. This must NOT be treated as a timeout retry —
 * it's an intentional cancellation. Throw an instance of this class so the
 * retry loop can distinguish it from a network/timeout abort.
 */
export class AquaAbortError extends Error {
  constructor(message = "Request aborted by host action") {
    super(message);
    this.name = "AquaAbortError";
  }
}

/**
 * Classify a failure to decide whether the retry loop should attempt again.
 *
 * Retryable (transient): network errors, timeouts/aborts caused by the
 *   timeout, HTTP 408, 429, and 5xx.
 * Non-retryable (permanent): other 4xx — including unsupported tools/model
 *   capability errors (400 "does not support tools"), invalid model, invalid
 *   request/schema, and authentication/authorization failures (401/403).
 *
 * A deliberate host abort (AquaAbortError) is never retried.
 */
export function isRetryableError(error: unknown, status?: number): boolean {
  if (error instanceof AquaAbortError) return false;
  if (typeof status === "number") {
    if (status === 408 || status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false; // other 4xx are permanent
  }
  // No HTTP status → network/timeout error. AbortError from a timeout
  // controller is retryable; AquaAbortError (host switch) is not (handled above).
  if (error instanceof Error) {
    const name = error.name;
    if (name === "AbortError") return true; // timeout-induced abort
    if (name === "TypeError") return true; // fetch network failure
    if (name === "FetchError") return true;
  }
  return true; // unknown error: be conservative and retry once
}

/**
 * Extract a stable error code/summary from a failed response body for logging.
 * Returns undefined when the body held no recognizable code.
 */
export function classifyHttpError(status: number, body: unknown): { code?: string; message: string } {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  // Common OpenAI-compatible capability/shape errors.
  const lower = text.toLowerCase();
  if (lower.includes("does not support tools") || lower.includes("tool calls are not supported")) {
    return { code: "unsupported_tools", message: text.slice(0, 200) };
  }
  if (lower.includes("does not support") || lower.includes("not supported")) {
    return { code: "unsupported_feature", message: text.slice(0, 200) };
  }
  if (lower.includes("invalid model") || lower.includes("model not found") || lower.includes("does not exist")) {
    return { code: "invalid_model", message: text.slice(0, 200) };
  }
  if (status === 401 || status === 403) {
    return { code: "auth", message: text.slice(0, 200) };
  }
  return { message: text.slice(0, 200) };
}

export async function aquaFetch(path: string, init: RequestInit, options: AquaFetchOptions | number = {}) {
  const config = aquaConfig();
  // Back-compat: a bare number used to mean `retries`.
  const opts: AquaFetchOptions = typeof options === "number" ? { retries: options } : options;
  // Clamp retries to a hard ceiling so a misconfigured env value (e.g. 1000)
  // can never trap a turn on one dead provider. The observed "attempt 1/1000"
  // log proves this clamp is required.
  const retries = Math.min(Math.max(1, opts.retries ?? 6), MAX_RETRIES_HARD_CAP);
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
        // Classify before retrying: permanent 4xx (capability/auth/schema)
        // errors must NOT be retried — they cannot recover. Only 408/429/5xx
        // are transient. This stops the observed six-retry loop on a
        // "does not support tools" 400 response.
        if (attempt < retries && isRetryableError(null, response.status)) {
          const delay = retryDelayForAttempt(attempt, retryDelayMs, retryBackoff);
          console.warn(`API error ${response.status} on attempt ${attempt}/${retries}. Retrying in ${delay / 1000}s...`);
          opts.onRetry?.({ attempt: attempt + 1, retries, status: response.status });
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        const classified = classifyHttpError(response.status, data);
        const err = new Error(`API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
        // Attach classification so callers (and logs) can surface the reason.
        (err as any).status = response.status;
        (err as any).code = classified.code;
        throw err;
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      // A deliberate host abort is never retried — propagate immediately so
      // the turn can be re-issued on the newly selected provider.
      if (error instanceof AquaAbortError) throw error;
      if (attempt < retries && isRetryableError(error)) {
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
