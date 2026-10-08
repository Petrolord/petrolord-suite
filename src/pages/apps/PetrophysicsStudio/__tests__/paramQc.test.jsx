/**
 * AppUpgrade PETRO-U2-015: parameter QC hints against the well's own logs.
 * Each case moves one parameter where a graduate would put it wrongly on the
 * type well and asserts the hint (and that the default set raises none);
 * the pipeline outputs come from the shipped engine.
 * Negative control (run 2026-09-29): with paramQcHints returning [] every
 * case but the clean one fails.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';
import { paramQcHints } from '../services/paramQc';
import ParameterPanel from '../components/ParameterPanel';

const curves = {};
for (const [k, v] of Object.entries(typewell.curves)) curves[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
const params = { ...DEFAULT_PARAMS, phiShale: typewell.params.phi_shale };
const hints = (patch) => {
  const p = { ...params, ...patch };
  let outputs = {};
  try { outputs = computeWell(curves, p).outputs; } catch { outputs = {}; } // an inverted GR pair may not compute
  return paramQcHints({ curves, outputs, params: p });
};
const keys = (h) => h.map((x) => x.key);

test('the default set on the type well raises no hint', () => {
  expect(hints({})).toEqual([]);
});

test.each([
  [{ grClean: 90 }, 'grClean', /above this well's median GR/],
  [{ grClay: 40 }, 'grClay', /below this well's median GR/],
  [{ grClean: 130, grClay: 120 }, 'grClay', /must be above GR clean/],
  [{ rhoMa: 2.3 }, 'rhoMa', /denser than the matrix density 2.3/],
  [{ cutPhi: 0.6 }, 'cutPhi', /No sample passes the porosity cutoff 0.6/],
  [{ cutSw: 0.0001 }, 'cutSw', /No sample passes the Sw cutoff/],
  [{ rw: 1.5 }, 'rw', /above the apparent Rwa/],
])('%o gives a %s hint', (patch, key, text) => {
  const h = hints(patch);
  expect(keys(h)).toContain(key);
  expect(h.find((x) => x.key === key).text).toMatch(text);
});

test('the panel shows the hints', () => {
  render(<ParameterPanel params={params} onApply={() => {}} onApplyZone={() => {}} qcHints={hints({ grClean: 90 })} />);
  expect(screen.getByTestId('petro-param-qc-grClean').textContent).toMatch(/median GR/);
});

describe('Wyllie compaction hint (Bcp)', () => {
  // 40 shale samples at 130 us/ft and 40 sands, DT in us/m as the registry holds it
  const n = 80;
  const synth = {
    DEPT: Float64Array.from({ length: n }, (_, i) => 1000 + i),
    GR: Float64Array.from({ length: n }, (_, i) => (i < 40 ? 120 : 25)),
    DT: Float64Array.from({ length: n }, (_, i) => (i < 40 ? 130 : 110) * 3.28084),
  };
  const run = (patch) => {
    const p = { ...DEFAULT_PARAMS, grClean: 20, grClay: 120, vshMethod: 'linear', phiSource: 'sonic', ...patch };
    return paramQcHints({ curves: synth, outputs: computeWell(synth, p).outputs, params: p }).filter((h) => h.key === 'sonicCp');
  };
  test('slow shales with Bcp 1 suggest shale dt / 100', () => {
    const h = run({});
    expect(h).toHaveLength(1);
    expect(h[0].text).toMatch(/130 µs\/ft/);
    expect(h[0].text).toMatch(/Bcp of about 1\.3/);
  });
  test('no hint once Bcp is set near it, with RHG, or when porosity is not from sonic', () => {
    expect(run({ sonicCp: 1.3 })).toEqual([]);
    expect(run({ sonicMethod: 'rhg' })).toEqual([]);
    expect(run({ phiSource: 'density' })).toEqual([]);
  });
  test('a factor below 1 is an error', () => {
    const p = { ...DEFAULT_PARAMS, phiSource: 'sonic', sonicCp: 0.8 };
    expect(paramQcHints({ curves: synth, outputs: {}, params: p })).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sonicCp', level: 'error' })]));
  });
});
