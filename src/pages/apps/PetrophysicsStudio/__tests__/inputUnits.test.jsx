/**
 * AppUpgrade PETRO-U2-001: one unit-family table (shared with Rock Physics),
 * every input conversion stated with its reason, and correctable: a setting
 * in the interpretation, or written onto the registry curve for an owned
 * well. NEU / RES_DEEP aliases are covered in hostileChain.test.jsx.
 *
 * Negative controls (run 2026-09-29): with normalizeInputCurve ignoring
 * unitOverride the override cases keep the file's reading and fail; with
 * Rock Physics back on its own regex the "PCT" porosity is not scaled.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { familyMember, isPercentUnit, unitChoices } from '@/components/wells/unitFamilies';
import { normalizeInputCurve, inputCurves } from '@/components/wells/curveUnits';
import { buildModel } from '@/pages/apps/RockPhysicsStudio/services/prep';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

test('the family table: spellings, factors, choices', () => {
  expect(familyMember('NPHI', 'p.u.')).toMatchObject({ unit: 'PU', factor: 0.01 });
  expect(familyMember('RHOB', 'kg/m3')).toMatchObject({ unit: 'KG/M3', factor: 0.001 });
  expect(familyMember('DT', 'usec/ft').factor).toBeCloseTo(1 / 0.3048, 15);
  expect(familyMember('NPHI', 'furlongs')).toBeNull();
  expect(unitChoices('RHOB')).toEqual(['G/C3', 'KG/M3']);
  expect(isPercentUnit('PCT')).toBe(true);
});

test('Rock Physics reads the same table (a PCT porosity is percent), and keeps its old reading of unknown spellings', () => {
  const curves = { DEPT: [1, 2], DT: [300, 300], RHOB: [2.3, 2.3], PHIE: [25, 20] };
  const m = buildModel(curves, { DT: { unit: 'US/M' }, RHOB: { unit: 'G/C3' }, PHIE: { unit: 'PCT' } });
  expect(m.phi).toEqual([0.25, 0.2]);
  // an unknown per-foot spelling still reads per foot (the old pattern)
  const f = buildModel({ ...curves, PHIE: [0.25, 0.2] }, { DT: { unit: 'MICROSECONDS/FT' }, RHOB: { unit: 'G/C3' }, PHIE: { unit: 'V/V' } });
  expect(f.vp[0]).toBeCloseTo((1e6 * 0.3048) / 300, 9);
});

test('every conversion carries its reason; the user setting wins over the file and the range check', () => {
  const pu = Float64Array.from([25, 30, 35]);
  const byRange = normalizeInputCurve('NPHI', { mnemonic: 'NPHI', unit: 'V/V' }, pu);
  expect(byRange.decision).toMatchObject({ readAs: 'PU', factor: 0.01, reason: 'range' });
  const set = normalizeInputCurve('NPHI', { mnemonic: 'NPHI', unit: 'V/V' }, pu, { unitOverride: 'PU' });
  expect(set.decision).toMatchObject({ readAs: 'PU', reason: 'override' });
  expect(set.notes[0]).toMatch(/your setting in Input units/);
  // a PU label on numbers that are really v/v: the user says v/v, nothing is divided
  const vv = Float64Array.from([0.25, 0.3]);
  const keep = normalizeInputCurve('NPHI', { mnemonic: 'NPHI', unit: 'PU' }, vv, { unitOverride: 'V/V' });
  expect(Array.from(keep.data)).toEqual([0.25, 0.3]);
  expect(keep.decision).toMatchObject({ readAs: 'V/V', factor: 1, reason: 'override' });
  const r = inputCurves({ RHOB: { mnemonic: 'DEN', unit: '' } }, { DEN: Float64Array.from([2350, 2400]) }, { unitOverrides: { DEN: 'KG/M3' } });
  expect(Array.from(r.curves.RHOB)).toEqual([2.35, 2.4]);
  expect(r.decisions[0]).toMatchObject({ key: 'RHOB', mnemonic: 'DEN', reason: 'override' });
});

test('in the workstation: the table shows the reading, a setting re-reads the inputs, Save to well writes the unit', async () => {
  const backend = makeInMemoryBackend();
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  const rows = await screen.findAllByTestId('petro-well-row');
  fireEvent.click(rows.find((r) => /KETA TYPE-1/.test(r.textContent)));
  const net0 = (await screen.findByTestId('petro-zone-net-SAND A', {}, { timeout: 10000 })).textContent;
  fireEvent.click(screen.getByTestId('petro-input-units-open'));
  expect(screen.getByTestId('petro-input-units-readas-RHOB').textContent).toBe('G/C3');
  expect(screen.getByTestId('petro-input-units-why-RHOB').textContent).toMatch(/stored on the curve/);
  // say the density is kg/m3: it is divided by 1000 and the zone answer moves
  fireEvent.change(screen.getByTestId('petro-input-units-set-RHOB'), { target: { value: 'KG/M3' } });
  await waitFor(() => expect(screen.getByTestId('petro-input-units-why-RHOB').textContent).toMatch(/your setting/));
  expect(screen.getByTestId('petro-status').textContent).toMatch(/read as KG\/M3 in this interpretation/);
  await waitFor(() => expect(screen.getByTestId('petro-zone-net-SAND A').textContent).not.toBe(net0));
  // back to Auto, then write a unit to the registry curve
  fireEvent.change(screen.getByTestId('petro-input-units-set-RHOB'), { target: { value: '' } });
  await waitFor(() => expect(screen.getByTestId('petro-zone-net-SAND A').textContent).toBe(net0));
  fireEvent.change(screen.getByTestId('petro-input-units-set-DT'), { target: { value: 'US/FT' } });
  fireEvent.click(await screen.findByTestId('petro-input-units-save-DT'));
  await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/every app now reads that unit/));
  const well = (await backend.listWells()).find((w) => w.name === 'KETA TYPE-1');
  const dt = (await backend.listLogs(well.id)).find((l) => l.mnemonic === 'DT');
  expect(dt.unit).toBe('US/FT');
  expect(dt.provenance.unit_corrected).toMatchObject({ to: 'US/FT', by_app: 'petrophysics-studio' });
  await waitFor(() => expect(within(screen.getByTestId('petro-input-units-dialog')).getByTestId('petro-input-units-why-DT').textContent).toMatch(/stored on the curve/));
}, 60000);
