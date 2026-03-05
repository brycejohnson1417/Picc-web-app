import 'server-only';

interface Entry {
  count: number;
  resetAt: number;
}

interface Options {
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const rateLimitStore = new Map<string, Entry>();

export function getClientIdentifier(request: Request, fallback: string) {
  const ipHeader = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
  const ip = ipHeader?.split(',')[0]?.trim();
  return ip || fallback;
}

export function enforceRateLimit(options: Options): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(options.key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    rateLimitStore.set(options.key, { count: 1, resetAt });
    return {
      ok: true,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  existing.count += 1;
  rateLimitStore.set(options.key, existing);

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  const remaining = Math.max(0, options.limit - existing.count);

  if (existing.count > options.limit) {
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  return { ok: true, remaining, retryAfterSeconds };
}
