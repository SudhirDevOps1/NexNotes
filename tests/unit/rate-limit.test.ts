import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * v2.3.2 — the fixed-window limiter guarding login / verify-password /
 * reset-password / change-password. Self-host contract: per-key counters,
 * no external store, window expiry restores access.
 */

describe("rate limiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows requests up to the limit, then blocks with a retry hint", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("test:a", 5, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit("test:a", 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("keys are independent buckets", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    expect(rateLimit("k1", 1, 60_000).ok).toBe(true);
    expect(rateLimit("k1", 1, 60_000).ok).toBe(false);
    expect(rateLimit("k2", 1, 60_000).ok).toBe(true); // untouched by k1
  });

  it("the window expiring restores access", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    expect(rateLimit("w", 1, 60_000).ok).toBe(true);
    expect(rateLimit("w", 1, 60_000).ok).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(rateLimit("w", 1, 60_000).ok).toBe(true);
  });
});
