// Wellsite Studio upgrade U2-006 (2026-10-01): d-exponent and corrected
// d-exponent on the data rows, through the shipped service (which calls the
// engine) with the units converted at the door. The published cases are run
// end to end from field units: a typed row in ft/hr, klbf, inches and ppg
// must come back as the book's d and dc. The screen test imports a table
// and draws the track.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_RIG_CONFIG } from '../services/seed';
import { dExponentSeries, dxcSettingsParams, currentDxcSettings, bitSizeAt, dxcSummary, NORMAL_UNITS, normalFromKgM3, DXC_SETTINGS_SUBTYPE } from '../services/dexponent';
import { quantity } from '../services/mudlogImport';
import { depthScale, valueScale, pxPerMetreAtScale, depthTicks, curvePath, logRange, niceMax } from '../components/striplog/geometry';
import { dExponentTrack } from '../services/stripLog';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

const FT = 0.3048;
// a data row as the import door stores it, from field units
const row = (mdFt, { rop, wobKlbf, rpm, bitIn, mwPpg, ecdPpg }) => ({ mdM: mdFt * FT, values: {
  rop: quantity('rop').units['ft/hr'](rop), wob: quantity('wob').units.klbf(wobKlbf), rpm,
  ...(bitIn ? { bit_size: quantity('bit_size').units.in(bitIn) } : {}), ...(mwPpg ? { mw: quantity('mw').units.ppg(mwPpg) } : {}), ...(ecdPpg ? { ecd: quantity('ecd').units.ppg(ecdPpg) } : {}),
} });
const settingsOf = (p) => currentDxcSettings([{ id: 's1', kind: 'decision', subtype: DXC_SETTINGS_SUBTYPE, chain_id: 's1', occurred_at: '2026-10-01T10:00:00Z', payload: dxcSettingsParams(p).payload }]);
const ctx = { kbElevM: 25, survey: null };

describe('published cases from field units through the door', () => {
  test('Lapeyrouse: 30 ft/hr, 120 rpm, 35 klbf, 8.5 in bit gives d = 1.82', () => {
    const s = dExponentSeries({ points: [row(9000, { rop: 30, wobKlbf: 35, rpm: 120, bitIn: 8.5 })], rigConfig: null, ctx });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].d).toBeCloseTo(1.82, 2);
    expect(s.rows[0].dc).toBeNull();
    expect(s.notes[0]).toMatch(/Declare the normal pore pressure gradient/);
  });
  test('Bourgoyne (remembered): 23 ft/hr, 113 rpm, 25.5 klbf, 9.875 in, ECD 9.5 ppg, normal 0.465 psi/ft gives 1.64 and 1.54', () => {
    const settings = settingsOf({ normalValue: 0.465, normalUnit: 'psi/ft' });
    expect(normalFromKgM3(settings.normalMwKgM3, 'ppg')).toBeCloseTo(8.95, 2);
    const s = dExponentSeries({ points: [row(9515, { rop: 23, wobKlbf: 25.5, rpm: 113, bitIn: 9.875, ecdPpg: 9.5, mwPpg: 9.2 })], rigConfig: null, ctx, settings });
    expect(s.rows[0].d).toBeCloseTo(1.64, 2);
    expect(s.rows[0].dc).toBeCloseTo(1.54, 2);
    expect(s.rows[0].mwSource).toBe('ECD');
  });
  test('drillingformulas.com: 90 ft/hr, 110 rpm, 20 klbf, 8.5 in is 1.20; 9.0 over 12.0 ppg is 0.9', () => {
    const s = dExponentSeries({ points: [row(8000, { rop: 90, wobKlbf: 20, rpm: 110, bitIn: 8.5, mwPpg: 12.0 })], rigConfig: null, ctx, settings: settingsOf({ normalValue: 9.0, normalUnit: 'ppg' }) });
    expect(s.rows[0].d).toBeCloseTo(1.20, 2);
    expect(s.rows[0].dc).toBeCloseTo(0.9, 2);
    expect(s.rows[0].mwSource).toBe('mud weight in');
    expect(s.notes.join(' ')).toMatch(/corrected with the mud weight in/);
  });
  test('negative control: the weight left in klbf where the engine wants newtons, or metres per hour read as feet, miss the published 1.82', () => {
    const good = dExponentSeries({ points: [row(9000, { rop: 30, wobKlbf: 35, rpm: 120, bitIn: 8.5 })], rigConfig: null, ctx }).rows[0].d;
    const wrongRop = dExponentSeries({ points: [{ mdM: 2743, values: { rop: 30, wob: quantity('wob').units.klbf(35), rpm: 120, bit_size: 8.5 * 0.0254 } }], rigConfig: null, ctx }).rows[0].d; // 30 taken as m/hr
    expect(Math.abs(wrongRop - good)).toBeGreaterThan(0.1);
    const wrongWob = dExponentSeries({ points: [{ mdM: 2743, values: { rop: 30 * FT, wob: 35, rpm: 120, bit_size: 8.5 * 0.0254 } }], rigConfig: null, ctx }).rows[0].d; // 35 taken as kN
    expect(Math.abs(wrongWob - good)).toBeGreaterThan(0.3);
  });
});

describe('bit size, settings and refusals', () => {
  test('the bit size comes from the row, else the open hole section in Config at that depth', () => {
    expect(bitSizeAt(3000, SEED_RIG_CONFIG) / 0.0254).toBeCloseTo(12.25, 9);
    expect(bitSizeAt(500, SEED_RIG_CONFIG)).toBeNull(); // inside casing, above any open hole
    expect(bitSizeAt(3300, SEED_RIG_CONFIG) / 0.0254).toBeCloseTo(12.25, 9); // drilling ahead of the last section
    const s = dExponentSeries({ points: [row(9850, { rop: 30, wobKlbf: 35, rpm: 120 })], rigConfig: SEED_RIG_CONFIG, ctx });
    expect(s.rows[0]).toMatchObject({ bitSource: 'Config' });
    expect(s.rows[0].bitM / 0.0254).toBeCloseTo(12.25, 9);
    const none = dExponentSeries({ points: [row(9850, { rop: 30, wobKlbf: 35, rpm: 120 })], rigConfig: null, ctx });
    expect(none.rows).toHaveLength(0);
    expect(none.skipped).toEqual({ 'no bit size in the row and no open hole section at that depth in Config': 1 });
  });
  test('rows the engine refuses are counted with its reason; rows with no parameters are ignored', () => {
    const s = dExponentSeries({ points: [row(9000, { rop: 30, wobKlbf: 900, rpm: 120, bitIn: 8.5 }), { mdM: 2800, values: { total_gas: 1 } }, { mdM: 2801, values: { rop: 10 } }], rigConfig: null, ctx });
    expect(s.rows).toHaveLength(0);
    expect(Object.keys(s.skipped)).toEqual(['The weight on bit is above 83,333 lbf per inch of bit diameter, outside the range the d-exponent is defined for.', 'rate of penetration, rotary speed or weight on bit not read']);
    expect(dxcSummary(s)).toMatch(/^No data row has/);
  });
  test('the normal gradient: a unit must be declared and the value must be a water gradient', () => {
    expect(() => dxcSettingsParams({ normalValue: 9, normalUnit: '' })).toThrow(/Declare the unit of the normal pore pressure gradient: ppg, sg, kg\/m3, psi\/ft, kPa\/m/);
    expect(() => dxcSettingsParams({ normalValue: 0.465, normalUnit: 'ppg' })).toThrow(/outside 0\.95 to 1\.30 sg/);
    expect(() => dxcSettingsParams({ normalValue: 9, normalUnit: 'sg' })).toThrow(/outside 0\.95 to 1\.30 sg/);
    expect(() => dxcSettingsParams({ normalValue: 9, normalUnit: 'ppg', trendFromMdM: 2000 })).toThrow(/needs both its top and its base/);
    expect(() => dxcSettingsParams({ normalValue: 9, normalUnit: 'ppg', trendFromMdM: 2000, trendToMdM: 1500 })).toThrow(/must be below its top/);
    expect(NORMAL_UNITS['kPa/m'](10.5)).toBeCloseTo(1070.7, 1);
    expect(dxcSettingsParams({ normalValue: 1.03, normalUnit: 'sg' }).payload.normal_mw_kg_m3).toBeCloseTo(1030, 9);
  });
});

describe('the normal trend and the departure from it', () => {
  // dc = 10^(0.00012 z) to 2,600 m (normal), then falling away below
  const pts = [];
  for (let z = 2000; z <= 3000; z += 50) {
    const normalDc = 10 ** (0.00012 * z);
    const dc = z <= 2600 ? normalDc : normalDc * (1 - 0.0006 * (z - 2600));
    // back out a rate of penetration that gives this dc at 120 rpm, 150 kN, 8.5 in bit and the normal mud weight (dc = d)
    const wobTerm = (12 * (150000 / 4.4482216152605)) / (1e6 * 8.5);
    const ropFtHr = 60 * 120 * 10 ** (dc * Math.log10(wobTerm));
    pts.push({ mdM: z, values: { rop: ropFtHr * FT, wob: 150, rpm: 120, bit_size: 8.5 * 0.0254, mw: 1030 } });
  }
  const settings = settingsOf({ normalValue: 1.03, normalUnit: 'sg', trendFromMdM: 2000, trendToMdM: 2600 });
  const s = dExponentSeries({ points: pts, rigConfig: null, ctx, settings });
  test('the trend is recovered from the normal interval and extended below it', () => {
    expect(s.trend.n).toBe(13);
    expect(s.trend.slope).toBeCloseTo(0.00012, 9);
    expect(s.trend.intercept).toBeCloseTo(0, 6);
    expect(s.rows.find((r) => r.mdM === 3000).normalDc).toBeCloseTo(10 ** 0.36, 6);
  });
  test('rows more than 10 percent under the trend are marked, from 2,800 m down', () => {
    expect(s.flagged.map((r) => r.mdM)).toEqual([2800, 2850, 2900, 2950, 3000]);
    expect(s.rows.find((r) => r.mdM === 3000).ratio).toBeCloseTo(0.76, 9);
    expect(dxcSummary(s)).toMatch(/Normal trend fitted on 13 point\(s\) from 2000\.0 m to 2600\.0 m MD\. 5 row\(s\) fall more than 10 percent below it, the shallowest at 2800\.0 m MD: an indication/);
  });
  test('the track carries d, dc and the trend on a log scale, with the marked points', () => {
    const t = dExponentTrack(s);
    expect(t).toMatchObject({ id: 'dxc', type: 'curve', scale: { log: true, min: 1, max: 10 } });
    expect(t.series.map((x) => [x.id, x.points.length])).toEqual([['d', 21], ['dc', 21], ['trend', 21]]);
    expect(t.series[1].points.filter((p) => p.flag)).toHaveLength(5);
  });
  test('with no interval declared there is no trend, and the view says to choose one', () => {
    const s2 = dExponentSeries({ points: pts, rigConfig: null, ctx, settings: settingsOf({ normalValue: 1.03, normalUnit: 'sg' }) });
    expect(s2.trend).toBeNull();
    expect(s2.flagged).toEqual([]);
    expect(s2.notes).toContain('Choose the normally pressured interval to fit the normal trend.');
  });
});

describe('strip log geometry: depth runs down the page', () => {
  test('a deeper point is lower; a log scale puts 1, 10 and 100 at equal steps', () => {
    const ds = depthScale(2000, 3000, 500);
    expect(ds.y(2000)).toBe(0);
    expect(ds.y(3000)).toBe(500);
    expect(ds.y(2500)).toBeGreaterThan(ds.y(2400));
    expect(() => depthScale(3000, 2000, 500)).toThrow('base below its top');
    const vs = valueScale({ min: 1, max: 100, log: true }, 200);
    expect([vs.x(1), vs.x(10), vs.x(100)]).toEqual([0, 100, 200]);
    expect(vs.x(0)).toBeNaN();
    expect(valueScale({ min: 0, max: 50 }, 100).x(25)).toBe(50);
    // 1:500 on a 96 dpi screen: 1 m is 2 mm is 7.56 px
    expect(pxPerMetreAtScale(500)).toBeCloseTo(7.559, 3);
    expect(depthTicks(9800, 10000, 600)).toEqual({ step: 20, ticks: [9800, 9820, 9840, 9860, 9880, 9900, 9920, 9940, 9960, 9980, 10000] });
    expect(logRange([0.8, 2.5])).toEqual({ min: 0.1, max: 10 });
    expect(logRange([])).toEqual({ min: 0.1, max: 10 });
    expect([niceMax(37), niceMax(120), niceMax(0)]).toEqual([50, 200, 1]);
    // a gap breaks the line; a zero on a log scale is left out, never drawn at the edge
    expect(curvePath([{ mdM: 2000, v: 1 }, { mdM: 2500, v: 0 }, { mdM: 3000, v: 100 }], ds, vs)).toBe('M0.0,0.0M200.0,500.0');
    expect(curvePath([{ mdM: 2000, v: 1 }, { mdM: 2010, v: 10 }, { mdM: 2900, v: 10 }], ds, vs, { gapM: 100 })).toBe('M0.0,0.0L100.0,5.0M100.0,450.0');
  });
});

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-u2-dxc-${n += 1}`);
  const backend = makeLocalBackend({ transport: makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS }), db, autoSync: false });
  const well = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well };
}

test('screen: imported rows become a d-exponent track; the settings are a record and the trend marks the departure', async () => {
  const { backend, well } = await setup();
  const lines = ['Depth (ft),ROP (ft/hr),WOB (klb),RPM,MW In (ppg)'];
  // 9,000 to 9,900 ft: ROP falls with depth to 9,500 ft (normal compaction), then rises (a drilling break)
  for (let i = 0; i <= 18; i += 1) { const dft = 9000 + i * 50; lines.push(`${dft},${(i <= 10 ? 40 - i * 1.5 : 25 + (i - 10) * 6).toFixed(1)},35,120,9.6`); }
  fireEvent.click(screen.getByTestId('ws-nav-import'));
  fireEvent.change(await screen.findByTestId('ws-import-paste'), { target: { value: lines.join('\n') } });
  fireEvent.click(screen.getByTestId('ws-import-read'));
  fireEvent.change(await screen.findByTestId('ws-import-datum'), { target: { value: 'KB' } });
  await act(async () => { fireEvent.click(await screen.findByTestId('ws-import-go')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('19 row(s) imported'));
  fireEvent.click(screen.getByTestId('ws-nav-log'));
  await waitFor(() => expect(screen.getByTestId('ws-dxc-summary')).toHaveTextContent('19 row(s) with a d-exponent, 0 corrected for the mud weight.'));
  expect(screen.getByTestId('ws-dxc-settings')).toHaveTextContent('No settings recorded: the d-exponent is shown uncorrected.');
  expect(screen.getByTestId('ws-striplog').getAttribute('data-tracks')).toMatch(/^depth,rop,dxc/);
  expect(screen.getByTestId('ws-striplog-series-dxc-d')).toHaveAttribute('data-points', '19');
  // an undeclared unit is refused
  fireEvent.change(screen.getByTestId('ws-dxc-normal'), { target: { value: '8.6' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-dxc-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Declare the unit of the normal pore pressure gradient/));
  fireEvent.change(screen.getByTestId('ws-dxc-normal'), { target: { value: '8.6' } });
  fireEvent.change(screen.getByTestId('ws-dxc-normal-unit'), { target: { value: 'ppg' } });
  fireEvent.change(screen.getByTestId('ws-dxc-trend-from'), { target: { value: '9000' } });
  fireEvent.change(screen.getByTestId('ws-dxc-trend-to'), { target: { value: '9500' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-dxc-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-dxc-settings')).toHaveTextContent('In force: normal gradient 8.6 ppg (1.031 sg), normal trend from 9000 ft to 9500 ft MD.'));
  await waitFor(() => expect(screen.getByTestId('ws-dxc-summary')).toHaveTextContent(/19 corrected for the mud weight\. Normal trend fitted on 11 point\(s\) from 9000 ft to 9500 ft MD\. \d+ row\(s\) fall more than 10 percent below it/));
  expect(screen.getByTestId('ws-striplog-series-dxc-trend')).toHaveAttribute('data-points', '19');
  expect(screen.getByTestId('ws-striplog-series-dxc-dc').querySelectorAll('circle[data-flag="yes"]').length).toBeGreaterThan(0);
  expect(screen.getByTestId('ws-dxc-flagged')).toBeInTheDocument();
  // depth runs down: the deepest dc point is drawn lowest
  const ys = [...screen.getByTestId('ws-striplog-series-dxc-dc').querySelectorAll('circle')].map((c) => Number(c.getAttribute('data-y')));
  expect(ys[ys.length - 1]).toBeGreaterThan(ys[0]);
  const rec = await backend.listRecords(well.id, { subtype: DXC_SETTINGS_SUBTYPE });
  expect(rec).toHaveLength(1);
  expect(rec[0].payload).toMatchObject({ normal_value: 8.6, normal_unit: 'ppg' });
  expect(rec[0].payload.trend_to_md_m).toBeCloseTo(9500 * FT, 6);
});
