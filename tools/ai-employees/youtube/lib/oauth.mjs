// Google OAuth for an installed app, with a loopback redirect and PKCE.
// Pure helpers plus two token calls; fetch is injectable for tests.
// Never log a token: callers print channel names and ids only.
import crypto from 'node:crypto';
import fs from 'node:fs';

export const SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
]);
export const CLIENT_FILE = '/root/.youtube-oauth-client.json';
export const TOKEN_FILE = '/root/.youtube-oauth-token.json';
const DEFAULT_AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The client JSON Google gives for a Desktop app ({installed: {...}}) or a web client. */
export function parseClient(json) {
  const c = json?.installed || json?.web || json;
  if (!c?.client_id || !c?.client_secret) throw new Error('The OAuth client file has no client_id and client_secret.');
  return {
    clientId: c.client_id,
    clientSecret: c.client_secret,
    authUri: c.auth_uri || DEFAULT_AUTH_URI,
    tokenUri: c.token_uri || DEFAULT_TOKEN_URI,
  };
}

export function pkcePair(random = crypto.randomBytes) {
  const verifier = b64url(random(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function consentUrl({ client, redirectUri, state, challenge, scopes = SCOPES }) {
  const u = new URL(client.authUri);
  u.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return u.toString();
}

/** The code from the pasted redirect URL; checks the state. */
export function parseRedirect(pasted, expectedState) {
  let u;
  try {
    u = new URL(String(pasted || '').trim());
  } catch {
    throw new Error('That is not a URL. Paste the whole address from the browser bar, starting http://127.0.0.1.');
  }
  const err = u.searchParams.get('error');
  if (err) throw new Error(`Google returned an error: ${err}`);
  const code = u.searchParams.get('code');
  if (!code) throw new Error('The URL has no code parameter.');
  if (expectedState && u.searchParams.get('state') !== expectedState) throw new Error('The state does not match. Start again with a fresh consent URL.');
  return code;
}

async function tokenCall(client, params, fetchImpl) {
  const res = await fetchImpl(client.tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...params }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${body.error || 'unknown'} ${body.error_description || ''}`.trim());
  return body;
}

export function exchangeCode({ client, code, verifier, redirectUri, fetchImpl = fetch }) {
  return tokenCall(client, { code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code' }, fetchImpl);
}

export async function accessTokenFromRefresh({ client, refreshToken, fetchImpl = fetch }) {
  const body = await tokenCall(client, { refresh_token: refreshToken, grant_type: 'refresh_token' }, fetchImpl);
  return body.access_token;
}

export function readClient(file = CLIENT_FILE) {
  if (!fs.existsSync(file)) throw new Error(`No OAuth client file at ${file}. Download the Desktop app client JSON from Google Cloud Console and save it there (chmod 600).`);
  return parseClient(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function saveRefreshToken(tokenBody, file = TOKEN_FILE) {
  const record = {
    refresh_token: tokenBody.refresh_token,
    scope: tokenBody.scope,
    token_type: tokenBody.token_type,
    obtained_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/** An access-token getter from the saved refresh token, cached until near expiry. */
export function tokenProvider({ clientFile = CLIENT_FILE, tokenFile = TOKEN_FILE, fetchImpl = fetch } = {}) {
  let cached = null;
  let until = 0;
  return async () => {
    if (cached && Date.now() < until) return cached;
    if (!fs.existsSync(tokenFile)) throw new Error(`No token at ${tokenFile}. Run node tools/ai-employees/youtube/auth.mjs first.`);
    const { refresh_token: refreshToken } = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    cached = await accessTokenFromRefresh({ client: readClient(clientFile), refreshToken, fetchImpl });
    until = Date.now() + 45 * 60 * 1000;
    return cached;
  };
}
