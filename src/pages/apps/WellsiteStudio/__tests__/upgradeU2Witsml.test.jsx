// Wellsite Studio upgrade U2-011 (2026-10-01): WITSML 1.4.1.1 trajectory,
// log and mudLog files. Each object is written by the shipped writer, read
// back by the shipped reader and compared with what went in (round trip);
// the hostile files in e2e/fixtures/wellsite/hostile/witsml go through the
// same reader and then through the app's own doors (the survey door, the
// mudlog import door, the description vocabulary).
import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS } from '../services/seed';
import { trajectoryXml, logXml, mudLogXml, parseWitsml, trajectoryFromWitsml, logTableFromWitsml, intervalsFromWitsml, descriptionRecordsFromIntervals, WITSML_NS } from '../services/witsml';
import { surveyListing, buildRun } from '../services/surveys';
import { parseMudlogFile, initialMapping, missingChoices, convertMudlog } from '../services/mudlogImport';
import { validateDescription } from '@/lib/wellsite/descriptionVocabulary';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

const FT = 0.3048;
const DIR = path.join(__dirname, '../../../../../e2e/fixtures/wellsite/hostile/witsml');
const file = (n) => fs.readFileSync(path.join(DIR, n), 'utf8');
const well = { id: 'ws-1', geo_well_id: 'geo-1', name: 'KETA-2 & "side" <track>' };
const STATIONS = SEED_REGISTRY_WELLS[0].deviation;

describe('round trip: what is written is read back the same', () => {
  test('trajectory: stations, the namespace and version, grid north, a name with XML characters', () => {
    const listing = surveyListing(STATIONS, 25);
    const xml = trajectoryXml({ well, listing, version: 'rig-2' });
    expect(xml).toContain(`<trajectorys xmlns="${WITSML_NS}" version="1.4.1.1">`);
    expect(xml).toContain('<nameWell>KETA-2 &amp; &quot;side&quot; &lt;track&gt;</nameWell>');
    expect(xml).toContain('<md uom="m">1750</md>');
    expect(xml).toContain('<incl uom="dega">30</incl>');
    const t = trajectoryFromWitsml(parseWitsml(xml));
    expect(t.stations.map((s) => [s.md, s.inc, s.azi])).toEqual(STATIONS.map((s) => [s.md, s.inc, s.azi]));
    expect(t).toMatchObject({ azimuthRef: 'grid', mdUnit: 'm', skipped: [], name: 'KETA-2 & "side" <track> rig-2' });
    // and the stations pass the survey door as a full replacement
    expect(buildRun({ stations: t.stations, mdUnit: 'm', azimuthRef: 'grid', current: [] }).payload.stations).toHaveLength(4);
    expect(() => trajectoryXml({ well, listing: [] })).toThrow('There is no survey to export.');
  });
  test('log: rows, nulls and units come back through the import door in the canonical frame', () => {
    const points = [
      { mdM: 3000, values: { rop: 20.5, wob: 120, rpm: 140, mw: 1260, total_gas: 0.45, c1: 5200 } },
      { mdM: 3001, values: { rop: 21, rpm: 140, mw: 1260, total_gas: 0.5 } },
      { mdM: 3002, values: { rop: 19.25, wob: 125, rpm: 138, mw: 1262.5, c1: 6100 } },
    ];
    const xml = logXml({ well, points });
    expect(xml).toContain('<mnemonicList>MD,ROP,WOB,RPM,MWIN,TGAS,C1</mnemonicList>');
    expect(xml).toContain('<unitList>m,m/h,kN,rpm,kg/m3,%,ppm</unitList>');
    expect(xml).toContain('<data>3001,21,-999.25,140,1260,0.5,-999.25</data>');
    const table = parseMudlogFile(xml, { fileName: 'x.xml' });
    expect(table.format).toBe('witsml');
    const m = { ...initialMapping(table), depthDatum: 'KB' };
    expect(m.columns.map((c) => [c.quantity, c.unit])).toEqual([['md', 'm'], ['rop', 'm/hr'], ['wob', 'kN'], ['rpm', 'rpm'], ['mw', 'kg/m3'], ['total_gas', '%'], ['c1', 'ppm']]);
    expect(missingChoices(table, m)).toEqual([]);
    const c = convertMudlog(table, m);
    expect(c.rows.map((r) => ({ mdM: r.mdM, values: r.values }))).toEqual(points);
    expect(() => logXml({ well, points: [] })).toThrow('There are no data rows to export.');
  });
  test('mudLog: intervals with their percentages come back as descriptions the vocabulary accepts', () => {
    const descriptions = [
      { id: 'd1', md_calc_m: 3048, md2_calc_m: 3051.048, payload: { components: [{ lithology: 'sandstone', percent: 70 }, { lithology: 'shale', percent: 30 }] } },
      { id: 'd2', md_calc_m: 3051.048, md2_calc_m: 3054.096, payload: { components: [{ lithology: 'limestone', percent: 100 }] } },
    ];
    const xml = mudLogXml({ well, descriptions, textOf: (r) => (r.id === 'd1' ? '70% SST: lt gy & <f gr>' : 'LS') });
    expect(xml).toContain('<lithPc uom="%">70</lithPc>');
    expect(xml).toContain('<description>70% SST: lt gy &amp; &lt;f gr&gt;</description>');
    const iv = intervalsFromWitsml(parseWitsml(xml));
    expect(iv.skipped).toEqual([]);
    expect(iv.intervals.map((i) => [i.mdTopM, i.mdBaseM, i.components, i.comment])).toEqual([
      [3048, 3051.048, [{ lithology: 'sandstone', percent: 70 }, { lithology: 'shale', percent: 30 }], '70% SST: lt gy & <f gr>'],
      [3051.048, 3054.096, [{ lithology: 'limestone', percent: 100 }], 'LS'],
    ]);
    const recs = descriptionRecordsFromIntervals(iv.intervals, { fileName: 'm.xml' });
    expect(recs[0]).toMatchObject({ subtype: 'cuttings_description', depth: { value: 3048, unit: 'm', reference: 'MD', datum: 'KB' }, payload: { mode: 'import', source: 'external', source_file: 'm.xml' } });
    for (const r of recs) expect(validateDescription({ components: r.payload.components }).ok).toBe(true);
    expect(() => mudLogXml({ well, descriptions: [] })).toThrow('There are no cuttings descriptions to export.');
  });
});

describe('hostile files', () => {
  test('a prefixed trajectory in feet with one station in radians, out of order, and one with no uom', () => {
    const t = trajectoryFromWitsml(parseWitsml(file('trajectory_prefixed_ft_rad.xml')));
    expect(t.name).toBe('MWD run 3');
    expect(t.azimuthRef).toBe('true');
    expect(t.stations.map((s) => s.md)).toEqual([Number((10500 * FT).toFixed(4)), Number((10690 * FT).toFixed(4))]);
    expect(t.stations[1].inc).toBeCloseTo(32.0, 1); // 0.5585 rad
    expect(t.stations[1].azi).toBeCloseTo(91.0, 1);
    expect(t.skipped).toEqual([{ line: 3, text: 'station 3', reason: 'md has no uom, so the length unit is not known' }]);
    // negative control: the radians read as degrees would put the well vertical at 0.56 degrees
    expect(Math.abs(0.5585 - t.stations[1].inc)).toBeGreaterThan(30);
  });
  test('a vendor log: WITSML unit spellings pre-fill, the null and the empty cell are "not read", an unknown unit must be declared', () => {
    const table = parseMudlogFile(file('log_vendor_units_nulls.xml'), { fileName: 'log.xml' });
    const m = initialMapping(table);
    expect(m.columns.map((c) => [c.quantity, c.unit])).toEqual([['md', 'ft'], ['rop', 'ft/hr'], ['wob', 'klbf'], ['mw', 'ppg'], [null, null]]);
    // the gas curve is not recognised by name; chosen by the user, its unit Euc is not one the door knows and must be declared
    const withGas = { ...m, depthDatum: 'KB', columns: m.columns.map((c, i) => (i === 4 ? { quantity: 'total_gas', unit: null } : c)) };
    expect(missingChoices(table, withGas)).toEqual(['declare the unit of GASX (Total gas): %, ppm, units']);
    const c = convertMudlog(table, { ...m, depthDatum: 'KB' });
    expect(c.rows).toHaveLength(5);
    expect(c.rows[1].values.rop).toBeUndefined();
    expect(c.rows[2].values.wob).toBeUndefined();
    expect(c.rows[0].values.mw).toBeCloseTo(9.6 * 119.82642731689663, 6);
    expect(c.rows[4].mdM).toBeCloseTo(9840 * FT, 9);
  });
  test('a mud log: good intervals are read, each bad one is listed with its reason', () => {
    const iv = intervalsFromWitsml(parseWitsml(file('mudlog_intervals_mixed.xml')));
    expect(iv.intervals.map((i) => [Number((i.mdTopM / FT).toFixed(1)), i.components])).toEqual([
      [9900, [{ lithology: 'sandstone', percent: 70 }, { lithology: 'shale', percent: 30 }]],
      [9940, [{ lithology: 'shale', percent: 100 }]],
    ]);
    expect(iv.skipped).toEqual([
      { line: 2, text: 'interval 2', reason: 'the lithology "unobtainium" is not in the description vocabulary' },
      { line: 3, text: 'interval 3', reason: 'its lithology percentages add up to 80, they must add up to 100' },
      { line: 4, text: 'interval 4', reason: 'mdTop has no uom, so the length unit is not known' },
    ]);
  });
  test('broken XML, a WITSML 2.0 object, another 1.4.1.1 object, a wrong version and plain text are refused with the reason', () => {
    expect(() => parseWitsml(file('broken_cut_short.xml'))).toThrow('The XML is not well formed: the file is damaged or cut short.');
    expect(() => parseWitsml(file('witsml20_trajectory.xml'))).toThrow(/This is a WITSML 2\.0 Trajectory file\. This reader takes the 1\.4\.1\.1/);
    expect(() => parseWitsml(file('well_object_not_supported.xml'))).toThrow('The file holds wells, which is not a WITSML trajectory, log or mudLog.');
    expect(() => parseWitsml('<logs version="2.1"><log/></logs>')).toThrow(/WITSML version 2\.1/);
    expect(() => parseWitsml('depth,rop')).toThrow('This is not an XML file.');
    expect(() => parseWitsml('  ')).toThrow('The file is empty.');
    expect(() => parseWitsml('<logs version="1.4.1.1"></logs>')).toThrow('The file has no log in it.');
    expect(() => logTableFromWitsml(parseWitsml('<logs version="1.4.1.1"><log><name>x</name></log></logs>'))).toThrow(/no logData/);
    // a trajectory handed to the mudlog door says where it belongs
    expect(() => parseMudlogFile(file('trajectory_prefixed_ft_rad.xml'))).toThrow('This is a WITSML trajectory: load it on the Surveys view.');
    // a 1.3.1.1 file is read; a file with no version is read and says so
    expect(parseWitsml('<logs version="1.3.1.1"><log/></logs>').version).toBe('1.3.1.1');
    expect(parseWitsml('<mudLogs><mudLog/></mudLogs>').notes).toEqual(['The file does not state its WITSML version; it is read as 1.4.1.']);
  });
});

let n = 0;
test('screen: a WITSML mudLog file is read on Import and its good intervals become descriptions; the bad ones are listed', async () => {
  const db = openWellsiteDb(`ws-u2-witsml-${n += 1}`);
  const backend = makeLocalBackend({ transport: makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS }), db, autoSync: false });
  const w = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  fireEvent.click(screen.getByTestId('ws-nav-import'));
  fireEvent.change(await screen.findByTestId('ws-import-paste'), { target: { value: file('mudlog_intervals_mixed.xml') } });
  fireEvent.click(screen.getByTestId('ws-import-read'));
  await waitFor(() => expect(screen.getByTestId('ws-import-mudlog-summary')).toHaveTextContent('WITSML mudLog Mud log 12.25 in section: 2 lithology interval(s), 9900 ft to 9950 ft MD below KB.'));
  expect(screen.getByTestId('ws-import-mudlog-skipped')).toHaveTextContent('interval 2: the lithology "unobtainium" is not in the description vocabulary');
  expect(screen.getByTestId('ws-witsml-export-log')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByTestId('ws-import-mudlog-go')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('pasted table: 2 cuttings description(s) added from the WITSML mudLog, marked externally observed.'));
  const descs = await backend.listRecords(w.id, { subtype: 'cuttings_description' });
  expect(descs.map((d) => d.payload.source)).toEqual(['external', 'external']);
  expect(descs[0].md_calc_m).toBeCloseTo(9900 * FT, 6);
  await waitFor(() => expect(screen.getByTestId('ws-explorer-counts')).toHaveTextContent('2 description(s)'));
});
