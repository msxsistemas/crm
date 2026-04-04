import { randomBytes } from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF protection.
 *
 * Flow:
 *  1. On the first request (or GET /auth/csrf-token), a random token is set
 *     in a readable (non-httpOnly) cookie `csrf_token`.
 *  2. The frontend reads this cookie and sends it in the `X-CSRF-Token` header
 *     on every mutating request.
 *  3. This middleware validates the header matches the cookie.
 *
 * Requests authenticated via Bearer header are exempt — Bearer tokens are
 * inherently CSRF-safe because browsers don't auto-send custom headers.
 */
export function csrfMiddleware(fastify) {
  fastify.addHook('onRequest', async (req, reply) => {
    // Skip safe methods
    if (SAFE_METHODS.has(req.method)) return;

    // Skip if authenticated via Bearer (CSRF-safe by design)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return;

    // Skip for webhook endpoints (no cookie auth)
    if (req.url.startsWith('/webhook/') || req.url.startsWith('/meta-webhook')) return;

    // Skip pre-authentication endpoints — no cookie/CSRF token exists yet
    const PRE_AUTH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
    if (PRE_AUTH.some(p => req.url.startsWith(p))) return;

    const cookieToken = req.cookies?.csrf_token;
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return reply.status(403).send({ error: 'CSRF token inválido' });
    }
  });
}

/** Set a fresh CSRF token cookie (readable by JS, not httpOnly) */
export function refreshCsrfToken(reply) {
  const token = randomBytes(32).toString('hex');
  reply.setCookie('csrf_token', token, {
    httpOnly: false, // must be readable by JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 1 day
  });
  return token;
}
