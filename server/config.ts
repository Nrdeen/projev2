import crypto from 'node:crypto';

export interface AppConfig {
  isProd: boolean;
  port: number;
  dataDir: string;
  /** Origins (scheme://host[:port]) allowed to call mutating APIs and open WebSockets. */
  allowedOrigins: string[];
  /** HMAC secret used to derive CSRF tokens. Required in production. */
  csrfSecret: string;
  cookieName: string;
  cookieSecure: boolean;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  maxSessionsPerUser: number;
  /** Registrations allowed per client IP per hour. */
  registerMaxPerHour: number;
  /** Number of reverse-proxy hops to trust for req.ip (0 = none). */
  trustProxy: number;
  /** Dev-only: create demo credentials with random one-time passwords. Ignored in production. */
  demoAccounts: boolean;
  /** Time-to-live (ms) before unbound draft media uploads are cleaned up automatically. */
  unboundMediaTtlMs: number;
  /** Max active audit logs retained in store.json before oldest entries are safely archived to NDJSON (0 = unlimited). */
  auditLogMaxActive: number;
  /** Max read notifications retained per user in store.json (unread notifications are never trimmed; 0 = unlimited). */
  maxReadNotificationsPerUser: number;
}

const DAY = 24 * 60 * 60 * 1000;

function toOrigin(value: string): string | null {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

function intEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid numeric environment value: ${value}`);
  }
  return n;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<AppConfig> = {}
): AppConfig {
  const isProd = env.NODE_ENV === 'production';
  const port = intEnv(env.PORT, 3000, 0, 65535);

  const origins = new Set<string>();
  for (const raw of (env.ALLOWED_ORIGINS || '').split(',')) {
    if (!raw.trim()) continue;
    const o = toOrigin(raw);
    if (!o) throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${raw}`);
    origins.add(o);
  }
  if (env.APP_URL) {
    const o = toOrigin(env.APP_URL);
    if (o) origins.add(o);
  }
  if (!isProd) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
  }
  if (isProd && origins.size === 0) {
    throw new Error('Production requires ALLOWED_ORIGINS or APP_URL (e.g. https://souq.example.com).');
  }

  let csrfSecret = env.SESSION_SECRET || '';
  if (isProd) {
    if (csrfSecret.length < 32) {
      throw new Error('Production requires SESSION_SECRET with at least 32 characters.');
    }
  } else if (!csrfSecret) {
    csrfSecret = crypto.randomBytes(32).toString('hex');
  }

  const config: AppConfig = {
    isProd,
    port,
    dataDir: env.DATA_DIR || '',
    allowedOrigins: [...origins],
    csrfSecret,
    cookieName: isProd ? '__Host-sid' : 'sid',
    cookieSecure: isProd,
    sessionIdleMs: intEnv(env.SESSION_IDLE_DAYS, 7, 1, 90) * DAY,
    sessionAbsoluteMs: intEnv(env.SESSION_MAX_DAYS, 30, 1, 365) * DAY,
    maxSessionsPerUser: 10,
    registerMaxPerHour: 10,
    trustProxy: intEnv(env.TRUST_PROXY, 0, 0, 10),
    // Never available in production, whatever the environment says.
    demoAccounts: !isProd && env.DEMO_ACCOUNTS === 'true',
    unboundMediaTtlMs: intEnv(env.UNBOUND_MEDIA_TTL_MS, DAY, 100, 365 * DAY),
    auditLogMaxActive: intEnv(env.AUDIT_LOG_MAX_ACTIVE, 5000, 0, 100_000),
    maxReadNotificationsPerUser: intEnv(env.MAX_READ_NOTIFICATIONS_PER_USER, 200, 0, 10_000),
    ...overrides,
  };
  return config;
}
