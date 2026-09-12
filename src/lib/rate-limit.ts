import type { Env } from '../types';

export async function checkRateLimit(env: Env, key: string): Promise<boolean> {
  const windowSeconds = Number(env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
  const maxWrites = Number(env.RATE_LIMIT_MAX_WRITES ?? 30);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);

  const existing = await env.DB.prepare(
    'SELECT count, window_start FROM rate_limits WHERE key = ?'
  )
    .bind(key)
    .first<{ count: number; window_start: number }>();

  if (!existing || existing.window_start !== windowStart) {
    await env.DB.prepare(
      'INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start'
    )
      .bind(key, windowStart)
      .run();
    return true;
  }

  if (existing.count >= maxWrites) {
    return false;
  }

  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?')
    .bind(key)
    .run();
  return true;
}

export function clientKey(request: Request): string {
  const ip =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown';
  return `ip:${ip}`;
}
