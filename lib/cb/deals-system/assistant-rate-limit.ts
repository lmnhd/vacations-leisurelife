/**
 * In-memory sliding-window rate limiter for the booking-portal assistant.
 *
 * Deliberately simple: a single-process Map, sized for the dev-gated booking
 * portal's traffic. Each free-text assistant question bills real LLM tokens, so
 * this caps how many a single caller (keyed by IP + browser session) can fire
 * in a short window before the route starts returning 429s.
 *
 * NOT a distributed limiter — if the booking portal is ever served from
 * multiple instances, move this to a shared store (e.g. the Dynamo/Redis path
 * the rest of the deals system uses). Until then, per-instance is sufficient.
 */

interface WindowState {
  /** Epoch-ms timestamps of accepted hits still inside the window. */
  hits: number[];
}

export interface RateLimitConfig {
  /** Max accepted requests per key within `windowMs`. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window after this call. */
  remaining: number;
  /** Seconds until the caller may retry (only meaningful when blocked). */
  retryAfterSeconds: number;
}

const DEFAULT_CONFIG: RateLimitConfig = { limit: 8, windowMs: 60_000 };

const buckets = new Map<string, WindowState>();

// Opportunistic sweep so abandoned keys don't accumulate forever. Runs at most
// once per this interval, on the request path (no background timer needed).
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweep = 0;

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, state] of buckets) {
    if (state.hits.length === 0 || now - state.hits[state.hits.length - 1] > windowMs) {
      buckets.delete(key);
    }
  }
}

/**
 * Record and evaluate one request against `key`. Returns whether it's allowed
 * and, if not, how long to wait. A rejected request does NOT consume quota.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  const now = Date.now();
  const { limit, windowMs } = config;
  sweep(now, windowMs);

  const state = buckets.get(key) ?? { hits: [] };
  // Drop timestamps that have aged out of the window.
  const windowStart = now - windowMs;
  state.hits = state.hits.filter((ts) => ts > windowStart);

  if (state.hits.length >= limit) {
    buckets.set(key, state);
    const oldest = state.hits[0];
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  state.hits.push(now);
  buckets.set(key, state);
  return {
    allowed: true,
    remaining: Math.max(0, limit - state.hits.length),
    retryAfterSeconds: 0,
  };
}

/** Best-effort client IP from proxy headers, falling back to a shared bucket. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
