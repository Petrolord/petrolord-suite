// Wellsite Studio upgrade U2-005 (2026-10-01): surveys on the rig. Stations
// go through the shipped door (services/surveys.js), the shared trajectory
// resolver and the shared minimum curvature table; depths are checked
// against the depth engine (mdToTvd) on the same stations and against hand
// arithmetic on a straight tangent section. The screen test records a run
// on the real workstation and watches TVD follow it.
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
import { SURVEY_SUBTYPE, activeSurvey, wellWithSurvey, buildRun, parseStationTable, surveyListing, staleDepths, compositeOf, surveyRuns } from '../services/surveys';
import { wellContext } from '../services/wellContext';
import { prognosisDifference } from '../services/tops';
import { mdToTvd, toCanonicalMd } from '@/lib/wellsite/depth';
import { compositeStations } from '@/pages/apps/well-planning/services/surveyUtils';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

const REG = SEED_REGISTRY_WELLS[0].deviation; // 0, 1400 (0 deg), 1750 (30 deg), 3200 (30 deg)
const well = { id: 'w1', name: 'KETA-2', header: { kb_elev_m: 25 }, survey: { version: 'registry-1', method: 'minimum_curvature', stations: REG, source: 'geo_wells.deviation' }, settings: {} };
const rec = (id, min, p) => ({ id, kind: 'observation', subtype: SURVEY_SUBTYPE, occurred_at: new Date(Date.parse('2026-10-01T10:00:00Z') + min * 60000).toISOString(), payload: p.payload });
const grid = { mdUnit: 'm', azimuthRef: 'grid' };

describe('the survey in use', () => {
  test('with no rig run it is the registry snapshot, through the shared resolver', () => {
    const a = activeSurvey(well, []);
    expect(a).toMatchObject({ source: 'registry', runs: 0 });
    expect(a.survey.version).toBe('registry-1');
    expect(wellWithSurvey(well, [])).toBe(well);
    expect(activeSurvey({ id: 'v', survey: null }, []).source).toBe('none');
  });
  test('a station below the last one ties in to it; a 100 m tangent at 30 degrees adds 86.60 m of TVD', () => {
    const run = buildRun({ stations: [{ md: 3300, inc: 30, azi: 90 }], ...grid, current: REG });
    expect(run.payload.stations).toEqual([{ md: 3200, inc: 30, azi: 90 }, { md: 3300, inc: 30, azi: 90 }]);
    expect(run.payload).toMatchObject({ added: 1, replaced: 0, tie_in: { md: 3200 } });
    const a = activeSurvey(well, [rec('r1', 0, run)]);
    expect(a).toMatchObject({ source: 'actual', runs: 1 });
    expect(a.survey.version).toBe('rig-1');
    expect(a.survey.stations).toHaveLength(5);
    const rows = surveyListing(a.survey.stations, 25);
    expect(rows[4].tvd - rows[3].tvd).toBeCloseTo(100 * Math.cos(Math.PI / 6), 9);
    expect(rows[4].tvdss).toBeCloseTo(rows[4].tvd - 25, 12);
    // the listing (shared table) and the depth engine agree on the same stations
    const ctx = wellContext(wellWithSurvey(well, [rec('r1', 0, run)]));
    expect(mdToTvd(3300, ctx).tvdM).toBeCloseTo(rows[4].tvd, 9);
    expect(mdToTvd(3300, ctx)).toMatchObject({ method: 'minimum_curvature', surveyVersion: 'rig-1' });
    // before the run the same depth was extrapolated and said so
    expect(mdToTvd(3300, wellContext(well)).method).toBe('minimum_curvature_extrapolated');
  });
  test('the prognosis follows: a build to 40 degrees moves the subsea depth of a top below the old survey', () => {
    const run = buildRun({ stations: [{ md: 3300, inc: 40, azi: 90 }], ...grid, current: REG });
    const before = wellContext(well);
    const after = wellContext(wellWithSurvey(well, [rec('r1', 0, run)]));
    const row = { call: { md_calc_m: 3290 }, prognosis: { md_m: 3300 } };
    const d0 = prognosisDifference(row, before);
    const d1 = prognosisDifference(row, after);
    expect(d0.progTvdssM - d1.progTvdssM).toBeGreaterThan(4); // 86.6 m of TVD on the tangent, about 81.9 m through the build
    expect(d1.progTvdssM).toBeCloseTo(mdToTvd(3300, after).tvdssM, 12);
    expect(d1.word).toBe('high');
  });
  test('a correction run replaces the survey from its first station down, and the later run wins whatever its depth', () => {
    const a1 = buildRun({ stations: [{ md: 3300, inc: 30, azi: 90 }, { md: 3330, inc: 31, azi: 90 }], ...grid, current: REG });
    const cur1 = activeSurvey(well, [rec('r1', 0, a1)]).survey.stations;
    // the tie-in was wrong too: re-shoot from 3100 down
    const a2 = buildRun({ stations: [{ md: 3100, inc: 31, azi: 91 }, { md: 3250, inc: 32, azi: 91 }, { md: 3340, inc: 35, azi: 92 }], ...grid, current: cur1 });
    expect(a2.payload).toMatchObject({ replaced: 3, tie_in: null });
    const mds = activeSurvey(well, [rec('r1', 0, a1), rec('r2', 5, a2)]).survey.stations.map((s) => s.md);
    expect(mds).toEqual([0, 1400, 1750, 3100, 3250, 3340]);
    // negative control: the shared composite orders runs by depth, so the stale first run (tied at 3200) would win below 3200
    const byDepth = compositeStations([{ stations: REG }, { stations: a2.payload.stations }, { stations: a1.payload.stations }]).map((s) => s.md);
    expect(byDepth).toEqual([0, 1400, 1750, 3100, 3200, 3300, 3330]);
    expect(compositeOf(REG, surveyRuns([rec('r2', 5, a2), rec('r1', 0, a1)])).map((s) => s.md)).toEqual(mds);
  });
});

describe('the door: units, north and hostile tables', () => {
  test('feet become metres; a magnetic azimuth is corrected to grid and wrapped', () => {
    const run = buildRun({ stations: [{ md: 11000, inc: 31, azi: 358 }], mdUnit: 'ft', azimuthRef: 'magnetic', gridCorrectionDeg: 4.5, current: REG });
    expect(run.payload.stations[1]).toEqual({ md: 3352.8, inc: 31, azi: 2.5 });
    expect(run.payload).toMatchObject({ md_unit_entered: 'ft', azimuth_ref: 'magnetic', grid_correction_deg: 4.5 });
    expect(run.payload.text).toMatch(/azimuths from magnetic north, corrected 4\.5 degrees to grid\.$/);
    // negative control: the same number declared in metres is refused as beyond the range, never stored
    expect(() => buildRun({ stations: [{ md: 51000, inc: 31, azi: 358 }], ...grid, current: REG })).toThrow(/beyond 15,000 m\. Check the declared unit/);
  });
  test('nothing is assumed: the unit and the north must be declared', () => {
    expect(() => buildRun({ stations: [{ md: 3300, inc: 30, azi: 90 }], mdUnit: '', azimuthRef: 'grid', current: REG })).toThrow('Declare the unit of the measured depths (m or ft).');
    expect(() => buildRun({ stations: [{ md: 3300, inc: 30, azi: 90 }], mdUnit: 'm', azimuthRef: '', current: REG })).toThrow(/Declare what the azimuths are measured from/);
    expect(() => buildRun({ stations: [{ md: 3300, inc: 30, azi: 90 }], mdUnit: 'm', azimuthRef: 'true', gridCorrectionDeg: NaN, current: REG })).toThrow(/Enter the correction/);
  });
  test('bad stations are refused by line with the reason', () => {
    expect(() => buildRun({ stations: [{ md: 3300, inc: 190, azi: 90, line: 2 }], ...grid, current: REG })).toThrow('Line 2: inclination 190 is outside 0 to 180 degrees.');
    expect(() => buildRun({ stations: [{ md: 3300, inc: 30, azi: 90 }, { md: 3290, inc: 30, azi: 90 }], ...grid, current: REG })).toThrow(/Station 2: MD 3290 m does not increase/);
    expect(() => buildRun({ stations: [{ md: NaN, inc: 30, azi: 90 }], ...grid, current: REG })).toThrow(/must be numbers/);
    expect(() => buildRun({ stations: [{ md: 100, inc: 0, azi: 0 }], ...grid, current: [] })).toThrow(/A first survey needs at least two stations/);
    expect(buildRun({ stations: [{ md: 0, inc: 0, azi: 0 }, { md: 500, inc: 2, azi: 10 }], ...grid, current: [] }).payload.stations).toHaveLength(2);
  });
  test('pasted tables: header with a unit, semicolons with comma decimals, tabs, extra columns, junk lines', () => {
    const a = parseStationTable('MD (ft)  Inc  Azi  TVD\n10500 30.5 91.2 9800\n10590 31.0 91.0 9877\nEND\n');
    expect(a.unitGuess).toBe('ft');
    expect(a.stations.map((s) => [s.md, s.inc, s.azi])).toEqual([[10500, 30.5, 91.2], [10590, 31, 91]]);
    expect(a.skipped).toEqual([{ line: 4, text: 'END', reason: 'fewer than three values (MD, inclination, azimuth)' }]);
    const b = parseStationTable('3300,5;30,25;90,0\n3330,0;31,5;90,5\n');
    expect(b.stations.map((s) => [s.md, s.inc, s.azi])).toEqual([[3300.5, 30.25, 90], [3330, 31.5, 90.5]]);
    expect(parseStationTable('3300\t30\t90\n3330\t31\t90\n').stations).toHaveLength(2);
    expect(parseStationTable('3300, 30, 90\n3330, 31, 90\n').stations).toHaveLength(2);
    expect(parseStationTable('3300 30 90\n3330 x 90\n').skipped[0].reason).toBe('a value is not a number');
    expect(() => parseStationTable('  \n')).toThrow('No stations were given.');
  });
});

describe('stored depths against a new survey', () => {
  test('an MD entry keeps its MD and its TVD is recalculated; a TVD entry is listed with where it now falls', () => {
    const ctx0 = wellContext(well);
    const run = buildRun({ stations: [{ md: 2500, inc: 40, azi: 90 }, { md: 3300, inc: 40, azi: 90 }], ...grid, current: REG });
    const ctx1 = wellContext(wellWithSurvey(well, [rec('r1', 0, run)]));
    const byMd = toCanonicalMd({ value: 3000, unit: 'm', reference: 'MD', datum: 'KB', kind: 'logged' }, ctx0);
    const byTvd = toCanonicalMd({ value: 2700, unit: 'm', reference: 'TVD', datum: 'KB', kind: 'logged' }, ctx0);
    const row = (id, entry, c) => ({ id, subtype: 'note', md_calc_m: c.mdM, tvd_calc_m: c.calculated.tvdM, survey_version: c.calculated.surveyVersion, depth_value: entry.value, depth_unit: 'm', depth_ref: entry.reference, depth_datum: 'KB', depth_kind: 'logged' });
    const s = staleDepths([row('a', { value: 3000, reference: 'MD' }, byMd), row('b', { value: 2700, reference: 'TVD' }, byTvd)], ctx1);
    expect(s).toMatchObject({ count: 2, currentVersion: 'rig-1' });
    expect(s.rows[0].tvdNowM).toBeCloseTo(mdToTvd(3000, ctx1).tvdM, 12);
    expect(Math.abs(s.rows[0].tvdDiffM)).toBeGreaterThan(10);
    expect(s.rows[0].mdNowM).toBeNull();
    expect(s.moved.map((m) => m.id)).toEqual(['b']);
    expect(mdToTvd(s.moved[0].mdNowM, ctx1).tvdM).toBeCloseTo(2700, 6);
    // nothing is stale against the survey it was recorded with
    expect(staleDepths([row('a', { value: 3000, reference: 'MD' }, byMd)], ctx0).count).toBe(0);
  });
});

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-u2-svy-${n += 1}`);
  const backend = makeLocalBackend({ transport: makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS }), db, autoSync: false });
  const w = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well: w };
}

test('screen: a run is declared and recorded; TVD on Live follows it and later records carry the new version', async () => {
  const { backend, well: w } = await setup();
  const tvdBefore = screen.getByTestId('ws-live-tvd').textContent;
  fireEvent.click(screen.getByTestId('ws-nav-surveys'));
  expect(await screen.findByTestId('ws-survey-inuse')).toHaveTextContent(/Registry survey taken when the live well was created, 4 stations, version registry-1, to 10499 ft MD/);
  // an undeclared unit is refused and nothing is stored
  fireEvent.change(screen.getByTestId('ws-survey-paste'), { target: { value: 'MD (m) Inc Azi\n2500 40 90\n3300 40 90\n' } });
  await waitFor(() => expect(screen.getByTestId('ws-survey-parse-summary')).toHaveTextContent('Read 2 station(s); the header says m, declare it above'));
  await act(async () => { fireEvent.click(screen.getByTestId('ws-survey-paste-record')); });
  await waitFor(() => expect(screen.getByTestId('ws-survey-error')).toHaveTextContent('Declare the unit of the measured depths (m or ft).'));
  expect(await backend.listRecords(w.id, { subtype: SURVEY_SUBTYPE })).toHaveLength(0);
  fireEvent.change(screen.getByTestId('ws-survey-mdunit'), { target: { value: 'm' } });
  fireEvent.change(screen.getByTestId('ws-survey-aziref'), { target: { value: 'grid' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-survey-paste-record')); });
  await waitFor(() => expect(screen.getByTestId('ws-survey-inuse')).toHaveTextContent(/Rig survey, 1 run\(s\), 5 stations, version rig-1, to 10827 ft MD/));
  // the status is in the depth unit of the view; the record keeps metres
  expect(screen.getByTestId('ws-status')).toHaveTextContent('Survey run: 2 station(s) from 8202 ft to 10827 ft MD, replacing 1 earlier station(s) from 8202 ft down. TVD and subsea depths now follow it.');
  await waitFor(() => expect(screen.getByTestId('ws-survey-stale-summary')).toHaveTextContent(/stored depth\(s\) were calculated before survey rig-1/));
  expect(screen.getAllByTestId(/^ws-survey-row-/)).toHaveLength(5);
  // Live: the bit's TVD is recalculated with the run and the recorded value is kept beside it
  fireEvent.click(screen.getByTestId('ws-nav-live'));
  await waitFor(() => expect(screen.getByTestId('ws-live-tvd').textContent).not.toBe(tvdBefore));
  expect(screen.getByTestId('ws-live-tvd').parentElement).toHaveTextContent(/survey rig-1; recorded as \d+ ft with survey registry-1/);
  // a bit depth recorded now is calculated with the run; the well row still holds the registry snapshot
  const { row } = await backend.addRecord(w.id, { kind: 'observation', subtype: 'bit_depth', depth: { value: 3100, unit: 'm', reference: 'MD', datum: 'KB', kind: 'bit_depth' }, payload: { source: 'manual' } });
  expect(row.survey_version).toBe('rig-1');
  const runs = await backend.listRecords(w.id, { subtype: SURVEY_SUBTYPE });
  expect(row.tvd_calc_m).toBeCloseTo(mdToTvd(3100, wellContext(wellWithSurvey(await backend.getWell(w.id), runs))).tvdM, 9);
  await backend.updateWellSettings(w.id, { overdue_tolerance_min: 20 });
  expect((await backend.getWell(w.id)).survey.version).toBe('registry-1');
  expect(await backend.db.outbox.where('entity_id').equals(runs[0].id).count()).toBe(1);
});
