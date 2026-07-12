/**
 * Phase 1 acceptance (docs/scope/Seismolord-PLAN.md):
 *  - streaming scan measures geometry under mappable il/xl bytes
 *  - brick-reassembled slices are bit-identical to segyio slices
 *  - non-default byte positions work end-to-end
 *  - a fixed memory budget holds while ingesting a file larger than it
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { bufferReader } from '@/pages/apps/Seismolord/engine/reader';
import {
  readTextualHeader,
  scanGeometry,
  previewTraceHeaders,
} from '@/pages/apps/Seismolord/engine/segyScan';
import { transcodeToBricks } from '@/pages/apps/Seismolord/engine/brickTranscode';
import {
  MANIFEST_VERSION,
  NULL_VALUE,
  buildManifest,
  brickPath,
  manifestPath,
} from '@/pages/apps/Seismolord/engine/manifest';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');

const loadGolden = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.json`), 'utf8'));

const readerFor = (name) => {
  const buf = fs.readFileSync(path.join(DATA_DIR, 'segy', `${name}.sgy`));
  return bufferReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

const blobToFloat32 = (blob) => {
  const bytes = Buffer.from(blob.base64, 'base64');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(blob.sha256);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};

const asBits = (f32) => Array.from(new Uint32Array(f32.buffer, f32.byteOffset, f32.length));

const mappingFor = (golden) => ({
  ilByte: golden.geometry.il_byte,
  xlByte: golden.geometry.xl_byte,
});

/** Run a transcode collecting every brick; returns {result, bricks map}. */
async function transcodeAll(name, golden, opts = {}) {
  const reader = readerFor(name);
  const scan = await scanGeometry(reader, mappingFor(golden));
  const bricks = new Map();
  const result = await transcodeToBricks(reader, scan, {
    ...opts,
    onBrick: ({ i, j, k, data }) => {
      bricks.set(`${i}-${j}-${k}`, data);
    },
  });
  return { reader, scan, result, bricks };
}

/** Read one sample back out of the brick set by global indices. */
function makeSampler(bricks, brickSize) {
  return (ilIdx, xlIdx, k) => {
    const bi = Math.floor(ilIdx / brickSize);
    const bj = Math.floor(xlIdx / brickSize);
    const bk = Math.floor(k / brickSize);
    const data = bricks.get(`${bi}-${bj}-${bk}`);
    const li = ilIdx - bi * brickSize;
    const lj = xlIdx - bj * brickSize;
    const lk = k - bk * brickSize;
    return data[(li * brickSize + lj) * brickSize + lk];
  };
}

function reassembleSlices(golden, bricks, brickSize) {
  const g = golden.geometry;
  const sample = makeSampler(bricks, brickSize);
  const [il0] = g.ilines;
  const [xl0] = g.xlines;

  const inline = new Float32Array(g.n_xl * g.ns);
  const inlineIdx = golden.slices.inline.il - il0;
  for (let x = 0; x < g.n_xl; x++) {
    for (let k = 0; k < g.ns; k++) inline[x * g.ns + k] = sample(inlineIdx, x, k);
  }

  const time = new Float32Array(g.n_il * g.n_xl);
  const kIdx = golden.slices.time.sample_index;
  for (let i = 0; i < g.n_il; i++) {
    for (let x = 0; x < g.n_xl; x++) time[i * g.n_xl + x] = sample(i, x, kIdx);
  }
  return { inline, time, xl0, il0 };
}

describe('textual header (display-only, may lie)', () => {
  test('decodes EBCDIC and surfaces the odd-bytes header lie', async () => {
    const ibmLines = await readTextualHeader(readerFor('dome_ibm'));
    expect(ibmLines[0]).toContain('PETROLORD SEISMOLORD');
    expect(ibmLines[4]).toContain('INLINE BYTES 189');

    const oddLines = await readTextualHeader(readerFor('dome_oddbytes'));
    const odd = loadGolden('dome_oddbytes');
    // The header claims 189/193; the measured truth is 9/21.
    expect(oddLines[4]).toContain('INLINE BYTES 189-192');
    expect(odd.geometry.il_byte).toBe(9);
    expect(odd.geometry.xl_byte).toBe(21);
  });
});

describe.each(['dome_ibm', 'dome_ieee', 'dome_oddbytes'])('scanGeometry %s', (name) => {
  const golden = loadGolden(name);

  test('measured geometry matches segyio', async () => {
    const scan = await scanGeometry(readerFor(name), mappingFor(golden));
    const g = golden.geometry;
    expect(scan.sampled).toBe(false);
    expect(scan.regular).toBe(true);
    expect(scan.inlineSorted).toBe(true);
    expect(scan.formatCode).toBe(golden.sample_format);
    expect(scan.ns).toBe(g.ns);
    expect(scan.dtUs).toBe(g.dt_us);
    expect(scan.totalTraces).toBe(g.n_il * g.n_xl);
    expect(scan.il).toEqual({ min: g.ilines[0], max: g.ilines[1], step: 1, count: g.n_il });
    expect(scan.xl).toEqual({ min: g.xlines[0], max: g.xlines[1], step: 1, count: g.n_xl });
    expect(scan.coordScalar).toBe(g.coord_scalar);
    expect(scan.corners.first).toEqual({
      x: golden.corner_coords.first.x, y: golden.corner_coords.first.y,
    });
    expect(scan.corners.last).toEqual({
      x: golden.corner_coords.last.x, y: golden.corner_coords.last.y,
    });
    expect(scan.warnings).toEqual([]);
  });
});

describe('scanGeometry edge behaviour', () => {
  test('sampled preview still finds the survey extents', async () => {
    const golden = loadGolden('dome_ibm');
    const scan = await scanGeometry(readerFor('dome_ibm'), mappingFor(golden), { maxTraces: 64 });
    expect(scan.sampled).toBe(true);
    expect(scan.il.min).toBe(golden.geometry.ilines[0]);
    expect(scan.il.max).toBe(golden.geometry.ilines[1]);
    expect(scan.xl.min).toBe(golden.geometry.xlines[0]);
    expect(scan.xl.max).toBe(golden.geometry.xlines[1]);
  });

  test('sampled preview measures il/xl steps > 1 exactly (adjacent-pair sampling)', async () => {
    // L3: strided samples alone feed the step gcd only multiples of the
    // stride — the preview could overestimate the step. Each strided stop
    // now also inspects its immediate neighbour, pinning the gcd to the
    // true step. Steps 2 (il) and 5 (xl); first inline longer than the
    // contiguous head so il changes only in the strided tail.
    const nIl = 40;
    const nXl = 100;
    const ns = 4;
    const traceBytes = 240 + ns * 4;
    const buf = new ArrayBuffer(3600 + nIl * nXl * traceBytes);
    const view = new DataView(buf);
    view.setInt16(3200 + 16, 4000, false);
    view.setInt16(3200 + 20, ns, false);
    view.setInt16(3200 + 24, 5, false);
    let t = 0;
    for (let i = 0; i < nIl; i++) {
      for (let x = 0; x < nXl; x++) {
        const off = 3600 + t * traceBytes;
        view.setInt32(off + 188, 10 + i * 2, false);      // il step 2
        view.setInt32(off + 192, 100 + x * 5, false);     // xl step 5
        t += 1;
      }
    }
    const scan = await scanGeometry(bufferReader(buf), {}, { maxTraces: 64 });
    expect(scan.sampled).toBe(true);
    expect(scan.il).toEqual({ min: 10, max: 10 + (nIl - 1) * 2, step: 2, count: nIl });
    expect(scan.xl).toEqual({ min: 100, max: 100 + (nXl - 1) * 5, step: 5, count: nXl });
  });

  test('wrong (default) mapping on the odd-bytes volume warns loudly', async () => {
    const scan = await scanGeometry(readerFor('dome_oddbytes'));
    expect(scan.il.min).toBe(9999);                 // the poison value
    expect(scan.regular).toBe(false);
    expect(scan.warnings.join(' ')).toMatch(/almost certainly wrong/);
  });

  test('previewTraceHeaders exposes il/xl/coords under a mapping', async () => {
    const golden = loadGolden('dome_oddbytes');
    const rows = await previewTraceHeaders(readerFor('dome_oddbytes'), mappingFor(golden), 5);
    expect(rows).toHaveLength(5);
    expect(rows[0].il).toBe(golden.geometry.ilines[0]);
    expect(rows[0].x).toBe(golden.corner_coords.first.x);
    expect(rows[rows.length - 1].il).toBe(golden.geometry.ilines[1]);
    expect(rows.every((r) => r.scalar === golden.geometry.coord_scalar)).toBe(true);
  });
});

describe.each(['dome_ibm', 'dome_ieee', 'dome_oddbytes'])('transcode %s (64^3 bricks)', (name) => {
  const golden = loadGolden(name);

  test('brick-reassembled slices are bit-identical to segyio slices', async () => {
    const { result, bricks } = await transcodeAll(name, golden);
    const g = golden.geometry;
    expect(result.traceCount).toBe(g.n_il * g.n_xl);
    expect(bricks.size).toBe(result.brickGrid.ni * result.brickGrid.nj * result.brickGrid.nk);

    const { inline, time } = reassembleSlices(golden, bricks, result.brickGrid.brickSize);
    expect(asBits(inline)).toEqual(asBits(blobToFloat32(golden.slices.inline)));
    expect(asBits(time)).toEqual(asBits(blobToFloat32(golden.slices.time)));
  });

  test('statistics exclude padding nulls and match segyio', async () => {
    const { result } = await transcodeAll(name, golden);
    const g = golden.geometry;
    expect(result.stats.live_samples).toBe(g.n_il * g.n_xl * g.ns);
    expect(result.stats.min).toBe(golden.stats.min);
    expect(result.stats.max).toBe(golden.stats.max);
    expect(result.stats.mean).toBeCloseTo(golden.stats.mean, 12);
    expect(result.stats.rms).toBeCloseTo(golden.stats.rms, 12);
  });
});

describe('memory-budgeted transcode', () => {
  const golden = loadGolden('dome_ieee');
  const BUDGET = 128 * 1024;                        // 128 KiB
  const OPTS = { brickSize: 16, memoryBudgetBytes: BUDGET, readChunkBytes: 8 * 1024 };

  test('holds a fixed heap budget while ingesting a file larger than it', async () => {
    const { reader, result } = await transcodeAll('dome_ieee', golden, OPTS);
    expect(reader.size).toBeGreaterThan(BUDGET);    // file > memory budget
    expect(result.passesPerBand).toBeGreaterThan(1); // k-windowing really engaged
    expect(result.peakBytes).toBeLessThanOrEqual(BUDGET);
  });

  test('multi-pass output is still bit-identical to segyio', async () => {
    const { result, bricks } = await transcodeAll('dome_ieee', golden, OPTS);
    const { inline, time } = reassembleSlices(golden, bricks, result.brickGrid.brickSize);
    expect(asBits(inline)).toEqual(asBits(blobToFloat32(golden.slices.inline)));
    expect(asBits(time)).toEqual(asBits(blobToFloat32(golden.slices.time)));
  });

  test('padding cells carry the playbook null value', async () => {
    const { result, bricks } = await transcodeAll('dome_ibm', golden && loadGolden('dome_ibm'));
    const g = loadGolden('dome_ibm').geometry;
    const size = result.brickGrid.brickSize;        // 64 > survey dims
    const data = bricks.get('0-0-0');
    // first out-of-extent inline row is all nulls
    const li = g.n_il;                              // 32, inside the 64 brick
    for (let lj = 0; lj < 4; lj++) {
      expect(data[(li * size + lj) * size]).toBe(Math.fround(NULL_VALUE));
    }
  });

  test('an impossible budget fails with a clear message', async () => {
    const reader = readerFor('dome_ieee');
    const scan = await scanGeometry(reader, mappingFor(golden));
    await expect(transcodeToBricks(reader, scan, {
      memoryBudgetBytes: 1024, onBrick: () => {},
    })).rejects.toThrow(/Memory budget/);
  });
});

describe('manifest v1', () => {
  test('records versioned layout, geometry, stats and paths', async () => {
    const golden = loadGolden('dome_oddbytes');
    const reader = readerFor('dome_oddbytes');
    const scan = await scanGeometry(reader, mappingFor(golden));
    const result = await transcodeToBricks(reader, scan, { onBrick: () => {} });

    const m = buildManifest({
      volumeId: 'vol-1', name: 'Odd bytes dome', scan, transcode: result,
      sourceFileName: 'dome_oddbytes.sgy', sourceFileSize: reader.size,
    });
    expect(m.manifest_version).toBe(MANIFEST_VERSION);
    expect(m.source.il_byte).toBe(9);
    expect(m.source.xl_byte).toBe(21);
    expect(m.geometry.il.count).toBe(golden.geometry.n_il);
    expect(m.brick.size).toBe(64);
    expect(m.brick.count).toBe(1);
    expect(m.brick.null_value).toBe(NULL_VALUE);
    expect(m.stats.min).toBe(golden.stats.min);

    expect(manifestPath('user-1', 'vol-1')).toBe('user-1/vol-1/manifest.json');
    expect(brickPath('user-1', 'vol-1', 0, 1, 2)).toBe('user-1/vol-1/bricks/0-1-2.f32');
  });
});
