/**
 * QI course gate E2 parity (2026-10-11): the QI maths moved from these
 * services into the engines (engines/qi/avoWells, inversionQc, angleWavelets,
 * propertyCalibration, prospectTrap and engines/seismolord/wellWavelet), and
 * the services became thin re-exports. The QI videos were recorded on the
 * numbers these services gave, so every output recorded on the Ekene kit cases
 * BEFORE the move (fixtures/qiEngineParity.ekene.json, written by
 * tools/qi-parity/captureEkeneParity.js on Suite 5df9d9410 / engines cc4c62d)
 * must come back unchanged: exactly equal, with 1e-9 as the outer bound.
 */
import fixture from './fixtures/qiEngineParity.ekene.json';
import { runParityCases, hydrate } from '../../../../../tools/qi-parity/parityCases';

const TOL = 1e-9;

/** Walk two plain-JSON values; collect every leaf that differs (numbers beyond TOL, anything else by identity). */
function diffs(a, b, path = '$', out = []) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (!(a === b || Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a)))) out.push(`${path}: ${a} != ${b}`);
    return out;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { out.push(`${path}: shape`); return out; }
    a.forEach((v, i) => diffs(v, b[i], `${path}[${i}]`, out));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diffs(a[k], b[k], `${path}.${k}`, out);
    return out;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  return out;
}

let now;
beforeAll(() => { now = runParityCases(hydrate(fixture.inputs)); });

describe('QI Studio outputs on the Ekene cases are unchanged by the move into the engines', () => {
  test.each(Object.keys(fixture.outputs))('%s', (key) => {
    expect(diffs(fixture.outputs[key], now[key], key)).toEqual([]);
  });
  test('byte for byte: the whole record serialises identically', () => {
    expect(JSON.stringify(now)).toBe(JSON.stringify(fixture.outputs));
  });
  test('the record is not empty and covers every moved function', () => {
    for (const k of ['compareAtWells', 'waveletScale', 'blindAbsolute', 'blindColoured', 'angleWavelets', 'wellWavelet', 'porosity', 'facies2d', 'faciesKde', 'climbToCrest', 'prospect']) {
      expect(fixture.outputs[k]).toBeDefined();
    }
    expect(fixture.outputs.blindAbsolute.length).toBe(5);
    expect(fixture.outputs.prospect.trap.columnM).toBeGreaterThan(0);
  });
  test('negative control: the comparison sees a change in the ninth figure', () => {
    const moved = JSON.parse(JSON.stringify(fixture.outputs.waveletScale));
    moved.scale *= 1 + 1e-8;
    expect(diffs(fixture.outputs.waveletScale, moved).length).toBe(1);
  });
});
