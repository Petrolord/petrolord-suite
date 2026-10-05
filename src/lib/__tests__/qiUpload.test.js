/**
 * @jest-environment node
 */
// Resumable upload protocol (QI programme Q0) against an in-memory double of
// the qi-upload-url function and the S3 store. The bytes the "store"
// assembles must equal the file, across an interruption and a resume.
import { uploadLargeFile, abandonUpload, fileFingerprint } from '../qiUpload';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const PART = 1000;

function fakeFile(size, name = 'survey.sgy') {
  const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 31 + 7) % 251);
  return { name, size, lastModified: 1700000000000, bytes, slice: (a, b) => bytes.subarray(a, b) };
}

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
}

function fakeServer() {
  const uploads = new Map();
  const log = [];
  let nextId = 1;
  const err = (status, message) => Object.assign(new Error(message), { status });
  const invoke = async (body) => {
    log.push(body.action);
    if (body.action === 'start') {
      // as the function does: an unfinished upload of the same file
      // (size + fingerprint) is resumed instead of a second one starting
      if (body.fingerprint) {
        const hit = [...uploads].find(([, u]) => u.status === 'uploading' && u.bytes === body.bytes && u.fp === body.fingerprint.hash);
        if (hit) return { dataset_id: hit[0], part_size: PART, part_count: hit[1].partCount, resumed: true };
      }
      const id = `ds-${nextId++}`;
      uploads.set(id, { bytes: body.bytes, partCount: Math.ceil(body.bytes / PART), parts: new Map(), status: 'uploading', signed: 0, fp: body.fingerprint?.hash });
      return { dataset_id: id, part_size: PART, part_count: Math.ceil(body.bytes / PART) };
    }
    const u = uploads.get(body.dataset_id);
    if (!u) throw err(404, 'No such upload.');
    if (u.status !== 'uploading') throw err(409, `This upload is ${u.status}.`);
    if (body.action === 'sign') {
      const urls = {};
      for (const n of body.part_numbers) { u.signed += 1; urls[n] = `https://store/${body.dataset_id}/${n}?sig=${u.signed}`; }
      return { urls };
    }
    if (body.action === 'parts') {
      return { part_size: PART, part_count: u.partCount, parts: [...u.parts].map(([n, b]) => ({ partNumber: n, size: b.length, etag: `"e${n}"` })) };
    }
    if (body.action === 'complete') {
      if (u.parts.size !== u.partCount) throw err(409, `${u.parts.size} of ${u.partCount} parts are uploaded.`);
      const out = new Uint8Array(u.bytes);
      for (const [n, b] of u.parts) out.set(b, (n - 1) * PART);
      u.status = 'uploaded';
      u.assembled = out;
      return { dataset: { id: body.dataset_id, status: 'uploaded', bytes: u.bytes } };
    }
    if (body.action === 'abort') { u.status = 'deleted'; return { ok: true }; }
    throw err(400, 'Unknown action.');
  };
  const fetchImpl = async (url, init) => {
    const [, id, n] = new URL(url).pathname.split('/');
    uploads.get(id).parts.set(Number(n), Uint8Array.from(init.body));
    return { ok: true, status: 200 };
  };
  return { invoke, fetchImpl, uploads, log };
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const noSleep = async () => {};

describe('uploadLargeFile', () => {
  test('uploads every part and the assembled bytes equal the file', async () => {
    const s = fakeServer();
    const file = fakeFile(4500);
    const seen = [];
    const ds = await uploadLargeFile(file, { invoke: s.invoke, fetchImpl: s.fetchImpl, storage: memStorage(), onProgress: (p) => seen.push(p.bytesDone), sleep: noSleep });
    expect(ds.status).toBe('uploaded');
    expect(same(s.uploads.get(ds.id).assembled, file.bytes)).toBe(true);
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(4500);
  });

  test('an interrupted upload resumes after a "reload" and sends only the missing parts', async () => {
    const s = fakeServer();
    const storage = memStorage();
    const file = fakeFile(5200);
    const ctl = new AbortController();
    let puts = 0;
    const flaky = async (url, init) => {
      if (++puts === 3) { ctl.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }
      return s.fetchImpl(url, init);
    };
    await expect(uploadLargeFile(file, { invoke: s.invoke, fetchImpl: flaky, storage, signal: ctl.signal, concurrency: 1, sleep: noSleep }))
      .rejects.toMatchObject({ name: 'AbortError' });
    const [id] = [...s.uploads.keys()];
    expect(s.uploads.get(id).parts.size).toBe(2);
    expect(storage.getItem(`qi-upload:${fileFingerprint(file)}`)).toBe(id);

    const resumedPuts = [];
    const ds = await uploadLargeFile(file, {
      invoke: s.invoke, storage, sleep: noSleep,
      fetchImpl: async (url, init) => { resumedPuts.push(Number(new URL(url).pathname.split('/')[2])); return s.fetchImpl(url, init); },
    });
    expect(ds.id).toBe(id);
    expect(resumedPuts.sort()).toEqual([3, 4, 5, 6]);
    expect(same(s.uploads.get(id).assembled, file.bytes)).toBe(true);
    expect(storage.getItem(`qi-upload:${fileFingerprint(file)}`)).toBeNull();
  });

  test('a part stored at the wrong size is sent again on resume', async () => {
    const s = fakeServer();
    const storage = memStorage();
    const file = fakeFile(2500);
    const { dataset_id: id } = await s.invoke({ action: 'start', bytes: 2500 });
    storage.setItem(`qi-upload:${fileFingerprint(file)}`, id);
    s.uploads.get(id).parts.set(1, new Uint8Array(10)); // truncated part
    await uploadLargeFile(file, { invoke: s.invoke, fetchImpl: s.fetchImpl, storage, sleep: noSleep });
    expect(same(s.uploads.get(id).assembled, file.bytes)).toBe(true);
  });

  test('a remembered upload the server no longer has starts afresh', async () => {
    const s = fakeServer();
    const storage = memStorage();
    const file = fakeFile(1500);
    storage.setItem(`qi-upload:${fileFingerprint(file)}`, 'ds-gone');
    const ds = await uploadLargeFile(file, { invoke: s.invoke, fetchImpl: s.fetchImpl, storage, sleep: noSleep });
    expect(ds.id).not.toBe('ds-gone');
    expect(s.log.filter((a) => a === 'start')).toHaveLength(1);
  });

  test('transient failures and an expired URL are retried with a fresh signature', async () => {
    const s = fakeServer();
    const file = fakeFile(1000);
    const replies = [{ ok: false, status: 500 }, { ok: false, status: 403 }];
    const usedSigs = [];
    const fetchImpl = async (url, init) => {
      usedSigs.push(new URL(url).searchParams.get('sig'));
      const r = replies.shift();
      return r || s.fetchImpl(url, init);
    };
    const ds = await uploadLargeFile(file, { invoke: s.invoke, fetchImpl, storage: memStorage(), sleep: noSleep });
    expect(ds.status).toBe('uploaded');
    expect(new Set(usedSigs).size).toBe(3); // each retry asked for a new URL
  });

  test('gives up on a part after four attempts with a clear message', async () => {
    const s = fakeServer();
    await expect(uploadLargeFile(fakeFile(1000), { invoke: s.invoke, fetchImpl: async () => ({ ok: false, status: 503 }), storage: memStorage(), sleep: noSleep }))
      .rejects.toThrow(/Part 1 failed to upload \(503\)/);
  });

  test('works when browser storage throws (private window): no resume, still uploads', async () => {
    const s = fakeServer();
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const ds = await uploadLargeFile(fakeFile(2100), { invoke: s.invoke, fetchImpl: s.fetchImpl, storage: bad, sleep: noSleep });
    expect(ds.status).toBe('uploaded');
  });

  test('negative control: the server refuses to complete when a part is missing', async () => {
    const s = fakeServer();
    const file = fakeFile(3000);
    const dropPart2 = async (url, init) => (new URL(url).pathname.endsWith('/2') ? { ok: true, status: 200 } : s.fetchImpl(url, init));
    await expect(uploadLargeFile(file, { invoke: s.invoke, fetchImpl: dropPart2, storage: memStorage(), sleep: noSleep }))
      .rejects.toMatchObject({ status: 409 });
  });
});

describe('resume across browsers (server-side match)', () => {
  const fp = (hash) => async (file) => ({ algo: 'sha256-sampled-64k-v1', hash, size: file.size });
  const H1 = 'a'.repeat(64);
  const H2 = 'b'.repeat(64);

  async function interrupted(s, file) {
    const ctl = new AbortController();
    let puts = 0;
    const flaky = async (url, init) => {
      if (++puts === 3) { ctl.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }
      return s.fetchImpl(url, init);
    };
    await expect(uploadLargeFile(file, { invoke: s.invoke, fetchImpl: flaky, storage: memStorage(), signal: ctl.signal, concurrency: 1, sleep: noSleep, fingerprint: fp(H1) }))
      .rejects.toMatchObject({ name: 'AbortError' });
  }

  test('another browser (nothing remembered locally) carries on the same upload and sends only what is missing', async () => {
    const s = fakeServer();
    const file = fakeFile(5200);
    await interrupted(s, file);
    const [id] = [...s.uploads.keys()];
    const sent = [];
    const ds = await uploadLargeFile(file, {
      invoke: s.invoke, storage: memStorage(), sleep: noSleep, fingerprint: fp(H1),
      fetchImpl: async (url, init) => { sent.push(Number(new URL(url).pathname.split('/')[2])); return s.fetchImpl(url, init); },
    });
    expect(ds.id).toBe(id);
    expect(s.uploads.size).toBe(1);
    expect(sent.sort()).toEqual([3, 4, 5, 6]);
    expect(same(s.uploads.get(id).assembled, file.bytes)).toBe(true);
  });

  test('negative control: a different file fingerprint starts its own upload', async () => {
    const s = fakeServer();
    const file = fakeFile(5200);
    await interrupted(s, file);
    await uploadLargeFile(file, { invoke: s.invoke, fetchImpl: s.fetchImpl, storage: memStorage(), sleep: noSleep, fingerprint: fp(H2) });
    expect(s.uploads.size).toBe(2);
  });

  test('without a fingerprint the server is not asked to match (unchanged behaviour)', async () => {
    const s = fakeServer();
    const file = fakeFile(1500);
    await uploadLargeFile(file, { invoke: s.invoke, fetchImpl: s.fetchImpl, storage: memStorage(), sleep: noSleep });
    expect(s.uploads.get('ds-1').fp).toBeUndefined();
  });
});

describe('abandonUpload', () => {
  test('aborts the remembered upload and forgets it', async () => {
    const s = fakeServer();
    const storage = memStorage();
    const file = fakeFile(1000);
    const { dataset_id: id } = await s.invoke({ action: 'start', bytes: 1000 });
    storage.setItem(`qi-upload:${fileFingerprint(file)}`, id);
    await abandonUpload(file, { invoke: s.invoke, storage });
    expect(s.uploads.get(id).status).toBe('deleted');
    expect(storage.m.size).toBe(0);
  });
});
