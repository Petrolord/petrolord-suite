/**
 * BF-U2-015: Basin's 1D overpressure handed to Pore Pressure Studio through
 * src/lib/basinPressure.js. The chain: the engine's column (Pa) is written
 * with its declared unit, read back through src/lib/ppfgUnits.js, and shown
 * by Pore Pressure's note. A payload that declares psi reads to the same MPa;
 * one that declares a unit that is not a pressure is refused.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimulationEngine } from '../../../packages/engines/engines/basin/SimulationEngine';
import { buildBasinPressure, writeBasinPressure, readBasinPressure, BF_PRESSURE_SCHEMA } from '../basinPressure';
import BasinPressureNote from '@/pages/apps/PorePressureStudio/components/BasinPressureNote';

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };

const fast = {
  stratigraphy: [
    { id: 'young', name: 'Young shale', lithology: 'shale', ageStart: 6, ageEnd: 0, thickness: 2500, provenance: { top_tvd_m: 120 } },
    { id: 'deep', name: 'Deep shale', lithology: 'shale', ageStart: 12, ageEnd: 6, thickness: 2500, provenance: { top_tvd_m: 2620 } },
  ],
  heatFlow: { type: 'constant', value: 55 }, erosionEvents: [], settings: { surfaceTemp: 10, registryWellId: 'w1', registryWellName: 'KETA-2', registryKbM: 25 },
};
let results;
beforeAll(async () => { results = await SimulationEngine.run(fast); }, 120000);

test('the payload declares MPa and metres and reads back to the engine column', () => {
  const p = buildBasinPressure(results, { name: 'Fast shale', settings: fast.settings, stratigraphy: fast.stratigraphy });
  expect(p).toMatchObject({ schema: BF_PRESSURE_SCHEMA, unit: { depth: 'm', pressure: 'MPa' }, depthRef: 'tvd_below_model_surface', topTvdBelowKbM: 120, model: { registryWellName: 'KETA-2', kbM: 25 } });
  const st = memStore();
  const id = writeBasinPressure(p, st);
  const r = readBasinPressure(id, st);
  expect(r.ok).toBe(true);
  const col = results.data.column;
  expect(r.rows).toHaveLength(col.length);
  r.rows.forEach((row, i) => {
    expect(row.tvdM).toBe(col[i].depth);
    expect(row.poreMpa).toBeCloseTo(col[i].porePressurePa / 1e6, 9);
    expect(row.overburdenMpa).toBeCloseTo(col[i].overburdenPa / 1e6, 9);
    expect(row.poreMpa).toBeGreaterThanOrEqual(row.hydrostaticMpa - 1e-9);
  });
  expect(r.rows[r.rows.length - 1].poreMpa - r.rows[r.rows.length - 1].hydrostaticMpa).toBeGreaterThan(5);
  expect(p.notes.join(' ')).toMatch(/Overpressure up to/);
});

test('the declared unit is what is read: psi converts, a mud weight or a non-pressure is refused', () => {
  const p = buildBasinPressure(results, { name: 'Fast shale' });
  const st = memStore();
  const psi = { ...p, id: 'psi', unit: { depth: 'm', pressure: 'psi' }, rows: p.rows.map((r) => ({ tvdM: r.tvdM, hydrostatic: r.hydrostatic * 145.03773773, porePressure: r.porePressure * 145.03773773, overburden: r.overburden * 145.03773773 })) };
  writeBasinPressure(psi, st);
  const r = readBasinPressure('psi', st);
  expect(r.ok).toBe(true);
  expect(r.rows[10].poreMpa).toBeCloseTo(p.rows[10].porePressure, 6);
  // control: the same numbers declared as MPa would be 145 times too high
  writeBasinPressure({ ...psi, id: 'wrong', unit: { depth: 'm', pressure: 'MPa' } }, st);
  expect(readBasinPressure('wrong', st).rows[10].poreMpa).toBeGreaterThan(100 * p.rows[10].porePressure);
  writeBasinPressure({ ...p, id: 'ppg', unit: { depth: 'm', pressure: 'ppg' } }, st);
  expect(readBasinPressure('ppg', st)).toMatchObject({ ok: false, reason: expect.stringMatching(/gradient or mud weight/) });
  writeBasinPressure({ ...p, id: 'vv', unit: { depth: 'm', pressure: 'V/V' } }, st);
  expect(readBasinPressure('vv', st)).toMatchObject({ ok: false, reason: expect.stringMatching(/not a pressure/) });
  writeBasinPressure({ ...p, id: 'ft', unit: { depth: 'ft', pressure: 'MPa' } }, st);
  expect(readBasinPressure('ft', st).ok).toBe(false);
  expect(readBasinPressure('missing', st).ok).toBe(false);
  expect(() => buildBasinPressure({ data: {} })).toThrow(/Run the model first/);
});

test('Pore Pressure Studio shows the handoff with its depth reference and unit', () => {
  const p = buildBasinPressure(results, { name: 'Fast shale', settings: fast.settings, stratigraphy: fast.stratigraphy });
  writeBasinPressure(p);
  window.history.pushState({}, '', `/?bfPressure=${p.id}`);
  render(<BasinPressureNote />);
  const note = screen.getByTestId('pp-bf-pressure');
  expect(note).toHaveTextContent('Basin model pressure: Fast shale');
  expect(note).toHaveTextContent('120 m TVD below KB at KETA-2');
  expect(note).toHaveTextContent('Declared unit MPa');
  expect(screen.getByTestId('pp-bf-pressure-table').querySelectorAll('tbody tr').length).toBeGreaterThan(5);
  window.history.pushState({}, '', '/');
});
