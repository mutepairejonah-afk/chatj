/**
 * Lightweight in-memory rate limiter for server functions.
 * Resets automatically after the time window elapses.
 * Safe for single-instance deployments (Replit / Node).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Prune stale buckets every 10 minutes so the map doesn't grow unbounded
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of store.entries()) {
      if (now > bucket.resetAt) store.delete(key);
    }
  },
  10 * 60 * 1000
);

/**
 * @returns true if the request is allowed, false if rate-limited.
 * @param key        Unique identifier (e.g. "ai:{clerkUserId}" or "socket:{ip}")
 * @param maxReqs    Maximum requests allowed within the window
 * @param windowMs   Time window in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxReqs: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now > bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= maxReqs) return false;
  bucket.count++;
  return true;
}

/**
 * Sanitize user-provided text: strip HTML tags and normalise whitespace.
 * Prevents stored-XSS when chat content is later rendered in admin tools.
 */
export function sanitizeText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
}
