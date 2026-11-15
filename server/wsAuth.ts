import type { AppConfig } from './config';
import { parseCookies } from './auth/cookies';
import { isAllowedOrigin } from './auth/csrf';
import type { SessionManager } from './auth/sessions';

export type UpgradeAuthResult =
  | { ok: true; userId: string; sessionId: string }
  | { ok: false; status: 401 | 403 };

/**
 * Decides whether a WebSocket handshake may proceed. Identity comes ONLY from the session cookie;
 * the Origin must be on the allow-list. Pure function so it can be unit-tested without sockets.
 */
export function authenticateUpgrade(
  headers: { origin?: string; cookie?: string },
  deps: {
    config: Pick<AppConfig, 'allowedOrigins' | 'cookieName'>;
    sessions: Pick<SessionManager, 'validate'>;
    findUser: (id: string) => { id: string; status?: string } | undefined;
  }
): UpgradeAuthResult {
  if (!isAllowedOrigin(headers.origin, deps.config.allowedOrigins)) return { ok: false, status: 403 };
  const token = parseCookies(headers.cookie)[deps.config.cookieName];
  const session = deps.sessions.validate(token);
  if (!session) return { ok: false, status: 401 };
  const user = deps.findUser(session.userId);
  if (!user || user.status !== 'active') return { ok: false, status: 401 };
  return { ok: true, userId: user.id, sessionId: session.id };
}
