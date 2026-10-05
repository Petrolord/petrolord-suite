// Pure logic for qi-upload-url (QI programme Q0): AWS Signature V4 query
// presigning (the only signing this function does; every S3 call, server
// side or browser side, goes through a presigned URL), the multipart plan,
// and the small XML bits of the S3 multipart API. No Deno or Node globals
// beyond Web Crypto, so jest and the edge runtime run the same code.

export const PART_SIZE = 64 * 1024 * 1024; // 64 MiB
export const MAX_FILE_BYTES = 200 * 1024 ** 3; // 200 GiB (3,200 parts)
export const MAX_SIGN_BATCH = 100;
export const URL_TTL_S = 3600;
export const USER_RAW_QUOTA_BYTES = 150 * 1024 ** 3; // Q0b replaces this with org tiers

const enc = new TextEncoder();

async function subtle(): Promise<SubtleCrypto> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.subtle) return c.subtle;
  // Node 18 without --experimental-global-webcrypto (local jest only).
  const nodeCrypto = await import('node:crypto');
  return (nodeCrypto.webcrypto as unknown as Crypto).subtle;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(s: string) {
  return hex(await (await subtle()).digest('SHA-256', enc.encode(s) as BufferSource));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const s = await subtle();
  const k = await s.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return s.sign('HMAC', k, enc.encode(data) as BufferSource);
}

// RFC 3986 encoding as SigV4 requires: unreserved characters stay, everything
// else is %XX upper case. Path segments keep their '/' separators.
export function uriEncode(s: string, keepSlash = false) {
  let out = '';
  for (const ch of String(s)) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (keepSlash && ch === '/')) out += ch;
    else for (const b of enc.encode(ch)) out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export function amzDates(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20130524T000000Z
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

export interface PresignInput {
  method: string;
  endpoint: string; // https://storage.petrolord.com (no trailing slash)
  bucket?: string; // path-style; omit for virtual-host style examples
  key: string;
  query?: Record<string, string>;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  expires: number;
  now: Date;
}

// Presigned URL per the AWS "Authenticating Requests: Using Query Parameters"
// spec (Signature Version 4), payload UNSIGNED-PAYLOAD, signed header: host.
export async function presignUrl(p: PresignInput): Promise<string> {
  const u = new URL(p.endpoint);
  const path = `/${p.bucket ? `${p.bucket}/` : ''}${p.key}`;
  const canonicalUri = uriEncode(path, true);
  const { amzDate, dateStamp } = amzDates(p.now);
  const scope = `${dateStamp}/${p.region}/s3/aws4_request`;
  const params: Record<string, string> = {
    ...(p.query || {}),
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${p.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(p.expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(params).sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`).join('&');
  const canonicalRequest = [
    p.method.toUpperCase(), canonicalUri, canonicalQuery,
    `host:${u.host}\n`, 'host', 'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');
  let key: ArrayBuffer = await hmac(enc.encode(`AWS4${p.secretAccessKey}`), dateStamp);
  key = await hmac(key, p.region);
  key = await hmac(key, 's3');
  key = await hmac(key, 'aws4_request');
  const signature = hex(await hmac(key, stringToSign));
  return `${u.protocol}//${u.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function partPlan(bytes: number) {
  const parts = Math.max(1, Math.ceil(bytes / PART_SIZE));
  return { partSize: PART_SIZE, parts };
}

// Object keys are owner-scoped and never contain the user's raw file name
// beyond a sanitised copy, so a crafted name cannot escape the prefix.
export function objectKeyFor(uid: string, datasetId: string, filename: string) {
  const base = String(filename || 'upload').split(/[\\/]/).pop() || 'upload';
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'upload';
  return `${uid}/${datasetId}/${safe}`;
}

export type StartRequest = { action: 'start'; filename: string; bytes: number; name?: string; organization_id?: string | null };

export function validateStart(body: Record<string, unknown>): { ok: true; value: StartRequest } | { ok: false; error: string } {
  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
  const bytes = Number(body.bytes);
  if (!filename) return { ok: false, error: 'filename is required.' };
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return { ok: false, error: 'bytes must be a positive whole number.' };
  if (bytes > MAX_FILE_BYTES) return { ok: false, error: `Files larger than ${MAX_FILE_BYTES / 1024 ** 3} GiB cannot be uploaded yet.` };
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 200) : filename.slice(0, 200);
  const org = typeof body.organization_id === 'string' && body.organization_id ? body.organization_id : null;
  return { ok: true, value: { action: 'start', filename, bytes, name, organization_id: org } };
}

export function validatePartNumbers(raw: unknown, totalParts: number): number[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'part_numbers must be a non-empty list.';
  if (raw.length > MAX_SIGN_BATCH) return `Ask for at most ${MAX_SIGN_BATCH} parts at a time.`;
  const out: number[] = [];
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > totalParts) return `Part ${v} is outside 1 to ${totalParts}.`;
    out.push(n);
  }
  return [...new Set(out)];
}

// XML text to plain text: named entities and numeric references (&#34; and
// &#x22;), which is how SeaweedFS writes the quotes round an ETag.
export function xmlDecode(s: string) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|quot|apos|lt|gt|amp);/g, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' } as Record<string, string>)[e] ?? m;
  });
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? xmlDecode(m[1]) : null;
};

export function parseUploadId(xml: string) {
  return tag(xml, 'UploadId');
}

export function parseListParts(xml: string) {
  const parts: { partNumber: number; etag: string; size: number }[] = [];
  for (const m of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
    const body = m[1];
    parts.push({
      partNumber: Number(tag(body, 'PartNumber')),
      etag: tag(body, 'ETag') || '',
      size: Number(tag(body, 'Size')),
    });
  }
  const truncated = tag(xml, 'IsTruncated') === 'true';
  const next = tag(xml, 'NextPartNumberMarker');
  return { parts, truncated, nextMarker: next };
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function completeXml(parts: { partNumber: number; etag: string }[]) {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  return `<CompleteMultipartUpload>${sorted.map((p) =>
    `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
}

// Every part but the last must be exactly PART_SIZE, and together they must
// add up to the declared size; otherwise completing would register a file
// that is not the one the user chose.
export function checkPartsComplete(parts: { partNumber: number; size: number }[], bytes: number) {
  const { parts: n } = partPlan(bytes);
  if (parts.length !== n) return `${parts.length} of ${n} parts are uploaded.`;
  const byNo = new Map(parts.map((p) => [p.partNumber, p.size]));
  let total = 0;
  for (let i = 1; i <= n; i += 1) {
    const size = byNo.get(i);
    if (size === undefined) return `Part ${i} is missing.`;
    const expected = i < n ? PART_SIZE : bytes - PART_SIZE * (n - 1);
    if (size !== expected) return `Part ${i} is ${size} bytes; expected ${expected}.`;
    total += size;
  }
  return total === bytes ? null : `Uploaded ${total} bytes; expected ${bytes}.`;
}
