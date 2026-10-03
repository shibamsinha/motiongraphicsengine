import crypto from 'node:crypto';

const COOKIE = 'mge_session';
const VERSION = 'v1';

const sameSecret = (a, b) => {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
};

const sign = (token, expiry) =>
  crypto.createHmac('sha256', token).update(`${VERSION}|${expiry}`).digest('hex');

export const makeSessionValue = (token, ttlMs) => {
  const expiry = Date.now() + ttlMs;
  return `${VERSION}.${expiry}.${sign(token, expiry)}`;
};

const validSession = (value, token) => {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [version, expiry, mac] = parts;
  if (version !== VERSION) return false;
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  try {
    return sameSecret(mac, sign(token, expiry));
  } catch {
    return false;
  }
};

const parseCookies = (header) => {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
};

const bearer = (header) => {
  const value = String(header ?? '');
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() : null;
};

export const isAuthorised = (req, config) => {
  if (!config.accessToken) return true;

  const presented = bearer(req.headers.authorization);
  if (presented) {
    try {
      if (sameSecret(presented, config.accessToken)) return true;
    } catch {}
  }

  const cookie = parseCookies(req.headers.cookie)[COOKIE];
  return validSession(cookie, config.accessToken);
};

export const isPublicPath = (pathname) =>
  pathname === '/api/health' || pathname === '/__auth';

export const signInPage = (message = null) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Motion Graphics Engine — access</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:radial-gradient(600px 320px at 50% 0%, rgba(255,77,109,.12), transparent 70%), #090b10;
         color:#e8ebf2; font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif; }
  form { width:min(92vw,360px); display:flex; flex-direction:column; gap:12px; padding:28px;
         background:#10131a; border:1px solid #1e2330; border-radius:16px; }
  h1 { font-size:17px; font-weight:800; margin:0; letter-spacing:-.01em; }
  p { margin:0; color:#9ba3b5; font-size:13px; }
  input { padding:10px 12px; border-radius:8px; border:1px solid #2f3646;
          background:#0c0f15; color:inherit; font:inherit; }
  input:focus-visible { outline:2px solid #ff7a50; outline-offset:1px; }
  button { padding:10px 12px; border-radius:8px; border:0; cursor:pointer;
           background:linear-gradient(110deg,#ff4d6d,#ffb347); color:#1d0b0b; font:inherit; font-weight:700; }
  .err { color:#ff6680; font-size:13px; }
</style></head><body>
<form method="POST" action="/__auth">
  <h1>Motion Graphics Engine</h1>
  <p>This deployment is private. Enter the access token to continue.</p>
  ${message ? `<p class="err">${message}</p>` : ''}
  <input type="password" name="token" autocomplete="current-password"
         aria-label="Access token" autofocus required>
  <button type="submit">Continue</button>
</form>
</body></html>`;

export const sessionCookie = (value, { secure, maxAgeSeconds }) =>
  [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');

export const requestIsSecure = (req) =>
  String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https' ||
  Boolean(req.socket?.encrypted);

export const wantsHtml = (req) =>
  String(req.headers.accept ?? '').includes('text/html');

export { COOKIE };
