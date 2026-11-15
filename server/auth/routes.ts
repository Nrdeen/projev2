import express from 'express';
import type { AuthDeps } from './middleware';
import { createAuthMiddleware } from './middleware';
import { buildSellerProfile, createUserRecord } from './accounts';
import { serializeClearCookie, serializeSessionCookie } from './cookies';
import { csrfTokenFor } from './csrf';
import { normalizeSaudiMobile, validatePassword } from './phone';
import { hashPassword, passwordNeedsRehash, verifyAgainstDummy, verifyPassword } from './password';
import { RateLimiter } from './rateLimit';
import { toSelfUser } from './serialize';

export interface AuthRouterDeps extends AuthDeps {
  saveStore: () => void;
  loginPhoneLimiter?: RateLimiter;
  loginIpLimiter?: RateLimiter;
  registerIpLimiter?: RateLimiter;
  /** Counts only registrations that hit an already-registered number (see the enumeration note in /register). */
  registerConflictIpLimiter?: RateLimiter;
}

const GENERIC_LOGIN_ERROR = 'رقم الجوال أو كلمة المرور غير صحيحة';

export function createAuthRouter(deps: AuthRouterDeps) {
  const { config, sessions } = deps;
  const { requireAuth } = createAuthMiddleware(deps);
  const router = express.Router();

  const loginPhoneLimiter = deps.loginPhoneLimiter || new RateLimiter({ max: 5, windowMs: 15 * 60_000 });
  const loginIpLimiter = deps.loginIpLimiter || new RateLimiter({ max: 30, windowMs: 15 * 60_000 });
  const registerIpLimiter = deps.registerIpLimiter || new RateLimiter({ max: config.registerMaxPerHour, windowMs: 60 * 60_000 });
  // A real person hits "number already registered" a couple of times at most; a script probing which numbers
  // have accounts hits it constantly. A much tighter budget for that outcome alone throttles the probing
  // without touching normal sign-ups.
  const registerConflictIpLimiter = deps.registerConflictIpLimiter || new RateLimiter({ max: 5, windowMs: 60 * 60_000 });

  const setSessionCookie = (res: express.Response, token: string) => {
    res.setHeader(
      'Set-Cookie',
      serializeSessionCookie(config.cookieName, token, { secure: config.cookieSecure, maxAgeMs: config.sessionAbsoluteMs })
    );
  };

  const tooMany = (res: express.Response, retryAfterMs: number) => {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    return res.status(429).json({ error: 'محاولات كثيرة، حاول مرة أخرى لاحقاً', code: 'rate_limited' });
  };

  // Current session state + a fresh CSRF token for the SPA.
  router.get('/me', (req, res) => {
    if (!req.auth) return res.json({ user: null, csrfToken: null });
    res.json({ user: toSelfUser(req.auth.user), csrfToken: req.auth.csrfToken });
  });

  router.post('/register', async (req, res) => {
    const ip = req.ip || 'unknown';
    const gate = registerIpLimiter.consume(`ip:${ip}`);
    if (!gate.allowed) return tooMany(res, gate.retryAfterMs);
    const conflictGate = registerConflictIpLimiter.check(`ip:${ip}`);
    if (!conflictGate.allowed) return tooMany(res, conflictGate.retryAfterMs);

    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = normalizeSaudiMobile(body.phone);
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: 'يرجى إدخال الاسم الكامل' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'رقم الجوال غير صحيح، استخدم صيغة 05XXXXXXXX' });
    }
    const pwError = validatePassword(body.password, phone);
    if (pwError) return res.status(400).json({ error: pwError });

    const store = deps.getStore();
    if (store.users.some((u) => u.phone === phone)) {
      // Account enumeration note: without a verification channel (SMS OTP) the sign-up form has to tell people
      // the number is taken, so the 409 stays and the UX is unchanged. What we can do is make probing costly:
      //  1. burn the same CPU time as a real sign-up (hashing), so response time does not reveal the outcome;
      //  2. count the hit against a tight per-IP "conflict" budget (above), after which the IP gets 429.
      // The complete fix (identical response for new and existing numbers) needs OTP verification:
      // see docs/PHASE1-SECURITY-NOTES.md.
      await verifyAgainstDummy(body.password);
      registerConflictIpLimiter.hit(`ip:${ip}`);
      return res.status(409).json({ error: 'رقم الجوال مسجل مسبقاً، سجّل الدخول بدلاً من ذلك' });
    }

    // The role is chosen server-side from a closed list: 'admin' can never be requested by a client.
    const role: 'buyer' | 'seller' = body.role === 'seller' ? 'seller' : 'buyer';
    const user = createUserRecord({ name, phone, role });
    store.users.push(user);
    if (role === 'seller') store.sellers.push(buildSellerProfile(user));
    store.credentials.push({ userId: user.id, passwordHash: await hashPassword(body.password), updatedAt: new Date().toISOString() });

    // Replace any session this browser already had (session fixation / account switch hygiene).
    if (req.auth) sessions.revoke(req.auth.session.id);
    const { token, session } = sessions.create(user.id, { ip, userAgent: req.header('user-agent') });
    deps.saveStore();

    setSessionCookie(res, token);
    res.status(201).json({ user: toSelfUser(user), csrfToken: csrfTokenFor(session.id, config.csrfSecret) });
  });

  router.post('/login', async (req, res) => {
    const ip = req.ip || 'unknown';
    // Only `phone` and `password` are read. `userId`, `role`, `name` in the body are ignored on purpose.
    const phone = normalizeSaudiMobile(req.body?.phone);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!phone || !password || password.length > 256) {
      return res.status(400).json({ error: 'أدخل رقم الجوال وكلمة المرور' });
    }

    const phoneKey = `phone:${phone}`;
    const ipKey = `ip:${ip}`;
    const blockedPhone = loginPhoneLimiter.check(phoneKey);
    if (!blockedPhone.allowed) return tooMany(res, blockedPhone.retryAfterMs);
    const blockedIp = loginIpLimiter.check(ipKey);
    if (!blockedIp.allowed) return tooMany(res, blockedIp.retryAfterMs);

    const store = deps.getStore();
    const user = store.users.find((u) => u.phone === phone);
    const credential = user ? store.credentials.find((c) => c.userId === user.id) : undefined;

    let valid = false;
    if (user && credential) {
      valid = await verifyPassword(credential.passwordHash, password);
    } else {
      await verifyAgainstDummy(password); // equalise timing for unknown / credential-less accounts
    }

    if (!valid || !user || !credential) {
      loginPhoneLimiter.hit(phoneKey);
      loginIpLimiter.hit(ipKey);
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'هذا الحساب موقوف، تواصل مع إدارة المنصة' });
    }

    loginPhoneLimiter.reset(phoneKey);
    if (await passwordNeedsRehash(credential.passwordHash)) {
      credential.passwordHash = await hashPassword(password);
      credential.updatedAt = new Date().toISOString();
    }

    // New session id on every login; the previous one (if any) is destroyed.
    if (req.auth) sessions.revoke(req.auth.session.id);
    const { token, session } = sessions.create(user.id, { ip, userAgent: req.header('user-agent') });
    deps.saveStore();

    setSessionCookie(res, token);
    res.json({ user: toSelfUser(user), csrfToken: csrfTokenFor(session.id, config.csrfSecret) });
  });

  router.post('/logout', (req, res) => {
    if (req.auth) sessions.revoke(req.auth.session.id);
    res.setHeader('Set-Cookie', serializeClearCookie(config.cookieName, config.cookieSecure));
    res.json({ ok: true });
  });

  router.post('/logout-all', requireAuth, (req, res) => {
    sessions.revokeAllForUser(req.auth!.user.id);
    res.setHeader('Set-Cookie', serializeClearCookie(config.cookieName, config.cookieSecure));
    res.json({ ok: true });
  });

  return router;
}
