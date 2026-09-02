// PS2: LAS 2.0 writer round-trip gate. The contract is
// parseLas(writeLas(x)) reproduces every curve bit-for-bit after the
// float32 cast (modulo the sign of zero) and the header semantically.
// Also re-writes a committed parser fixture and re-parses it, so the
// writer is exercised against real-file shapes, not just synthetics.

import fs from 'fs';
import path from 'path';
import { parseLas } from '../engine/lasParse';
import { writeLas } from '../engine/lasWrite';

const FIXTURES = path.join(__dirname, '..', '..', '..', '..', '..',
  'packages', 'engines', 'test-data', 'wells', 'las');

const expectSameSamples = (got, want) => {
  expect(got.length).toBe(want.length);
  for (let i = 0; i < want.length; i++) {
    const a = got[i];
    const b = Math.fround(want[i]);
    if (Number.isNaN(b)) expect(Number.isNaN(a)).toBe(true);
    else expect(a).toBe(b);
  }
};

const depth = Float32Array.from({ length: 40 }, (_, i) => 2000 + i * 0.5);

test('synthetic curves round-trip bit-for-bit, nulls preserved as NaN', () => {
  const gr = Float32Array.from({ length: 40 }, (_, i) => 20 + 100 * Math.abs(Math.sin(i / 3)));
  gr[7] = NaN;
  gr[8] = NaN;
  const phi = Float32Array.from({ length: 40 }, (_, i) => 0.05 + 0.002 * i);
  const text = writeLas({
    wellName: 'KETA TYPE-1',
    curves: [
      { mnemonic: 'DEPT', unit: 'M', descr: 'Measured depth', data: depth },
      { mnemonic: 'GR', unit: 'API', descr: 'Gamma ray', data: gr },
      { mnemonic: 'PHIE', unit: 'V/V', descr: 'Effective porosity', data: phi },
    ],
    params: [{ name: 'PIPELINE', value: 1, descr: 'pipeline version' }],
  });
  const parsed = parseLas(text);
  expect(parsed.version).toBe(2);
  expect(parsed.wrap).toBe('NO');
  expect(parsed.well.WELL.value).toBe('KETA TYPE-1');
  expect(parsed.well.STEP.value).toBeCloseTo(0.5, 6);
  expect(parsed.params.PIPELINE.value).toBe(1);
  expect(parsed.curves.map((c) => c.mnemonic)).toEqual(['DEPT', 'GR', 'PHIE']);
  expectSameSamples(parsed.curves[0].data, depth);
  expectSameSamples(parsed.curves[1].data, gr);
  expectSameSamples(parsed.curves[2].data, phi);
  expect(parsed.curves[1].nullCount).toBe(2);
});

test('irregular sampling writes STEP 0 and still round-trips', () => {
  const d = Float32Array.from([1000, 1000.5, 1001.2, 1003, 1003.1]);
  const v = Float32Array.from([1, 2, 3, 4, 5]);
  const parsed = parseLas(writeLas({
    wellName: 'IRR-1',
    curves: [
      { mnemonic: 'DEPT', unit: 'M', data: d },
      { mnemonic: 'RT', unit: 'OHMM', data: v },
    ],
  }));
  expect(parsed.well.STEP.value).toBe(0);
  expectSameSamples(parsed.curves[0].data, d);
  expectSameSamples(parsed.curves[1].data, v);
});

test('null value moves off -999.25 when the data contains it', () => {
  const d = Float32Array.from([0, 1, 2]);
  const v = Float32Array.from([-999.25, NaN, 5]);
  const parsed = parseLas(writeLas({
    wellName: 'COLLIDE-1',
    curves: [
      { mnemonic: 'DEPT', unit: 'M', data: d },
      { mnemonic: 'X', unit: '', data: v },
    ],
  }));
  expect(parsed.nullValue).not.toBe(-999.25);
  expectSameSamples(parsed.curves[1].data, v);
});

test('dirty mnemonics, units and text are sanitised into the parseable subset', () => {
  const d = Float32Array.from([0, 1]);
  const parsed = parseLas(writeLas({
    wellName: 'Weird: name',
    curves: [
      { mnemonic: 'DEPT', unit: 'M', data: d },
      { mnemonic: 'GR:1', unit: 'ohm m', descr: 'colon: in descr', data: d },
      { mnemonic: 'GR.1', unit: '', data: d },
    ],
  }));
  expect(parsed.well.WELL.value).toBe('Weird  name');
  expect(parsed.curves.map((c) => c.mnemonic)).toEqual(['DEPT', 'GR_1', 'GR_1_']);
  expect(parsed.curves[1].unit).toBe('ohm_m');
  expect(parsed.curves[1].descr).toBe('colon  in descr');
});

test('extreme float32 values survive the 9-significant-digit tokens', () => {
  const d = Float32Array.from([0, 1, 2, 3, 4]);
  const v = Float32Array.from([3.4028234e38, 1.1754944e-38, -1.9999999, 0.30000001, 123456.789]);
  const parsed = parseLas(writeLas({
    wellName: 'EXTREME-1',
    curves: [
      { mnemonic: 'DEPT', unit: 'M', data: d },
      { mnemonic: 'V', unit: '', data: v },
    ],
  }));
  expectSameSamples(parsed.curves[1].data, v);
});

test('a committed parser fixture re-writes and re-parses to the same curves', () => {
  const src = parseLas(fs.readFileSync(path.join(FIXTURES, 'nullheavy_20.las'), 'utf8'));
  const text = writeLas({
    wellName: String(src.well.WELL?.value ?? ''),
    depthUnit: src.depthUnit,
    curves: src.curves.map((c) => ({
      mnemonic: c.mnemonic, unit: c.unit, descr: c.descr, data: c.data,
    })),
  });
  const back = parseLas(text);
  expect(back.curves.map((c) => c.mnemonic)).toEqual(src.curves.map((c) => c.mnemonic));
  src.curves.forEach((c, i) => expectSameSamples(back.curves[i].data, c.data));
});

test('validation errors are domain errors', () => {
  expect(() => writeLas({ curves: [] })).toThrow(/no curves/);
  expect(() => writeLas({
    curves: [
      { mnemonic: 'DEPT', data: Float32Array.from([1, 2]) },
      { mnemonic: 'GR', data: Float32Array.from([1]) },
    ],
  })).toThrow(/samples/);
  expect(() => writeLas({
    nullValue: 5,
    curves: [{ mnemonic: 'DEPT', data: Float32Array.from([4, 5]) }],
  })).toThrow(/null value/i);
});
