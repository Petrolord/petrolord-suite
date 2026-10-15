// Range reads from a link (2026-10-15, QI round 3). "Import from a link" used
// to copy the whole file into the worker's store before the import dialog's
// crop was applied at conversion, so an 80 GB stack cropped to a pilot area
// still crossed the network in full and sat in the raw store for 30 days.
// When the link's server answers byte ranges, the import now registers the
// link itself and every later read (the preview scan, the crop plan, the
// conversion) asks for only the bytes it needs. A server without ranges gets
// the full copy, as before.
//
// Every request goes through netGuard (https only, public addresses, pinned
// connection, vetted redirects) with a Range header. A response must be a 206
// for exactly the bytes asked, and must name the same file each time (ETag or
// Last-Modified, when the server gives them), or the read fails rather than
// mix two versions of a file.
import { guardedGet } from './netGuard.js';
import { JobFailure } from './runJob.js';

const MiB = 1024 * 1024;

/** "bytes 0-0/12345" -> {start, end, total} (total null for "*"). */
export function parseContentRange(v) {
  const m = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)\s*$/i.exec(String(v || ''));
  if (!m) return null;
  return { start: Number(m[1]), end: Number(m[2]), total: m[3] === '*' ? null : Number(m[3]) };
}

const versionOf = (headers) => ({ etag: headers.etag || null, last_modified: headers['last-modified'] || null });

async function readBody(res, limit) {
  const chunks = []; let n = 0;
  for await (const c of res) {
    const b = c instanceof Uint8Array ? c : new Uint8Array(c);
    n += b.length;
    if (n > limit) { res.destroy?.(); throw new Error(`The link sent more than the ${limit} bytes asked for.`); }
    chunks.push(b);
  }
  const out = new Uint8Array(n); let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Ask for the first byte. A 206 with a total size means the link serves
 * ranges: {ranged: true, size, finalUrl, headers, version}. Anything else
 * returns the response so the caller can copy the file as before (a 200
 * here is the whole file already on its way).
 */
export async function probeRanges(url, { get = guardedGet } = {}) {
  const { res, finalUrl } = await get(url, { headers: { Range: 'bytes=0-0' } });
  if (res.statusCode === 206) {
    const cr = parseContentRange(res.headers['content-range']);
    res.resume?.();
    if (cr && cr.start === 0 && cr.total > 0) {
      return { ranged: true, size: cr.total, finalUrl, headers: res.headers, version: versionOf(res.headers) };
    }
    // a 206 without a usable size: fetch again without a range
    return { ranged: false, ...(await get(url)) };
  }
  return { ranged: false, res, finalUrl };
}

/**
 * ByteReader over a link by Range requests. A read of blockBytes or more is
 * asked for exactly (in requests of at most maxRequestBytes): the preview
 * scan's runs, the crop's kept runs and the conversion's chunks. Smaller
 * reads (trace headers one by one) go through a cache of aligned blocks, so
 * neighbouring headers cost one request and a scattered header one block.
 * @param {{url: string, size: number, version?: {etag, last_modified}, get?: Function, blockBytes?: number, cacheBlocks?: number, maxRequestBytes?: number, retries?: number, sleep?: Function}} o
 */
export function linkRangeReader({
  url, size, version = {}, get = guardedGet,
  blockBytes = 256 * 1024, cacheBlocks = 64, maxRequestBytes = 64 * MiB, retries = 4,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const stats = { requests: 0, bytes: 0 };
  const cache = new Map(); // block index -> Uint8Array (insertion order = LRU)

  async function fetchRange(start, end) { // inclusive
    let last;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      let res;
      try {
        ({ res } = await get(url, { headers: { Range: `bytes=${start}-${end}` } }));
      } catch (e) {
        last = e;
        if (/private or reserved|Only https|cannot be imported|redirected more/i.test(e.message)) throw new JobFailure('fetch_refused', e.message);
        if (attempt < retries) await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      if ([401, 403, 404, 410].includes(res.statusCode)) {
        res.resume?.();
        throw new JobFailure('link_gone', `The link no longer serves the file (it answered ${res.statusCode}). Import from the link again, or ask the sender for a fresh link.`);
      }
      if (res.statusCode !== 206) {
        res.resume?.();
        last = new Error(`The link answered ${res.statusCode} to a range request.`);
        if (res.statusCode === 200) { res.destroy?.(); throw new JobFailure('link_no_ranges', 'The link stopped serving parts of the file. Import from the link again (the whole file will be copied).'); }
        if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 408 && res.statusCode !== 429) throw last;
        if (attempt < retries) await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      const cr = parseContentRange(res.headers['content-range']);
      const v = versionOf(res.headers);
      if ((version.etag && v.etag && v.etag !== version.etag) || (version.last_modified && v.last_modified && v.last_modified !== version.last_modified) || (cr?.total != null && cr.total !== size)) {
        res.resume?.();
        throw new JobFailure('link_changed', 'The file at the link has changed since it was imported. Import from the link again.');
      }
      if (!cr || cr.start !== start || cr.end !== end) {
        res.resume?.();
        throw new Error(`The link sent bytes ${cr ? `${cr.start}-${cr.end}` : 'without a range'} for ${start}-${end}.`);
      }
      try {
        const body = await readBody(res, end - start + 1);
        if (body.length !== end - start + 1) throw new Error(`Short read from the link: ${body.length} of ${end - start + 1} bytes at ${start}.`);
        stats.requests += 1; stats.bytes += body.length;
        return body;
      } catch (e) {
        last = e;
        if (attempt < retries) await sleep(500 * 2 ** (attempt - 1));
      }
    }
    throw last;
  }

  const keep = (b, bytes) => {
    cache.delete(b); cache.set(b, bytes);
    while (cache.size > cacheBlocks) cache.delete(cache.keys().next().value);
  };

  return {
    size,
    stats,
    async read(offset, length) {
      if (offset < 0 || length < 0 || offset + length > size) throw new Error(`Read out of range: ${offset}+${length} of ${size}`);
      if (length === 0) return new ArrayBuffer(0);
      // a large read goes straight through, in requests of at most maxRequestBytes
      if (length >= blockBytes) {
        const out = new Uint8Array(length);
        for (let at = 0; at < length; at += maxRequestBytes) {
          const n = Math.min(maxRequestBytes, length - at);
          out.set(await fetchRange(offset + at, offset + at + n - 1), at);
        }
        return out.buffer;
      }
      const b0 = Math.floor(offset / blockBytes); const b1 = Math.floor((offset + length - 1) / blockBytes);
      // missing blocks, fetched as contiguous runs
      let b = b0;
      while (b <= b1) {
        if (cache.has(b)) { keep(b, cache.get(b)); b += 1; continue; }
        let e = b;
        while (e + 1 <= b1 && !cache.has(e + 1)) e += 1;
        const start = b * blockBytes; const end = Math.min(size, (e + 1) * blockBytes) - 1;
        const got = await fetchRange(start, end);
        for (let k = b; k <= e; k++) keep(k, got.subarray((k - b) * blockBytes, Math.min(got.length, (k - b + 1) * blockBytes)));
        b = e + 1;
      }
      const out = new Uint8Array(length);
      for (let k = b0; k <= b1; k++) {
        const blk = cache.get(k); const base = k * blockBytes;
        const from = Math.max(offset, base); const to = Math.min(offset + length, base + blk.length);
        out.set(blk.subarray(from - base, to - base), from - offset);
      }
      return out.buffer;
    },
  };
}
