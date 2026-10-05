// Object-store access for the worker: presigned requests (the same SigV4
// presigner the qi-upload-url edge function uses, so there is one signing
// implementation) and a ranged ByteReader over an object, the interface every
// Seismolord engine reads SEG-Y through (engines/seismolord/reader.js).
import { presignUrl } from '../../../supabase/functions/qi-upload-url/logic.ts';

export function makeSigner(s3, { now = () => new Date() } = {}) {
  return (method, bucket, key, query = {}, expires = 900) => presignUrl({
    method, endpoint: s3.endpoint, bucket, key, query, expires, now: now(),
    accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey, region: s3.region,
  });
}

export async function headObject(sign, bucket, key, fetchImpl = fetch) {
  const r = await fetchImpl(await sign('HEAD', bucket, key), { method: 'HEAD' });
  if (!r.ok) throw Object.assign(new Error(`The stored file could not be found (${r.status}).`), { status: r.status });
  return { size: Number(r.headers.get('content-length')) };
}

/**
 * ByteReader over one object, by HTTP Range requests. Reads are retried on
 * transient failures, and a short read is an error (the engines assume
 * read(offset, n) returns exactly n bytes).
 */
export function s3RangeReader({ sign, bucket, key, size, fetchImpl = fetch, retries = 4, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return {
    size,
    async read(offset, length) {
      if (offset < 0 || length < 0 || offset + length > size) {
        throw new Error(`Read out of range: ${offset}+${length} of ${size}`);
      }
      if (length === 0) return new ArrayBuffer(0);
      let last;
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
          const r = await fetchImpl(await sign('GET', bucket, key), { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
          if (r.status === 206 || (r.status === 200 && offset === 0 && length === size)) {
            const buf = await r.arrayBuffer();
            if (buf.byteLength !== length) throw new Error(`Short read: ${buf.byteLength} of ${length} bytes at ${offset}`);
            return buf;
          }
          last = new Error(`Range read failed (${r.status}) at ${offset}`);
          if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) break;
        } catch (e) {
          last = e;
        }
        if (attempt < retries) await sleep(500 * 2 ** (attempt - 1));
      }
      throw last;
    },
  };
}
