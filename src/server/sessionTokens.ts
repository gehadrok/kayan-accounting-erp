import crypto from 'crypto';

/**
 * PHASE 10.0.1 — signed session tokens.
 *
 * Why this exists: the company-settings write endpoints used to accept the
 * acting user from `req.body.userId` / `x-user-id`. Both are supplied by the
 * browser, so ANY caller could claim an administrator's UUID and inherit that
 * account's permissions. A browser-supplied identifier is not proof of identity.
 *
 * A token issued by the server after a successful credential check is: the
 * signature cannot be forged without the secret, and the payload is bound to
 * the authenticated user. The write endpoints therefore resolve identity ONLY
 * from a verified token and ignore client-supplied ids entirely.
 *
 * The project has no session framework, so this is a deliberately small,
 * self-contained primitive rather than a parallel auth system. It plugs into
 * the EXISTING /auth/login and the EXISTING RBAC tables.
 */

interface TokenPayload {
  /** user id */
  sub: string;
  username: string;
  /** issued-at / expiry, seconds since epoch */
  iat: number;
  exp: number;
}

const TTL_SECONDS = 8 * 60 * 60; // 8 hours

/**
 * PHASE 10.5.3 — signing secret resolution.
 *
 * Development (NODE_ENV !== 'production'): when KAYAN_SESSION_SECRET is
 * absent, an ephemeral per-process secret is generated. Tokens then die on
 * every restart — safe, but sessions are not durable.
 *
 * Production: an ephemeral secret is NOT acceptable — a restart would silently
 * sign every user out, and two instances could never accept each other's
 * tokens. The server refuses to sign (and refuses to boot — see
 * assertSessionSecretReady, called by server.ts) without a configured secret.
 *
 * Rules: never log or print the secret; never hardcode one in the source; a
 * configured secret is used as-is (never silently replaced). Rotating the
 * value invalidates EVERY previously issued token — they were signed with the
 * old secret — so rotate only deliberately.
 */
let cachedSecret: string | null = null;

function resolveSessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.KAYAN_SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'KAYAN_SESSION_SECRET (minimum 16 characters) is required when NODE_ENV=production. ' +
      'Set it in the environment (see .env.example) and restart. Refusing to run with an ephemeral secret.'
    );
  }
  cachedSecret = crypto.randomBytes(48).toString('hex');
  return cachedSecret;
}

/**
 * PHASE 10.5.3 — boot-time guard. server.ts calls this BEFORE the database
 * opens or the port listens, so a production instance without a configured
 * secret fails fast with a clear, safe message (the secret itself is never
 * printed) instead of quietly signing throwaway tokens.
 */
export function assertSessionSecretReady(): void {
  resolveSessionSecret();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(data: string): string {
  return b64url(crypto.createHmac('sha256', resolveSessionSecret()).update(data).digest());
}

export function issueSessionToken(userId: string, username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = { sub: userId, username, iat: now, exp: now + TTL_SECONDS };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf-8'));
  return `${body}.${sign(body)}`;
}

/**
 * Verifies signature AND expiry. Returns the payload, or null when the token is
 * malformed, forged or expired. Never throws — a bad token is simply "no
 * identity", which the caller turns into 401.
 */
export function verifySessionToken(token: string | undefined | null): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  // Constant-time compare to avoid leaking the signature byte-by-byte.
  // PHASE 10.5.3: if the secret cannot be resolved at all (misconfigured
  // production with the boot guard bypassed), a token simply has "no
  // identity" — the never-throws contract of this function is preserved.
  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf-8')) as TokenPayload;
    if (!payload?.sub || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Extracts a bearer token from the Authorization header (scheme-insensitive). */
export function extractBearerToken(header: string | undefined | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}