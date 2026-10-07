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

/**
 * A streaming multipart upload: write() bytes in any sizes, finish() to
 * assemble, abort() to drop the parts. The store needs parts of at least
 * 5 MiB but the last; partSize below that is for tests only.
 * @returns {{write: (bytes: Uint8Array) => Promise<void>, finish: () => Promise<{bytes: number, parts: number}>, abort: () => Promise<void>}}
 */
export async function multipartWriter({ sign, bucket, key, fetchImpl = fetch, partSize, parseUploadId, completeXml }) {
  const init = await fetchImpl(await sign('POST', bucket, key, { uploads: '' }), { method: 'POST' });
  const uploadId = init.ok ? parseUploadId(await init.text()) : null;
  if (!uploadId) throw new Error(`The store refused to start the upload (${init.status}).`);
  const parts = [];
  let buf = new Uint8Array(partSize);
  let used = 0;
  let total = 0;
  const putPart = async (bytes) => {
    const n = parts.length + 1;
    const r = await fetchImpl(await sign('PUT', bucket, key, { partNumber: String(n), uploadId }), { method: 'PUT', body: bytes });
    if (!r.ok) throw new Error(`Storing part ${n} failed (${r.status}).`);
    parts.push({ partNumber: n, etag: r.headers.get('etag') });
  };
  return {
    async write(bytes) {
      let at = 0;
      while (at < bytes.length) {
        const take = Math.min(bytes.length - at, partSize - used);
        buf.set(bytes.subarray(at, at + take), used);
        used += take; at += take; total += take;
        if (used === partSize) { await putPart(buf); buf = new Uint8Array(partSize); used = 0; }
      }
    },
    async finish() {
      if (used > 0) await putPart(buf.subarray(0, used));
      const done = await fetchImpl(await sign('POST', bucket, key, { uploadId }), { method: 'POST', body: completeXml(parts) });
      if (!done.ok) throw new Error(`The store could not assemble the file (${done.status}).`);
      return { bytes: total, parts: parts.length };
    },
    async abort() {
      try { await fetchImpl(await sign('DELETE', bucket, key, { uploadId }), { method: 'DELETE' }); } catch { /* best effort */ }
    },
  };
}
