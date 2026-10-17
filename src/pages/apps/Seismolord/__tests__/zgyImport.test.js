// ZGY import (owner request 2026-10-16). A picked .zgy reaches the import
// as the SEG-Y it holds: these tests run that SEG-Y through the real door,
// scan and v4 conversion and compare it with a SEG-Y written by this
// repository's own writer from the same samples (the reader itself is
// validated against OpenZGY in the engines suite). Also: the ZFP decoder
// over the real wasm, the display clip of a compressed file, the server
// upload of the ZGY itself, and the non-ZGY path left as it was.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { TextEncoder, TextDecoder } from 'node:util';
import { bufferReader } from '../engine/reader';
import { scanGeometry } from '../engine/segyScan';
import { writeSegy } from '../../../../../packages/engines/engines/seismolord/segyWrite';
import { DEFLATE_RAW } from '../engine/brickCodecV4';
import { memorySpool } from '../services/brickSpool';
import { convertToSpool } from '../services/conversionV4';
import { openSegyDoor, inspectSegy } from '../lib/segyDoor';
import {
  importSourceReader, isZgyFile, zgySummary, sourceClip, VOLUME_ACCEPT,
} from '../services/zgySource';
import { startServerImport } from '../services/serverImport';

if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

const DIR = path.join(__dirname, '../../../../../packages/engines/test-data/seismolord/zgy');
const bytesOf = (name) => {
  const b = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${name}.zgy.gz`)));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
/** A picked file, as the browser's File reads (slice().arrayBuffer()). */
const fileOf = (buf, name) => ({
  name, size: buf.byteLength, lastModified: 1,
  slice: (a, b) => ({ arrayBuffer: async () => buf.slice(a, b) }),
});
const ZLIB = {
  compression: DEFLATE_RAW,
  deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)),
  inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)),
};

async function spoolOf(reader) {
  const { reader: door } = await openSegyDoor(reader);
  const scan = await scanGeometry(door, {}, {});
  const spool = memorySpool();
  const record = await convertToSpool({ reader: door, scan, spool, codec: ZLIB, brickSize: 16, levels: 2, clip: { clip: 100 } });
  return { spool, record, scan };
}

describe('a picked ZGY is read as the SEG-Y it holds', () => {
  test('the accept list and the name check', () => {
    expect(VOLUME_ACCEPT).toMatch(/\.zgy/);
    expect(isZgyFile({ name: 'Legacy_PSTM.ZGY' })).toBe(true);
    expect(isZgyFile({ name: 'a.sgy' })).toBe(false);
    expect(isZgyFile({ name: 'a.zgy', remote: true })).toBe(false);
  });

  test('a SEG-Y file is passed through untouched', async () => {
    const seg = writeSegy({ dtUs: 4000, ns: 3, traces: [{ il: 1, xl: 1, x: 0, y: 0, samples: [1, 2, 3] }] });
    const buf = seg.buffer.slice(0);
    const r = await importSourceReader(fileOf(buf, 'a.sgy'));
    expect(r.zgyHandle).toBeUndefined();
    expect(r.size).toBe(buf.byteLength);
  });

  test('door, scan and v4 conversion of a ZGY equal those of a SEG-Y written from the same samples', async () => {
    const file = fileOf(bytesOf('gen-int16'), 'legacy.zgy');
    const view = await importSourceReader(file);
    const z = view.zgyHandle;
    const m = z.meta;
    const [ni, nj, nk] = m.size;
    const all = await z.read([0, 0, 0], m.size, 0);
    const pad = view.zgy.layout.pad;
    expect(pad).toBe(125);
    // the reference: this repository's SEG-Y writer from the same samples
    const traces = [];
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
      const s = new Float32Array(nk + pad);
      s.set(all.subarray((i * nj + j) * nk, (i * nj + j + 1) * nk), pad);
      const [x, y] = m.indexToWorld(i, j);
      traces.push({ il: m.orig[0] + m.inc[0] * i, xl: m.orig[1] + m.inc[1] * j, x, y, samples: s });
    }
    const ref = writeSegy({ dtUs: 4000, ns: nk + pad, traces });
    // the writer writes nulls as 0: put the null words above the first sample back
    const rv = new DataView(ref.buffer);
    const tb = 240 + 4 * (nk + pad);
    for (let t = 0; t < ni * nj; t++) for (let s = 0; s < pad; s++) rv.setFloat32(3600 + t * tb + 240 + 4 * s, 1e30, false);

    const door = await inspectSegy(view);
    expect(door.formatCode).toBe(5);
    const a = await spoolOf(view);
    const b = await spoolOf(bufferReader(ref.buffer));
    expect(a.scan.il).toEqual(b.scan.il);
    expect(a.scan.xl).toEqual(b.scan.xl);
    expect(a.scan.corners).toEqual(b.scan.corners);
    expect(a.record.brickGrid).toEqual(b.record.brickGrid);
    expect(a.record.stats).toEqual(b.record.stats);
    const keys = (await a.spool.keys()).sort();
    expect(keys).toEqual((await b.spool.keys()).sort());
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) {
      expect(Buffer.compare(Buffer.from(await a.spool.get(k)), Buffer.from(await b.spool.get(k)))).toBe(0);
    }
  });

  test('a compressed ZGY decodes through the ZFP wasm and gives its clip from whole bricks', async () => {
    const view = await importSourceReader(fileOf(bytesOf('gen-zfp-snr30'), 'stack.zgy'));
    const info = zgySummary(view);
    expect(info).toMatchObject({ version: 4, stored: 'float32', compressed: true, vertical: 'time', verticalUnit: 'ms', firstSample: 500 });
    const clip = await sourceClip(view);
    expect(clip.clip).toBeGreaterThan(100);
    expect(clip.maxAbs).toBeLessThan(1050);
    const plain = await importSourceReader(fileOf(bytesOf('gen-int8'), 'plain.zgy'));
    expect(await sourceClip(plain)).toBeNull();
    const scan = await scanGeometry(view, {}, {});
    expect(scan.totalTraces).toBe(66 * 70);
  });

  test('a legacy Petrel compressed ZGY is refused with the re-export advice', async () => {
    const u8 = new Uint8Array(bytesOf('gen-int8'));
    u8.set([0x56, 0x43, 0x53, 0], 0);
    await expect(importSourceReader(fileOf(u8.buffer, 'old.zgy'))).rejects.toThrow(/export the volume as SEG-Y/);
  });

  test('the server import uploads the ZGY as it is (the worker reads it); the row records the ZGY', async () => {
    const file = fileOf(bytesOf('gen-int8'), 'legacy.zgy');
    let uploaded = null;
    let prepared = null;
    await startServerImport({ file, mapping: {}, scan: {}, nativeCrs: null }, {
      upload: async (sent) => { uploaded = sent; return { id: 'ds1' }; },
      prepare: async (p) => { prepared = p; return { volumeId: 'v1', name: 'legacy', crsPlan: null, ingestRec: {} }; },
      enqueue: async () => 'job1',
      fingerprint: async () => ({ algo: 'x' }),
    });
    expect(uploaded).toBe(file);
    expect(prepared.file).toBe(file);
  });
});

// owner report 2026-10-17: a real ZGY hung at "Scanning headers". The scan,
// the door and the trace-delay check read only trace headers; the header-only
// view must give the same answers while reading no brick at all.
describe('header-only ZGY view (scan)', () => {
  const counting = (buf) => {
    const reads = [];
    return {
      reads,
      file: {
        name: 'big.zgy', size: buf.byteLength, lastModified: 1,
        slice: (a, b) => ({ arrayBuffer: async () => { reads.push([a, b - a]); return buf.slice(a, b); } }),
      },
    };
  };

  test.each(['gen-zfp-snr30', 'gen-int16', 'Empty-v1'])('%s: same scan as the full view, no brick read', async (name) => {
    const buf = bytesOf(name);
    const full = await importSourceReader(fileOf(buf, `${name}.zgy`));
    const { reads, file } = counting(buf);
    const lite = await importSourceReader(file, { headersOnly: true });
    expect(lite.headersOnly).toBe(true);
    const a = await scanGeometry((await openSegyDoor(full)).reader, {}, { maxTraces: 500 });
    reads.length = 0;   // opening reads the header and brick table; the scan itself must read nothing
    const b = await scanGeometry((await openSegyDoor(lite)).reader, {}, { maxTraces: 500 });
    expect(b).toEqual(a);
    expect(reads).toEqual([]);
  });

  test('headers are the full view\'s bytes, samples are zeros', async () => {
    const buf = bytesOf('gen-int8');
    const full = await importSourceReader(fileOf(buf, 'a.zgy'));
    const lite = await importSourceReader(fileOf(buf, 'a.zgy'), { headersOnly: true });
    const tb = full.zgy.layout.traceBytes;
    const off = 3600 + 7 * tb - 100;
    const len = 3 * tb + 50;
    const f = new Uint8Array(await full.read(off, len));
    const l = new Uint8Array(await lite.read(off, len));
    for (let p = 0; p < len; p++) {
      const inTrace = (off + p - 3600) % tb;
      if (inTrace < 240) expect(l[p]).toBe(f[p]);
      else expect(l[p]).toBe(0);
    }
    // negative control: the full view's samples are not all zero here
    expect(f.some((v, p) => (off + p - 3600) % tb >= 240 && v !== 0)).toBe(true);
  });
});
