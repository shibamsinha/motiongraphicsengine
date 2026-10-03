export class RateLimiter {
  #windowMs;
  #buckets = new Map();

  constructor(windowMinutes) {
    this.#windowMs = Math.max(1, windowMinutes) * 60_000;
  }

  check(key, limit) {
    if (!limit || limit <= 0) return { allowed: true, remaining: Infinity, resetMs: 0 };

    const now = Date.now();
    const bucket = this.#buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.#buckets.set(key, { count: 1, resetAt: now + this.#windowMs });
      this.#sweep(now);
      return { allowed: true, remaining: limit - 1, resetMs: this.#windowMs };
    }

    bucket.count += 1;
    const resetMs = bucket.resetAt - now;
    if (bucket.count > limit) {
      return { allowed: false, remaining: 0, resetMs };
    }
    return { allowed: true, remaining: limit - bucket.count, resetMs };
  }

  #sweep(now) {
    if (this.#buckets.size < 1000) return;
    for (const [key, bucket] of this.#buckets) {
      if (now >= bucket.resetAt) this.#buckets.delete(key);
    }
  }

  reset() {
    this.#buckets.clear();
  }
}

export const clientKey = (req, trustProxy) => {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress ?? 'unknown';
};
