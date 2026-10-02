// Wellsite Studio upgrade U2-002 (2026-10-01): chromatograph readings and
// gas ratios. The service calls the shipped engine (gasRatios.js); the
// expected ratios are the hand arithmetic of the engine gate, written out
// beside each case. The screen test types a reading on the real workstation.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS } from '../services/seed';
import { GAS_SUBTYPE, parseComponents, chromatographParams, gasReading, gasText, componentsPpm } from '../services/gas';
import { observationLabel } from '../services/observations';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

describe('service: a reading through the shipped engine', () => {
  // C1 85,000, C2 4,000, C3 8,000, iC4 800, nC4 1,200, iC5 400, nC5 600 ppm: heavies 15,000 of 100,000
  const wet = { c1: 85000, c2: 4000, c3: 8000, ic4: 800, nc4: 1200, ic5: 400, nc5: 600 };
  test('wetness 15, balance 8.09, character 0.375: wet gas or condensate; C1/C2 21.25: gas', () => {
    const r = gasReading(wet);
    expect(r.ok).toBe(true);
    expect(r.haworth.wh).toBeCloseTo(15, 12);
    expect(r.haworth.bh).toBeCloseTo(89 / 11, 12);
    expect(r.haworth.ch).toBeCloseTo(0.375, 12);
    expect(r.haworth.reading.code).toBe('gas_condensate');
    expect(r.pixler.c1c2).toBeCloseTo(21.25, 12);
    expect(r.pixler.c1c4).toBeCloseTo(42.5, 12);
    expect(r.pixler.reading.code).toBe('gas');
    // C1/C3 is 10.6, below C1/C2: the engine says so (a wet gas with much propane)
    expect(r.pixler.reading.slopeOk).toBe(false);
    expect(r.c4).toBe(2000);
  });
  test('percent and ppm give the same reading; the record keeps what was read and the ppm beside it', () => {
    const pct = Object.fromEntries(Object.entries(wet).map(([k, v]) => [k, v / 10000]));
    expect(gasReading(pct).haworth.wh).toBeCloseTo(15, 10);
    const p = chromatographParams({ components: pct, unit: '%', depthEntry: { value: 3000, unit: 'm', reference: 'MD', datum: 'KB' } });
    expect(p).toMatchObject({ kind: 'observation', subtype: GAS_SUBTYPE, depth: { kind: 'lagged_sample' } });
    expect(p.payload.components.c1).toBeCloseTo(8.5, 12);
    expect(p.payload.ppm.c1).toBeCloseTo(85000, 6);
    expect(componentsPpm({ c1: 5 }, 'units')).toBeNull();
    expect(p.payload.text).toMatch(/Wetness 15\.0, balance 8\.1, character 0\.38: wet gas or condensate \(Haworth\)\. C1\/C2 21\.3: gas; possibly water-bearing or non-productive \(C1\/C3 is below C1\/C2\) \(Pixler\)\./);
    expect(observationLabel({ subtype: GAS_SUBTYPE, payload: p.payload })).toBe(p.payload.text);
  });
  test('typed text: blanks are "not read", comma decimals read, junk is refused by name', () => {
    expect(parseComponents({ c1: '90000', c2: '6 000', c3: '' }).errors).toEqual(['C2 is not a number.']);
    expect(parseComponents({ c1: '8,5', c2: '0.4', c3: ' ' })).toEqual({ components: { c1: 8.5, c2: 0.4 }, errors: [] });
    expect(parseComponents({ c1: 'abc' }).errors).toEqual(['C1 is not a number.']);
  });
  test('hostile readings are refused with a reason; methane alone is a reading with its notes', () => {
    expect(() => chromatographParams({ components: { c2: 5 }, unit: 'ppm' })).toThrow(/C1 \(methane\) is needed/);
    expect(() => chromatographParams({ components: { c1: 100, c3: -1 }, unit: 'ppm' })).toThrow(/C3 is negative/);
    expect(() => chromatographParams({ components: { c1: 0, c2: 0 }, unit: 'ppm' })).toThrow(/at least one component above zero/);
    expect(() => chromatographParams({ components: { c1: 85000, c2: 4000 }, unit: '%' })).toThrow(/more than 100 percent/);
    expect(() => chromatographParams({ components: { c1: 1 }, unit: 'mol' })).toThrow(/needs a unit of ppm, %, units/);
    const c1 = gasReading({ c1: 5000 });
    expect(c1.haworth).toMatchObject({ wh: 0, bh: null, ch: null });
    expect(c1.haworth.notes).toHaveLength(2);
    expect(gasText({ c1: 5000 }, 'ppm')).toMatch(/balance n\/a, character n\/a/);
  });
  test('negative control: the same readings with C1 and C2 swapped read as residual oil, so the order matters and is checked', () => {
    const swapped = gasReading({ ...wet, c1: wet.c2, c2: wet.c1 });
    expect(swapped.haworth.reading.code).toBe('residual_oil');
    expect(swapped.pixler.reading.code).toBe('residual_oil');
  });
});

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-u2-gas-${n += 1}`);
  const backend = makeLocalBackend({ transport: makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS }), db, autoSync: false });
  const well = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well };
}

test('screen: C1 to C5 typed on Observations show the ratios before saving and in the gas table after', async () => {
  const { backend, well } = await setup();
  fireEvent.click(screen.getByTestId('ws-nav-observations'));
  fireEvent.click(await screen.findByTestId(`ws-obs-type-${GAS_SUBTYPE}`));
  const type = (k, v) => fireEvent.change(screen.getByTestId(`ws-gas-${k}`), { target: { value: v } });
  type('c1', '70000'); type('c2', '12000'); type('c3', '9000'); type('ic4', '2500'); type('nc4', '3500'); type('ic5', '1000'); type('nc5', '2000');
  // Wh = 30, Bh = 82,000 / 18,000 = 4.6, Ch = 9,000 / 9,000 = 1.00; C1/C2 = 5.8
  await waitFor(() => expect(screen.getByTestId('ws-gas-live-haworth')).toHaveTextContent('Wetness 30.0, balance 4.6, character 1.00: Oil (Haworth).'));
  expect(screen.getByTestId('ws-gas-live-pixler')).toHaveTextContent(/C1\/C2 5\.8, C1\/C3 7\.8, C1\/C4 11\.7, C1\/C5 23\.3: Oil, medium gravity oil \(Pixler\)\./);
  fireEvent.change(screen.getByTestId('ws-obs-depth-mode'), { target: { value: 'bit' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-obs-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Chromatograph reading recorded at 10000 ft.'));
  const rows = await backend.listRecords(well.id, { subtype: GAS_SUBTYPE });
  expect(rows).toHaveLength(1);
  expect(rows[0].payload.components).toEqual({ c1: 70000, c2: 12000, c3: 9000, ic4: 2500, nc4: 3500, ic5: 1000, nc5: 2000 });
  await waitFor(() => expect(screen.getByTestId(`ws-gas-haworth-${rows[0].id}`)).toHaveTextContent('Oil'));
  expect(screen.getByTestId(`ws-gas-wh-${rows[0].id}`)).toHaveTextContent('30.0');
  // a typo is named and nothing is saved
  type('c1', '9o000');
  await waitFor(() => expect(screen.getByTestId('ws-gas-error')).toHaveTextContent('C1 is not a number.'));
  await act(async () => { fireEvent.click(screen.getByTestId('ws-obs-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('C1 is not a number.'));
  expect(await backend.listRecords(well.id, { subtype: GAS_SUBTYPE })).toHaveLength(1);
});
