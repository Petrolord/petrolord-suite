/**
 * Phase 0 acceptance: the committed segyio goldens are loadable and the
 * decode approach is bit-identical to segyio before any app code is
 * built around it (docs/scope/Seismolord-PLAN.md, Phase 0).
 *
 * Fixtures come from tools/validation/seismolord/ (generator hand-rolls
 * the SEG-Y bytes; segyio — an independent implementation — produced the
 * goldens by reading them back).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import {
  TEXT_HEADER_BYTES,
  BIN_HEADER_BYTES,
  TRACE_HEADER_BYTES,
  ibm32ToNumber,
  decodeSamples,
  readBinaryHeader,
  readHeaderInt32,
  readHeaderInt16,
  applyCoordScalar,
} from '@/pages/apps/Seismolord/engine/segyDecode';
import { SurfaceParser } from '@/pages/apps/ReservoirCalcPro/services/SurfaceParser';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');
const VOLUMES = ['dome_ibm', 'dome_ieee', 'dome_oddbytes'];

const loadGolden = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.json`), 'utf8'));

const loadSegy = (name) => {
  const buf = fs.readFileSync(path.join(DATA_DIR, 'segy', `${name}.sgy`));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

const blobToFloat32 = (blob) => {
  const bytes = Buffer.from(blob.base64, 'base64');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(blob.sha256);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};

/** Decode a whole fixture volume with the app decoder, honouring the
 *  golden's il/xl byte mapping. Returns { header, traces: Map } where the
 *  map is keyed `${il}:${xl}` -> Float32Array. */
function decodeVolume(name, golden) {
  const view = new DataView(loadSegy(name));
  const header = readBinaryHeader(new DataView(view.buffer, TEXT_HEADER_BYTES, BIN_HEADER_BYTES));
  const { il_byte: ilByte, xl_byte: xlByte, n_il, n_xl, ns } = golden.geometry;
  expect(header.ns).toBe(ns);
  expect(header.dtUs).toBe(golden.geometry.dt_us);
  expect(header.formatCode).toBe(golden.sample_format);

  const traceBytes = TRACE_HEADER_BYTES + ns * 4;
  const total = (view.byteLength - TEXT_HEADER_BYTES - BIN_HEADER_BYTES) / traceBytes;
  expect(total).toBe(n_il * n_xl);

  const traces = new Map();
  const headers = new Map();
  for (let t = 0; t < total; t++) {
    const off = TEXT_HEADER_BYTES + BIN_HEADER_BYTES + t * traceBytes;
    const th = new DataView(view.buffer, off, TRACE_HEADER_BYTES);
    const il = readHeaderInt32(th, ilByte);
    const xl = readHeaderInt32(th, xlByte);
    traces.set(`${il}:${xl}`, decodeSamples(view, off + TRACE_HEADER_BYTES, ns, header.formatCode));
    headers.set(`${il}:${xl}`, th);
  }
  return { header, traces, headers };
}

const asBits = (f32) => new Uint32Array(f32.buffer, f32.byteOffset, f32.length);

describe.each(VOLUMES)('golden volume %s', (name) => {
  const golden = loadGolden(name);

  test('golden structure and geometry are intact', () => {
    const g = golden.geometry;
    expect(g.n_il * g.n_xl).toBeGreaterThan(0);
    expect([1, 5]).toContain(golden.sample_format);
    expect(golden.traces.length).toBeGreaterThanOrEqual(8);
    const fileBytes = fs.readFileSync(path.join(DATA_DIR, golden.file));
    expect(crypto.createHash('sha256').update(fileBytes).digest('hex'))
      .toBe(golden.file_sha256);
  });

  test('every golden sample is an exact float32 value', () => {
    for (const t of golden.traces) {
      for (const v of t.samples) {
        expect(Math.fround(v)).toBe(v);
      }
    }
  });

  test('app decode is bit-identical to segyio for all golden traces', () => {
    const { traces } = decodeVolume(name, golden);
    for (const t of golden.traces) {
      const decoded = traces.get(`${t.il}:${t.xl}`);
      expect(decoded).toBeDefined();
      const expected = Float32Array.from(t.samples);
      expect(Array.from(asBits(decoded))).toEqual(Array.from(asBits(expected)));
    }
  });

  test('reassembled slices match segyio slices bit-for-bit', () => {
    const { traces } = decodeVolume(name, golden);
    const g = golden.geometry;
    const [il0, il1] = g.ilines;
    const [xl0, xl1] = g.xlines;

    const inlineRef = blobToFloat32(golden.slices.inline);
    const ourInline = new Float32Array(inlineRef.length);
    for (let xl = xl0; xl <= xl1; xl++) {
      ourInline.set(traces.get(`${golden.slices.inline.il}:${xl}`), (xl - xl0) * g.ns);
    }
    expect(Array.from(asBits(ourInline))).toEqual(Array.from(asBits(inlineRef)));

    const timeRef = blobToFloat32(golden.slices.time);
    const k = golden.slices.time.sample_index;
    const ourTime = new Float32Array(timeRef.length);
    for (let il = il0; il <= il1; il++) {
      for (let xl = xl0; xl <= xl1; xl++) {
        ourTime[(il - il0) * g.n_xl + (xl - xl0)] = traces.get(`${il}:${xl}`)[k];
      }
    }
    expect(Array.from(asBits(ourTime))).toEqual(Array.from(asBits(timeRef)));
  });

  test('decoded volume statistics match segyio', () => {
    const { traces } = decodeVolume(name, golden);
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (const t of traces.values()) {
      for (const v of t) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
        sumSq += v * v;
        n += 1;
      }
    }
    expect(min).toBe(golden.stats.min);
    expect(max).toBe(golden.stats.max);
    expect(sum / n).toBeCloseTo(golden.stats.mean, 12);
    expect(Math.sqrt(sumSq / n)).toBeCloseTo(golden.stats.rms, 12);
  });

  test('coordinate scalar (byte 71) reproduces segyio world coordinates', () => {
    const { headers } = decodeVolume(name, golden);
    const g = golden.geometry;
    const cornerKeys = {
      first: `${g.ilines[0]}:${g.xlines[0]}`,
      last: `${g.ilines[1]}:${g.xlines[1]}`,
    };
    for (const [corner, key] of Object.entries(cornerKeys)) {
      const th = headers.get(key);
      const scalar = readHeaderInt16(th, 71);
      expect(scalar).toBe(g.coord_scalar);
      expect(applyCoordScalar(readHeaderInt32(th, 181), scalar))
        .toBe(golden.corner_coords[corner].x);
      expect(applyCoordScalar(readHeaderInt32(th, 185), scalar))
        .toBe(golden.corner_coords[corner].y);
    }
  });
});

describe('non-default header mapping (dome_oddbytes)', () => {
  const golden = loadGolden('dome_oddbytes');

  test('bytes 189/193 hold the poison value, not inline/xline', () => {
    const { headers } = decodeVolume('dome_oddbytes', golden);
    const poison = golden.geometry.poison_at_189_193;
    expect(poison).toBe(9999);
    for (const th of headers.values()) {
      expect(readHeaderInt32(th, 189)).toBe(poison);
      expect(readHeaderInt32(th, 193)).toBe(poison);
    }
  });

  test('a decoder hardcoding 189/193 would see no geometry at all', () => {
    // Guards the "user-mappable bytes" requirement: every trace collapses
    // onto the single poison (il, xl) pair when the default bytes are used.
    const view = new DataView(loadSegy('dome_oddbytes'));
    const g = golden.geometry;
    const traceBytes = TRACE_HEADER_BYTES + g.ns * 4;
    const seen = new Set();
    for (let t = 0; t < g.n_il * g.n_xl; t++) {
      const off = TEXT_HEADER_BYTES + BIN_HEADER_BYTES + t * traceBytes;
      const th = new DataView(view.buffer, off, TRACE_HEADER_BYTES);
      seen.add(`${readHeaderInt32(th, 189)}:${readHeaderInt32(th, 193)}`);
    }
    expect(seen.size).toBe(1);
  });
});

describe('IBM float decode specifics', () => {
  test('IBM and IEEE volumes differ only by IBM quantisation', () => {
    const ibm = loadGolden('dome_ibm');
    const ieee = loadGolden('dome_ieee');
    let maxDiff = 0;
    let anyDiff = false;
    for (let i = 0; i < ibm.traces.length; i++) {
      for (let s = 0; s < ibm.traces[i].samples.length; s++) {
        const d = Math.abs(ibm.traces[i].samples[s] - ieee.traces[i].samples[s]);
        if (d > 0) anyDiff = true;
        if (d > maxDiff) maxDiff = d;
      }
    }
    expect(anyDiff).toBe(true);          // the two encodings genuinely differ
    expect(maxDiff).toBeLessThan(1e-6);  // ...but only at quantisation level
  });

  test('IBM zero word decodes to exact zero', () => {
    expect(ibm32ToNumber(0)).toBe(0);
    expect(Object.is(ibm32ToNumber(0), 0)).toBe(true);
  });
});

describe('surface export goldens', () => {
  const meta = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'surfaces', 'dome_surface_meta.json'), 'utf8'));

  test('GRV truth: analytic and numeric integration agree', () => {
    const { grv } = meta;
    const relErr = Math.abs(grv.grv_acre_ft_analytic - grv.grv_acre_ft_numeric_1m_grid)
      / grv.grv_acre_ft_analytic;
    expect(relErr).toBeLessThan(1e-4);
  });

  test('XYZ reference imports cleanly through ReservoirCalc Pro SurfaceParser', async () => {
    const content = fs.readFileSync(
      path.join(DATA_DIR, 'surfaces', 'dome_surface.xyz'), 'utf8');
    const file = new File([content], 'dome_surface.xyz');
    const result = await SurfaceParser.parse(file);

    // All 1.0E+30 null rows filtered, every live node retained.
    expect(result.points.length).toBe(meta.live_nodes);
    const zs = result.points.map((p) => p.z);
    expect(Math.min(...zs)).toBeCloseTo(meta.z_min_ft, 6);
    expect(Math.max(...zs)).toBeCloseTo(meta.z_max_ft, 6);
    // Playbook convention holds: depth surfaces are negative-down.
    expect(Math.max(...zs)).toBeLessThan(0);
  });
});
