// Wellsite Studio upgrade U2-008 (2026-10-01): the Pore Pressure Studio link,
// both ways. IN: the published PP, FP and OBG curves are loaded with the
// prognosis and read at the bit by their declared unit through the Suite
// door (src/lib/ppfgUnits.js). OUT: the d-exponent, gas, ROP and mud weight
// curves go to the registry as curves, and the mud weights enter Pore
// Pressure Studio through ITS OWN calibration door (parseCalibrationTable,
// convertCalibration), which is run here on the table Wellsite writes.
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
import { pressureAt, mudWindowAtBit, mudWeightInUse, thinCurve, pressureCurvesFrom, pressureEmwSeries } from '../services/pressure';
import { typedRowParams, quantity } from '../services/mudlogImport';
import { buildStripLog } from '../services/stripLog';
import { regularGrid, prepareEvidenceLogs, staleEvidence, pickEvidence, mudWeightTable, evidenceText, isWellsiteEvidence, WS_EVIDENCE_PIPELINE } from '@/lib/wellsite/evidence';
import { parseCalibrationTable, convertCalibration } from '@/pages/apps/PorePressureStudio/services/calibrationImport';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

const G = 9.80665;
const PPG = 119.82642731689663;
const ctx = { kbElevM: 25, survey: null }; // vertical: TVD = MD
// a prognosis published in MPa (Pore Pressure Studio) on a 1,000 m grid: hydrostatic 1.03 sg, fracture 1.70 sg
const mpa = (sg, tvd) => (sg * 1000 * G * tvd) / 1e6;
const curveMpa = (sg) => ({ unit: 'MPA', md_m: [1000, 2000, 3000, 4000], values: [1000, 2000, 3000, 4000].map((z) => mpa(sg, z)) });
const PC = { source: 'geo_wells_logs', curves: { PP: curveMpa(1.03), FP: curveMpa(1.70) }, skipped: [] };
const sgFmt = (kg) => `${(kg / 1000).toFixed(2)} sg`;

describe('IN: the prognosis read at the bit by its declared unit', () => {
  test('MPa curves give back their equivalent mud weights at the TVD below KB', () => {
    const a = pressureAt(PC, 2500, ctx);
    expect(a.ppMpa).toBeCloseTo(mpa(1.03, 2500), 9);
    expect(a.ppEmwKgM3).toBeCloseTo(1030, 6);
    expect(a.fpEmwKgM3).toBeCloseTo(1700, 6);
    expect(a.obgMpa).toBeNull();
    expect(pressureAt(PC, 4500, ctx)).toBeNull(); // beyond the curve: no extrapolation
    expect(pressureAt(null, 2500, ctx)).toBeNull();
  });
  test('a curve published as a mud weight in ppg (a Drillworks LAS) reads the same pressure', () => {
    const ppg = { curves: { PP: { unit: 'ppg', md_m: [1000, 4000], values: [1030 / PPG, 1030 / PPG] } } };
    expect(pressureAt(ppg, 2500, ctx).ppMpa).toBeCloseTo(mpa(1.03, 2500), 6);
    // negative control: the same numbers declared MPa would be 8.6 MPa at 2,500 m, a third of hydrostatic
    expect(pressureAt({ curves: { PP: { unit: 'MPA', md_m: [1000, 4000], values: [1030 / PPG, 1030 / PPG] } } }, 2500, ctx).ppMpa).toBeLessThan(mpa(1.03, 2500) / 2);
  });
  test('on a deviated well the EMW uses the TVD from the survey in use, never the MD', () => {
    const dev = { kbElevM: 25, survey: { version: 'v', stations: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 1500, inc: 60, azi: 90 }, { md: 4000, inc: 60, azi: 90 }] } };
    const a = pressureAt(PC, 3000, dev);
    expect(a.tvdM).toBeLessThan(2500);
    expect(a.ppEmwKgM3).toBeCloseTo((a.ppMpa * 1e6) / (G * a.tvdM), 6);
    expect(a.ppEmwKgM3).toBeGreaterThan(1030 * 1.2); // the curve is against MD, so its EMW at the shallower TVD is higher
  });
  test('the mud window at the bit: inside, below the pore pressure, above the fracture pressure, and the honest empties', () => {
    const pts = (kg, key = 'mw') => [{ mdM: 2400, values: { [key]: kg } }];
    const inside = mudWindowAtBit({ pressureCurves: PC, bitMdM: 2500, ctx, points: pts(1200), fmtMw: sgFmt });
    expect(inside).toMatchObject({ state: 'inside' });
    expect(inside.overPoreKgM3).toBeCloseTo(170, 6);
    expect(inside.underFracKgM3).toBeCloseTo(500, 6);
    expect(inside.text).toBe('Prognosis at the bit: pore pressure 1.03 sg, fracture 1.70 sg (equivalent mud weight at 2500 m TVD below KB). Mud weight in 1.20 sg: 0.17 sg over the prognosed pore pressure, 0.50 sg under the prognosed fracture pressure.');
    const low = mudWindowAtBit({ pressureCurves: PC, bitMdM: 2500, ctx, points: pts(1000), fmtMw: sgFmt });
    expect(low.state).toBe('below_pore');
    expect(low.text).toMatch(/Mud weight in 1\.00 sg: 0\.03 sg below the prognosed pore pressure\. An indication to check against gas, flow and the driller\.$/);
    const high = mudWindowAtBit({ pressureCurves: PC, bitMdM: 2500, ctx, points: pts(1750, 'ecd'), fmtMw: sgFmt });
    expect(high.state).toBe('above_fracture');
    expect(high.text).toMatch(/ECD 1\.75 sg: 0\.05 sg above the prognosed fracture pressure/);
    expect(mudWindowAtBit({ pressureCurves: PC, bitMdM: 2500, ctx, points: [], fmtMw: sgFmt })).toMatchObject({ state: 'no_mud_weight' });
    expect(mudWindowAtBit({ pressureCurves: null, bitMdM: 2500, ctx, points: pts(1200) }).text).toMatch(/No pressure prognosis is loaded/);
    expect(mudWindowAtBit({ pressureCurves: PC, bitMdM: 5000, ctx, points: pts(1200) }).text).toBe('The pressure prognosis does not reach the bit depth.');
    // the ECD wins over the mud weight in on the same row; a deeper row than the bit is not used
    expect(mudWeightInUse([{ mdM: 2400, values: { mw: 1200, ecd: 1260 } }, { mdM: 2600, values: { mw: 1300 } }], 2500)).toEqual({ kgM3: 1260, source: 'ECD', mdM: 2400 });
  });
  test('registry logs become the prognosis curves; a curve with no pressure unit is named, never read', async () => {
    const data = Float32Array.from([10, 20, NaN, 40]);
    const logs = [
      { id: 'l1', mnemonic: 'PP', unit: 'MPA', start_md_m: 1000, step_m: 1000, n_samples: 4, provenance: { pipeline_version: 'pp-1.1.0', project_id: 'p1' } },
      { id: 'l2', mnemonic: 'FP', unit: 'API', start_md_m: 1000, step_m: 1000, n_samples: 4, provenance: {} },
      { id: 'l3', mnemonic: 'GR', unit: 'API', start_md_m: 1000, step_m: 1000, n_samples: 4, provenance: {} },
    ];
    const pc = await pressureCurvesFrom(logs, async () => data);
    expect(pc.curves.PP).toMatchObject({ unit: 'MPA', log_id: 'l1', pipeline: 'pp-1.1.0', md_m: [1000, 2000, 4000], values: [10, 20, 40] });
    expect(pc.curves.FP).toBeUndefined();
    expect(pc.skipped).toEqual(['FP is in API, which is not a pressure, a gradient or a mud weight, so it was not read.']);
    expect(await pressureCurvesFrom([logs[2]], async () => data)).toBeNull();
    expect(thinCurve({ id: 'x', unit: 'MPA', start_md_m: 0, step_m: 1, n_samples: 5000 }, new Float32Array(5000).fill(1)).md_m.length).toBeLessThanOrEqual(400);
  });
  test('the strip log gains a pressure track in equivalent mud weight with the mud weight in use', () => {
    const m = buildStripLog({ well: { name: 'W', settings: {} }, unit: 'ft', mudlog: { points: [{ mdM: 2400, values: { mw: 1200, rop: 20 } }, { mdM: 2500, values: { mw: 1210, rop: 22 } }] }, pressure: pressureEmwSeries(PC, ctx) });
    const t = m.tracks.find((x) => x.id === 'pressure');
    expect(t.unit).toBe('ppg equivalent mud weight');
    expect(t.series.map((s) => s.id)).toEqual(['pp', 'fp', 'mw']);
    expect(t.series[0].points[0].v).toBeCloseTo(1030 / PPG, 6);
    expect(t.series[2].points.map((p) => p.v)).toEqual([1200 / PPG, 1210 / PPG]);
  });
});

describe('OUT: curves for the registry and mud weights for Pore Pressure Studio', () => {
  test('irregular rows go onto a regular grid; a gap of more than three steps stays a gap', () => {
    const g = regularGrid([{ mdM: 1000, v: 1 }, { mdM: 1010, v: 2 }, { mdM: 1020, v: 3 }, { mdM: 1025, v: 3.5 }, { mdM: 1100, v: 10 }, { mdM: 1110, v: 11 }]);
    expect(g).toMatchObject({ startMdM: 1000, stepM: 10, nSamples: 12, stopMdM: 1110 });
    expect(Array.from(g.data.slice(0, 3))).toEqual([1, 2, 3]);
    expect(Number.isNaN(g.data[5])).toBe(true); // 1050 sits in the 75 m gap
    expect(g.data[10]).toBe(10);
    expect(g.nullCount).toBe(7);
    expect(regularGrid([{ mdM: 1, v: 1 }])).toBeNull();
  });
  const points = [];
  for (let i = 0; i <= 30; i += 1) points.push({ mdM: 2000 + i * 10, values: { rop: 20 + i, total_gas: 0.5, mw: i < 15 ? 1200 : 1260, ...(i % 2 ? { ecd: 1280 } : {}) } });
  const dxcRows = points.map((p, i) => ({ mdM: p.mdM, d: 1.5 + i * 0.01, dc: i % 3 ? 1.3 + i * 0.01 : null }));
  const logs = prepareEvidenceLogs({ points, dxcRows, wsWell: { id: 'ws-1', name: 'KETA-2' }, settings: { normalMwKgM3: 1030, normalValue: 8.6, normalUnit: 'ppg', trendFromMdM: 2000, trendToMdM: 2100 }, at: '2026-10-01T12:00:00Z' });
  test('the published curves carry their unit and where they came from', () => {
    expect(logs.map((l) => [l.mnemonic, l.unit])).toEqual([['DXC', ''], ['DEXP', ''], ['TGAS', '%'], ['ROP', 'm/hr'], ['MWIN', 'kg/m3'], ['ECD', 'kg/m3']]);
    const dxc = logs[0];
    expect(dxc.provenance).toMatchObject({ computed: true, engine: 'wellsite-studio', pipeline_version: WS_EVIDENCE_PIPELINE, ws_well_id: 'ws-1', normal_declared: '8.6 ppg', trend_to_md_m: 2100 });
    expect(logs[3]).toMatchObject({ startMdM: 2000, stepM: 10, nSamples: 31 });
    expect(logs[3].data[30]).toBe(50);
  });
  test('a republish replaces only this live well own curves of the same mnemonics', () => {
    const existing = [
      { id: 'a', mnemonic: 'DXC', provenance: logs[0].provenance }, { id: 'b', mnemonic: 'DXC', provenance: { ...logs[0].provenance, ws_well_id: 'another-live-well' } },
      { id: 'c', mnemonic: 'ROP', provenance: { computed: false } }, { id: 'd', mnemonic: 'PP', provenance: { engine: 'pore-pressure-studio', pipeline_version: 'pp-1.1.0' } },
    ];
    expect(staleEvidence(existing, logs, 'ws-1').map((l) => l.id)).toEqual(['a']);
    expect(isWellsiteEvidence(existing[3])).toBe(false);
  });
  test('the mud weight table goes through Pore Pressure Studio own calibration door and lands as mud weight points at the right pressure', () => {
    const asRow = (l, id) => ({ id, mnemonic: l.mnemonic, unit: l.unit, start_md_m: l.startMdM, step_m: l.stepM, n_samples: l.nSamples, provenance: l.provenance });
    const picked = pickEvidence(logs.map((l, i) => asRow(l, `r${i}`)));
    expect(Object.keys(picked)).toEqual(['DXC', 'DEXP', 'TGAS', 'ROP', 'MWIN', 'ECD']);
    const t = mudWeightTable(picked.MWIN, logs[4].data);
    expect(t.text.split('\n')[0]).toBe('MD (m),Mud weight (kg/m3)');
    expect(t.text.split('\n').slice(1, 3)).toEqual(['2000.0,1200.0', '2150.0,1260.0']);
    const table = parseCalibrationTable(t.text);
    expect(table.guess).toMatchObject({ depthCol: 0, valueCol: 1, depthRef: 'md', depthUnit: 'm', valueUnit: 'kg/m3', kind: 'mw' });
    const res = convertCalibration(table, table.guess, { frame: null, kbM: 25, mudlineMdM: 0, waterDepthM: 0, source: 'Wellsite Studio' });
    expect(res.skipped).toEqual([]);
    expect(res.points[1]).toMatchObject({ kind: 'mw', source: 'Wellsite Studio' });
    expect(res.points[1].pMpa).toBeCloseTo((1260 * G * 2150) / 1e6, 6);
    expect(evidenceText(Object.values(picked))).toBe('Wellsite Studio live well KETA-2 published DXC, DEXP, TGAS, ROP, MWIN, ECD on 2026-10-01. They are registry curves: open them beside the prognosis in Well Data Manager or Petrophysics.');
    expect(evidenceText([{ mnemonic: 'GR', provenance: {} }])).toBeNull();
  });
});

let n = 0;
async function make({ owner = 'user-a', pressureCurves = PC } = {}) {
  const db = openWellsiteDb(`ws-u2-pp-${n += 1}`);
  const transport = makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS.map((w) => ({ ...w, user_id: owner })), prognosisSources: () => ({ pressureCurves }) });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  return { db, transport, backend, well };
}
const typed = (ft, mwPpg) => typedRowParams({ depthEntry: { value: ft, unit: 'ft', reference: 'MD', datum: 'KB' }, values: { rop: quantity('rop').units['ft/hr'](40), wob: quantity('wob').units.klbf(30), rpm: 120, mw: quantity('mw').units.ppg(mwPpg), total_gas: 0.6 } });

test('backend: the curves reach the registry with provenance, a republish replaces its own, a non-owner is refused', async () => {
  const { backend, well, transport, db } = await make();
  await expect(backend.publishEvidenceToRegistry(well.id)).rejects.toThrow(/There is nothing to send yet/);
  await backend.addRecords(well.id, [typed(9800, 9.6), typed(9850, 9.6), typed(9900, 9.8)]);
  const out = await backend.publishEvidenceToRegistry(well.id);
  expect(out.curves).toEqual(['DEXP', 'TGAS', 'ROP', 'MWIN']); // no settings recorded, so no corrected d-exponent goes out
  const reg = () => [...transport._server.tables.get('registry_logs').values()];
  expect(reg().map((l) => l.mnemonic).sort()).toEqual(['DEXP', 'MWIN', 'ROP', 'TGAS']);
  expect(reg().every((l) => l.provenance.ws_well_id === well.id && l.well_id === 'geo-keta-2')).toBe(true);
  expect(out.record.payload.text).toBe('Curves sent to the well registry for Pore Pressure Studio: DEXP, TGAS, ROP, MWIN.');
  expect(await db.outbox.where('entity_id').equals(out.record.id).count()).toBe(1);
  const again = await backend.publishEvidenceToRegistry(well.id);
  expect(again.result.replaced).toBe(4);
  expect(reg()).toHaveLength(4);
  const other = await make({ owner: 'someone-else' });
  await other.backend.addRecords(other.well.id, [typed(9800, 9.6), typed(9850, 9.6)]);
  await expect(other.backend.publishEvidenceToRegistry(other.well.id)).rejects.toThrow(/Only the owner of the registry well can add curves/);
});

test('screen: the prognosis loaded with the well shows the mud window at the bit on Live and on the Log view', async () => {
  const { backend, well } = await make();
  // 10,000 ft is 3,048 m: hydrostatic 1.03 sg is 8.60 ppg, fracture 1.70 sg is 14.19 ppg
  await backend.addRecords(well.id, [typed(9900, 9.6), typed(9990, 9.6)]);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  await waitFor(() => expect(screen.getByTestId('ws-live-mud-window')).toHaveAttribute('data-state', 'inside'));
  expect(screen.getByTestId('ws-live-mud-window')).toHaveTextContent(/pore pressure \d+\.\d\d ppg, fracture \d+\.\d\d ppg .*Mud weight in 9\.60 ppg: \d\.\d\d ppg over the prognosed pore pressure, \d\.\d\d ppg under the prognosed fracture pressure\./);
  fireEvent.click(screen.getByTestId('ws-nav-log'));
  await waitFor(() => expect(screen.getByTestId('ws-striplog').getAttribute('data-tracks')).toMatch(/pressure/));
  expect(screen.getByTestId('ws-pp-window')).toHaveTextContent(/Prognosis at the bit: pore pressure/);
  await act(async () => { fireEvent.click(screen.getByTestId('ws-pp-send')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Curves sent to the well registry for Pore Pressure Studio: DEXP, TGAS, ROP, MWIN.'));
  await waitFor(() => expect(screen.getByTestId('ws-pp-last')).toHaveTextContent('DEXP, TGAS, ROP, MWIN.'));
});
