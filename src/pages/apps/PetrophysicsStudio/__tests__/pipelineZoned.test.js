// PS3: zone-aware pipeline vs the ZONED golden (oracle composition of
// the validated scalars per depth window) at 1e-12, plus the two
// structural invariants: an empty override list IS computeWell, and
// overlap resolution is first-zone-wins after sorting by top.

import fs from 'fs';
import path from 'path';
import { computeWell, computeWellZoned, zoneSummary, DEFAULT_PARAMS } from '../engine/pipeline';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));

const curves = {
  DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'),
  NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT'),
};
const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

const zoneList = () => {
  const zp = goldens.ZONED.zone_params;
  return Object.entries(typewell.params.zones)
    .filter(([name]) => zp[name])
    .map(([name, [top, base]]) => ({ top, base, params: zp[name] }));
};

test('empty override list reproduces computeWell exactly (sample-for-sample)', () => {
  const a = computeWell(curves, DEFAULT_PARAMS);
  const b = computeWellZoned(curves, DEFAULT_PARAMS, []);
  expect(Object.keys(b.outputs).sort()).toEqual(Object.keys(a.outputs).sort());
  expect(b.missing).toEqual(a.missing);
  for (const key of Object.keys(a.outputs)) {
    const x = a.outputs[key];
    const y = b.outputs[key];
    for (let i = 0; i < x.length; i++) {
      if (Number.isNaN(x[i])) expect(Number.isNaN(y[i])).toBe(true);
      else expect(y[i]).toBe(x[i]);
    }
  }
});

test('zoned SW and PAY match the oracle golden at 1e-12', () => {
  const { outputs } = computeWellZoned(curves, DEFAULT_PARAMS, zoneList());
  const wantSw = goldens.ZONED.SW;
  const wantPay = goldens.ZONED.PAY;
  for (let i = 0; i < wantSw.length; i++) {
    if (wantSw[i] === null) expect(Number.isNaN(outputs.SW[i])).toBe(true);
    else expect(close(outputs.SW[i], wantSw[i])).toBe(true);
    if (wantPay[i] === null) expect(Number.isNaN(outputs.PAY[i])).toBe(true);
    else expect(outputs.PAY[i]).toBe(wantPay[i]);
  }
});

test('per-zone summaries with merged params match the golden', () => {
  const { outputs } = computeWellZoned(curves, DEFAULT_PARAMS, zoneList());
  for (const [name, want] of Object.entries(goldens.ZONED.zones)) {
    const [top, base] = typewell.params.zones[name];
    const merged = { ...DEFAULT_PARAMS, ...goldens.ZONED.zone_params[name] };
    const s = zoneSummary(curves, outputs, merged, { top_md_m: top, base_md_m: base });
    for (const key of Object.keys(want.summary)) {
      const w = want.summary[key];
      if (w === null) expect(s[key]).toBeNull();
      else expect(close(s[key], w)).toBe(true);
    }
  }
});

test('overlapping zones: sorted by top, first match wins', () => {
  const depth = Float64Array.from([0, 1, 2, 3, 4]);
  const gr = Float64Array.from([70, 70, 70, 70, 70]);
  const rhob = Float64Array.from([2.4, 2.4, 2.4, 2.4, 2.4]);
  const rt = Float64Array.from([10, 10, 10, 10, 10]);
  const c = { DEPT: depth, GR: gr, RHOB: rhob, RT: rt };
  // both zones cover sample 2; the zone with the SHALLOWER top wins
  // even though it is listed second
  const { outputs } = computeWellZoned(c, DEFAULT_PARAMS, [
    { top: 2, base: 4, params: { rw: 0.1 } },
    { top: 0, base: 2, params: { rw: 0.2 } },
  ]);
  const sw = (rw) => computeWell(c, { ...DEFAULT_PARAMS, rw }).outputs.SW[0];
  expect(outputs.SW[2]).toBe(sw(0.2));
  expect(outputs.SW[3]).toBe(sw(0.1));
  expect(outputs.SW[1]).toBe(sw(0.2));
});
