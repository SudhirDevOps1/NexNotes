import { NextRequest, NextResponse } from "next/server";

/**
 * v2.3.2 — tiny in-memory rate limiter for the auth-sensitive endpoints.
 *
 * Why: the password surfaces (login, verify-password, reset-password,
 * change-password) had no brute-force protection at all — only the 2FA code
 * check did. Self-host friendly on purpose: a fixed-window counter per key,
 * no Redis, resets on restart. Single-instance accurate; multi-instance
 * deployments get per-node limits (still a large multiplier on attacker
 * cost — document AUTH_SECRET-style env config if that ever matters).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so the map cannot grow forever under attack. */
function sweep(now: number) {
  if (buckets.size < 4096) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** First hop of x-forwarded-for, else a stable local placeholder. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return "local";
}

/**
 * Uniform 429 for every protected endpoint. `scope` namespaces the bucket
 * (e.g. "login", "verify-pw"); `identity` is the user/email/ip dimension.
 */
export function guard(
  req: NextRequest,
  scope: string,
  identity: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const { ok, retryAfterSec } = rateLimit(`${scope}:${identity}`, limit, windowMs);
  if (ok) return null;
  return NextResponse.json(
    { error: `Too many attempts — try again in ${retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

/* shared windows */
export const MIN_5 = 5 * 60 * 1000;
export const HOUR_1 = 60 * 60 * 1000;
