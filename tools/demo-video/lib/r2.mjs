// Cloudflare R2 (S3-compatible) for finished video masters. Signs requests
// with AWS Signature V4 using node:crypto, so no SDK is needed.
// Credentials come from /root/.r2.env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET); the token is Object Read & Write on the
// one bucket, which stays private.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
export const EMPTY_SHA256 = sha256('');

// S3 wants every path segment URI-encoded, slashes kept
const encodePath = (p) => p.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

// Returns the headers to send (incl. Authorization). Signs host, x-amz-date
// and every header passed in.
export function signV4({ method, url, headers = {}, payloadHash = EMPTY_SHA256, region = 'auto', service = 's3', accessKeyId, secretAccessKey, now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, 'x-amz-date': amzDate };
  const names = Object.keys(all).sort();
  const query = [...u.searchParams].map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonical = [method, encodePath(decodeURIComponent(u.pathname)), query, names.map((n) => `${n}:${all[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSign = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
  const { host, ...send } = all;
  return { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

export function r2Config(env) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return { endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, bucket: R2_BUCKET, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY };
}

async function call(cfg, method, key, { body, payloadHash = EMPTY_SHA256, headers = {}, query = '' } = {}) {
  const url = `${cfg.endpoint}/${cfg.bucket}${key ? `/${encodePath(key)}` : ''}${query}`;
  // identity: Cloudflare gzips text on the fly, which hides the size and
  // weakens the ETag that uploads are checked against
  const signed = signV4({ method, url, headers: { 'accept-encoding': 'identity', ...headers, 'x-amz-content-sha256': payloadHash }, payloadHash, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey });
  const res = await fetch(url, { method, headers: signed, body });
  return res;
}

const TYPES = { '.mp4': 'video/mp4', '.srt': 'application/x-subrip', '.vtt': 'text/vtt', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
// What goes to the bucket: the finished cuts and their small companions.
// raw.mkv and work files stay local; the storyboard can re-record them.
export const MASTER_FILES = ['youtube.mp4', 'nape.mp4', 'youtube.srt', 'youtube.vtt', 'chapters.txt', 'timeline.json'];
export const MANIFEST = 'r2.json';

export async function head(cfg, key) {
  const res = await call(cfg, 'HEAD', key);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HEAD ${key}: ${res.status}`);
  return { size: Number(res.headers.get('content-length')), etag: (res.headers.get('etag') || '').replace(/"/g, '') };
}

export async function put(cfg, key, file) {
  const body = fs.readFileSync(file);
  const md5 = crypto.createHash('md5').update(body).digest();
  const res = await call(cfg, 'PUT', key, {
    body, payloadHash: sha256(body),
    headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-md5': md5.toString('base64') },
  });
  if (!res.ok) throw new Error(`PUT ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return { size: body.length, md5: md5.toString('hex') };
}

export async function get(cfg, key, dest) {
  const res = await call(cfg, 'GET', key);
  if (!res.ok) throw new Error(`GET ${key}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

export async function list(cfg, prefix = '') {
  const keys = [];
  let token = '';
  for (;;) {
    const q = `?list-type=2${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const res = await call(cfg, 'GET', '', { query: q });
    if (!res.ok) throw new Error(`LIST: ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const f = (t) => (m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1];
      keys.push({ key: f('Key'), size: Number(f('Size')), modified: f('LastModified') });
    }
    token = (xml.match(/<NextContinuationToken>([^<]*)</) || [])[1];
    if (!token) return keys;
  }
}

const md5File = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

// Upload one video folder's masters under <id>/, skipping files the bucket
// already holds unchanged, then confirm each by size and ETag (MD5 for a
// single-part PUT) and write r2.json beside them. housekeeping.sh only frees
// local copies that r2.json and the bucket both vouch for.
export async function uploadVideo(cfg, dir, { log = console.log } = {}) {
  const id = path.basename(dir);
  const files = {};
  for (const name of MASTER_FILES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const key = `${id}/${name}`;
    const local = md5File(file);
    const remote = await head(cfg, key);
    let size = fs.statSync(file).size;
    if (remote && remote.etag === local && remote.size === size) {
      log(`  ${key} already there`);
    } else {
      ({ size } = await put(cfg, key, file));
      const check = await head(cfg, key);
      if (!check || check.etag !== local || check.size !== size) throw new Error(`${key}: the bucket copy does not match the local file`);
      log(`  ${key} uploaded (${(size / 1e6).toFixed(1)} MB)`);
    }
    files[name] = { key, size, md5: local };
  }
  if (!files['youtube.mp4']) throw new Error(`${dir} has no youtube.mp4; nothing to upload yet`);
  const manifest = { bucket: cfg.bucket, uploadedAt: new Date().toISOString(), files };
  fs.writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
