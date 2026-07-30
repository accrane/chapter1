import type { Request, Response, NextFunction } from 'express';

// Fixed-window in-memory rate limiter. Per-process state is fine for a
// single-instance deployment; swap for something shared if we ever scale out.
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

export function rateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // On Fly the client IP arrives via Fly-Client-IP / X-Forwarded-For.
    const ip =
      (req.headers['fly-client-ip'] as string) ??
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
      req.socket.remoteAddress ??
      'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }
    next();
  };
}
