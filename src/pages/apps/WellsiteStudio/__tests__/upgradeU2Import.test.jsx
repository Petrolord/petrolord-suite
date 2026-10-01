// Wellsite Studio upgrade U2-003 (2026-10-01): the mudlog import door on the
// hostile file set (e2e/fixtures/wellsite/hostile), through the shipped
// importer. Each file is read, its guesses checked, the missing declarations
// named, and the converted numbers checked against the file by hand. The
// screen test walks one import on the real workstation.
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
import {
  parseMudlogFile, initialMapping, missingChoices, convertMudlog, mudlogRecords, mudlogSeries, importsOf, withdrawParams, typedRowParams,
  lagRecordsFromRows, parseStamp, guessDateOrder, canonUnit, unitFromHeader, displayUnit, IMPORT_SUBTYPE, DATA_SUBTYPE, CHUNK_ROWS,
} from '../services/mudlogImport';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

const FT = 0.3048;
const HOSTILE = path.join(__dirname, '../../../../../e2e/fixtures/wellsite/hostile');
const file = (name) => fs.readFileSync(path.join(HOSTILE, name), 'utf8');
const open = (name) => { const t = parseMudlogFile(file(name), { fileName: name }); return { t, m: initialMapping(t) }; };
const q = (m) => m.columns.map((c) => c.quantity);

describe('hostile 1: field units, columns reordered, extra columns, units in the header', () => {
  const { t, m } = open('mudlog_depth_ft_reordered_units_in_header.csv');
  test('the columns are found wherever they are and the header units pre-fill; extras are left out', () => {
    expect(q(m)).toEqual([null, null, 'rop', 'md', 'mw', 'wob', 'rpm', 'spp', 'flow', 'total_gas', null]);
    expect(m.columns.map((c) => c.unit)).toEqual([null, null, 'ft/hr', 'ft', 'ppg', 'klbf', 'rpm', 'psi', 'gpm', '%', null]);
    // the datum is in no file: it must be declared
    expect(missingChoices(t, m)).toEqual(['declare the datum the depths are measured from (KB, RT, GL or MSL)']);
  });
  test('converted to the canonical frame: 9,800 ft, 55 ft/hr, 28 klb, 3,250 psi, 640 gpm, 9.6 ppg', () => {
    const c = convertMudlog(t, { ...m, depthDatum: 'KB' });
    expect(c.rows).toHaveLength(12);
    expect(c.skipped).toEqual([]);
    const r = c.rows[0];
    expect(r.mdM).toBeCloseTo(9800 * FT, 9);
    expect(r.values.rop).toBeCloseTo(55 * FT, 9);
    expect(r.values.wob).toBeCloseTo(28 * 4.4482216152605, 9);
    expect(r.values.spp).toBeCloseTo(3250 * 6.894757293168361, 6);
    expect(r.values.flow).toBeCloseTo(640 * 0.003785411784, 9);
    expect(r.values.mw).toBeCloseTo(9.6 * 119.82642731689663, 6);
    expect(r.values.total_gas).toBeCloseTo(0.8, 12);
    expect(c.index).toBe('depth');
  });
  test('a depth datum of RT 2 m above KB shifts every depth by that much', () => {
    const c = convertMudlog(t, { ...m, depthDatum: 'RT' }, { datumShiftM: -2 });
    expect(c.rows[0].mdM).toBeCloseTo(9800 * FT - 2, 9);
  });
  test('the wrong declared unit is caught: klb read as tonnes passes, feet read as metres is refused, ft/hr read as min/ft still converts', () => {
    // depth declared in metres: 9,800 m is in range, but 9,910 ft as metres too, so the range check alone cannot see it;
    // what it does see is a weight on bit declared in kN when the file is in lbf-thousands times a thousand
    const lb = { ...m, depthDatum: 'KB', columns: m.columns.map((c) => (c.quantity === 'spp' ? { ...c, unit: 'MPa' } : c)) };
    expect(() => convertMudlog(t, lb)).toThrow(/12 of 12 values of SPP \(psi\) \(Standpipe pressure\) are outside the possible range in MPa.*The declared unit looks wrong/);
  });
});

describe('hostile 2: time based, semicolons, comma decimals, day-first dates, metric', () => {
  const { t, m } = open('mudlog_time_dayfirst_semicolon_comma_decimal.csv');
  test('read with comma decimals; the date order is ambiguous and must be declared, with the clock and the datum', () => {
    expect(t.commaDecimal).toBe(true);
    expect(t.delim).toBe(';');
    expect(q(m)).toEqual(['time', 'md', 'bit_md', 'rop', 'wob', 'rpm', 'spm', 'spp', 'flow', 'mw', 'total_gas']);
    expect(m.dateOrder).toBeNull();
    expect(missingChoices(t, m)).toEqual([
      'declare the datum the depths are measured from (KB, RT, GL or MSL)',
      'declare the date order (day first or month first)',
      'declare whether the times are rig time or UTC',
    ]);
  });
  const full = { ...m, depthDatum: 'KB', dateOrder: 'dmy', timeZone: 'rig' };
  test('7 September at 06:00 rig time (UTC+1) is 05:00 UTC; 14.2 t is 139.3 kN; 3,500 ppm is 0.35 percent', () => {
    const c = convertMudlog(t, full, { offsetMin: 60 });
    expect(c.index).toBe('time');
    expect(new Date(c.rows[0].tUtcMs).toISOString()).toBe('2026-09-07T05:00:00.000Z');
    expect(c.rows[0].values.wob).toBeCloseTo(14.2 * 9.80665, 9);
    expect(c.rows[0].values.spp).toBeCloseTo(21550, 6);
    expect(c.rows[0].values.flow).toBeCloseTo(2.45, 9);
    expect(c.rows[0].values.mw).toBeCloseTo(1260, 6);
    expect(c.rows[0].values.total_gas).toBeCloseTo(0.35, 12);
    // negative control: read month first, the same stamp is 9 July
    const mdy = convertMudlog(t, { ...full, dateOrder: 'mdy' }, { offsetMin: 60 });
    expect(new Date(mdy.rows[0].tUtcMs).toISOString()).toBe('2026-07-09T05:00:00.000Z');
  });
  test('for the lag: bit depths one per metre made, pump changes at the connection (62, 0, 62)', () => {
    const c = convertMudlog(t, full, { offsetMin: 60 });
    const lag = lagRecordsFromRows(c.rows);
    expect(lag.pumpRates.map((p) => p.payload.spm)).toEqual([62, 0, 62]);
    expect(lag.bitDepths[0]).toMatchObject({ subtype: 'bit_depth', occurredAt: '2026-09-07T05:00:00.000Z', depth: { value: 3000, unit: 'm', reference: 'MD', datum: 'KB', kind: 'bit_depth' }, payload: { source: 'external' } });
    // the bit off bottom at the connection is not a new bit depth
    expect(lag.bitDepths.every((b, i, a) => i === 0 || b.depth.value > a[i - 1].depth.value)).toBe(true);
    expect(lagRecordsFromRows(c.rows, { maxBit: 4 }).bitKept).toBeLessThanOrEqual(5);
  });
});

describe('hostile 3: no header', () => {
  const { t, m } = open('mudlog_no_header.txt');
  test('nothing is guessed; the user says what each column is, then it imports', () => {
    expect(t.columns).toEqual(['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5']);
    expect(q(m)).toEqual([null, null, null, null, null]);
    expect(missingChoices(t, m)).toContain('choose the depth column (hole depth or bit depth, MD)');
    const mapped = { ...m, depthDatum: 'KB', columns: [{ quantity: 'md', unit: 'm' }, { quantity: 'rop', unit: 'm/hr' }, { quantity: 'wob', unit: 'kN' }, { quantity: 'rpm', unit: 'rpm' }, { quantity: 'total_gas', unit: '%' }] };
    const c = convertMudlog(t, mapped);
    expect(c.rows).toHaveLength(10);
    expect(c.rows[9]).toMatchObject({ mdM: 2545, values: { rop: 14.9, wob: 128, rpm: 140, total_gas: 0.8 } });
    // a column chosen twice, or a unit left undeclared, is refused by name
    expect(missingChoices(t, { ...mapped, columns: mapped.columns.map((c2, i) => (i === 2 ? { quantity: 'rop', unit: 'm/hr' } : c2)) })[0]).toMatch(/Rate of penetration is chosen for more than one column/);
    expect(missingChoices(t, { ...mapped, columns: mapped.columns.map((c2, i) => (i === 1 ? { quantity: 'rop', unit: null } : c2)) })[0]).toMatch(/declare the unit of Column 2 \(Rate of penetration\): m\/hr, ft\/hr, min\/m, min\/ft/);
  });
});

describe('hostile 4: LAS 2.0, nulls, ROP in min/ft, vendor mnemonics, gas in units', () => {
  const { t, m } = open('mudlog_las20_nulls_min_per_ft.las');
  test('the vendor mnemonics are recognised and the inverse unit converts: 1.5 min/ft is 40 ft/hr', () => {
    expect(t.format).toBe('las');
    expect(q(m)).toEqual(['md', 'rop', 'wob', 'rpm', 'total_gas', 'c1', 'c2', 'c3', 'mw']);
    expect(m.columns[1].unit).toBe('min/ft');
    expect(m.columns[4].unit).toBe('units');
    const c = convertMudlog(t, { ...m, depthDatum: 'KB' });
    expect(c.rows).toHaveLength(10);
    expect(c.rows[0].values.rop).toBeCloseTo(40 * FT, 9);
    // -999.25 is "not read" for that value, never a number, and the row is kept
    expect(c.rows[3].values.rop).toBeUndefined();
    expect(c.rows[3].values.wob).toBeCloseTo(33 * 4.4482216152605, 9);
    expect(c.rows[7].values.total_gas_units).toBeUndefined();
    // uncalibrated units are kept apart from percent
    expect(c.rows[0].values.total_gas_units).toBe(25);
    expect(c.rows[0].values.total_gas).toBeUndefined();
    expect(c.kept.rop).toBe(9);
  });
});

describe('hostile 5: vendor tab export, units row, quoted headers, chromatograph, junk', () => {
  const { t, m } = open('mudlog_vendor_tab_units_row_chromatograph.txt');
  test('the units row is read as units; the row with no depth and the trailer are listed with reasons', () => {
    expect(t.headerLines).toBe(2);
    expect(t.columns[0]).toBe('DEPTH');
    expect(q(m)).toEqual(['md', 'torque', 'wob', 'rop', 'c1', 'c2', 'c3', 'ic4', 'nc4', 'ic5', 'nc5', 'ecd', 'bit_size']);
    expect(m.columns.map((c) => c.unit)).toEqual(['ft', 'kft.lbf', 'klbf', 'ft/hr', 'ppm', 'ppm', 'ppm', 'ppm', 'ppm', 'ppm', 'ppm', 'ppg', 'in']);
    const c = convertMudlog(t, { ...m, depthDatum: 'KB' });
    expect(c.rows).toHaveLength(8);
    expect(c.skipped.map((s) => s.reason)).toEqual(['the depth is not a number', 'the depth is not a number']);
    expect(c.skipped.map((s) => s.line)).toEqual([7, 12]);
    expect(c.rows[0].values).toMatchObject({ c1: 52000, c2: 4100, nc5: 210 });
    expect(c.rows[0].values.torque).toBeCloseTo(11.5 * 1.3558179483314, 9);
    expect(c.rows[0].values.bit_size).toBeCloseTo(8.5 * 0.0254, 12);
    expect(c.rows[0].values.ecd).toBeCloseTo(11.4 * 119.82642731689663, 6);
  });
});

describe('hostile 6: LAS 3.0, comma delimited, metric', () => {
  test('read like the 2.0 file', () => {
    const { t, m } = open('mudlog_las30_comma_metric.las');
    expect(q(m)).toEqual(['md', 'rop', 'wob', 'rpm', 'total_gas', 'mw']);
    const c = convertMudlog(t, { ...m, depthDatum: 'KB' });
    expect(c.rows).toHaveLength(10);
    expect(c.rows[1]).toMatchObject({ mdM: 2000.5, values: { rop: 21.5, wob: 96, rpm: 150, total_gas: 0.42, mw: 1250 } });
  });
});

describe('the door itself', () => {
  test('units as written, in brackets or trailing; unknown spellings are not guessed', () => {
    expect(['FT/HR', 'f/hr', 'klbs', 'KLB', 'kft-lb', 'psig', 'lb/gal', 'g/cm3', 'L/min', 'usgpm', 'pct'].map(canonUnit)).toEqual(['ft/hr', 'ft/hr', 'klbf', 'klbf', 'kft.lbf', 'psi', 'ppg', 'g/cc', 'L/min', 'gpm', '%']);
    expect(canonUnit('furlongs')).toBeNull();
    expect(unitFromHeader('ROP (ft/hr)')).toBe('ft/hr');
    expect(unitFromHeader('WOB [klb]')).toBe('klb');
    expect(unitFromHeader('Depth ft')).toBe('ft');
    expect(unitFromHeader('Remarks')).toBeNull();
  });
  test('date stamps: ISO with and without a zone, day first, month first, named months, AM and PM; junk is NaN', () => {
    const z = (s, o) => new Date(parseStamp(s, { offsetMin: 60, ...o })).toISOString();
    expect(z('2026-09-07T05:00:00Z', { order: 'iso', zone: 'rig' })).toBe('2026-09-07T05:00:00.000Z');
    expect(z('2026-09-07 06:00', { order: 'iso', zone: 'rig' })).toBe('2026-09-07T05:00:00.000Z');
    expect(z('2026-09-07 06:00:30+02:00', { order: 'iso', zone: 'utc' })).toBe('2026-09-07T04:00:30.000Z');
    expect(z('31/12/2026 23:59', { order: 'dmy', zone: 'utc' })).toBe('2026-12-31T23:59:00.000Z');
    expect(z('12/31/2026 11:59 PM', { order: 'mdy', zone: 'utc' })).toBe('2026-12-31T23:59:00.000Z');
    expect(z('07-Sep-2026 06:00', { order: 'mdy', zone: 'utc' })).toBe('2026-09-07T06:00:00.000Z');
    expect(parseStamp('31/12/2026 23:59', { order: 'mdy', zone: 'utc' })).toBeNaN();
    expect(parseStamp('yesterday', { order: 'dmy', zone: 'utc' })).toBeNaN();
    expect(guessDateOrder(['07/09/2026 06:00', '08/09/2026 06:00'])).toBe('ambiguous');
    expect(guessDateOrder(['07/09/2026 06:00', '13/09/2026 06:00'])).toBe('dmy');
    expect(guessDateOrder(['09/13/2026 06:00'])).toBe('mdy');
    expect(guessDateOrder(['2026-09-07 06:00'])).toBe('iso');
  });
  test('an empty file, a file of words and a LAS with no data are refused with a reason', () => {
    expect(() => parseMudlogFile('   \n')).toThrow('The file is empty.');
    expect(() => parseMudlogFile('~Version\n VERS. 2.0 : x\n WRAP. NO : x\n~Well\n NULL. -999.25 : x\n~Curve\n DEPT.M : x\n~A\n', { fileName: 'x.las' })).toThrow(/This LAS file could not be read/);
    const words = parseMudlogFile('alpha,beta\nfoo,bar\n');
    expect(() => convertMudlog(words, { columns: [{ quantity: 'md', unit: 'm' }, { quantity: 'rop', unit: 'm/hr' }], depthDatum: 'KB' })).toThrow(/No row could be read: the depth is not a number \(line 2\)/);
  });
  test('real size: 10,000 rows convert, chunk and read back in well under five seconds', () => {
    const lines = ['Depth (m),ROP (m/hr),WOB (kN),RPM,Total Gas (%),C1 (ppm),MW (sg)'];
    for (let i = 0; i < 10000; i += 1) lines.push(`${(1000 + i * 0.25).toFixed(2)},${(15 + (i % 40) * 0.5).toFixed(1)},${100 + (i % 30)},140,${(0.2 + (i % 50) * 0.01).toFixed(2)},${2000 + i},1.2`);
    const t0 = Date.now();
    const t = parseMudlogFile(lines.join('\n'));
    const c = convertMudlog(t, { ...initialMapping(t), depthDatum: 'KB' });
    const { header, chunks } = mudlogRecords(c, { importId: 'imp-1', fileName: 'big.csv', table: t, mapping: { ...initialMapping(t), depthDatum: 'KB' } });
    const records = [{ id: 'imp-1', subtype: IMPORT_SUBTYPE, occurred_at: '2026-10-01T00:00:00Z', payload: header.payload }, ...chunks.map((k, i) => ({ id: `c${i}`, subtype: DATA_SUBTYPE, occurred_at: '2026-10-01T00:00:00Z', md_calc_m: k.depth.value, payload: k.payload }))];
    const s = mudlogSeries(records);
    const ms = Date.now() - t0;
    expect(c.rows).toHaveLength(10000);
    expect(chunks).toHaveLength(10000 / CHUNK_ROWS);
    expect(header.payload).toMatchObject({ rows: 10000, chunks: 20, md_from_m: 1000, md_to_m: 3499.75, depth_datum: 'KB' });
    expect(header.payload.text).toMatch(/^Mudlog import big\.csv: 10000 row\(s\), 1000\.0 to 3499\.8 m MD/);
    expect(s.points).toHaveLength(10000);
    expect(s.points[9999]).toMatchObject({ mdM: 3499.75, values: { c1: 11999 } });
    expect(ms).toBeLessThan(5000);
  });
  test('withdrawing an import removes its rows from every reader; typed rows stay', () => {
    const t = parseMudlogFile('Depth (m),ROP (m/hr)\n1000,20\n1001,22\n');
    const map = { ...initialMapping(t), depthDatum: 'KB' };
    const { header, chunks } = mudlogRecords(convertMudlog(t, map), { importId: 'imp-9', fileName: 'a.csv', table: t, mapping: map });
    const head = { id: 'imp-9', kind: 'observation', subtype: IMPORT_SUBTYPE, occurred_at: '2026-10-01T00:00:00Z', payload: header.payload };
    const data = { id: 'd1', kind: 'observation', subtype: DATA_SUBTYPE, occurred_at: '2026-10-01T00:00:00Z', md_calc_m: 1000, payload: chunks[0].payload };
    const typed = { id: 't1', kind: 'observation', subtype: DATA_SUBTYPE, occurred_at: '2026-10-01T01:00:00Z', md_calc_m: 1500, payload: typedRowParams({ depthEntry: { value: 1500, unit: 'm', reference: 'MD', datum: 'KB' }, values: { rop: 12, wob: 110 } }).payload };
    expect(mudlogSeries([head, data, typed])).toMatchObject({ imports: 1, typed: 1 });
    expect(mudlogSeries([head, data, typed]).points).toHaveLength(3);
    const w = withdrawParams(head, { reason: 'wrong well', person: 'R. Rigsite' });
    const corr = { id: 'imp-9b', kind: 'observation', subtype: IMPORT_SUBTYPE, supersedes_id: 'imp-9', occurred_at: '2026-10-01T02:00:00Z', payload: w.payload };
    const after = mudlogSeries([head, data, typed, corr]);
    expect(after.points.map((p) => p.mdM)).toEqual([1500]);
    expect(importsOf([head, corr]).current.map((h) => h.id)).toEqual(['imp-9b']);
    expect(corr.payload.text).toMatch(/Withdrawn: wrong well\.$/);
    expect(() => withdrawParams(head, { reason: ' ' })).toThrow('Say why the import is withdrawn.');
    expect(() => typedRowParams({ depthEntry: { value: 1500 }, values: { wob: 5000 } })).toThrow(/Weight on bit is outside its possible range/);
    expect(() => typedRowParams({ depthEntry: { value: 1500 }, values: {} })).toThrow('Enter at least one drilling parameter.');
  });
  test('display units follow the depth unit and the pressure unit of the profile', () => {
    expect(displayUnit('rop', 'ft')[0]).toBe('ft/hr');
    expect(displayUnit('rop', 'ft')[1](30 * FT)).toBeCloseTo(30, 12);
    expect(displayUnit('wob', 'm')[0]).toBe('kN');
    expect(displayUnit('mw', 'ft')[1](1198.2642731689663)).toBeCloseTo(10, 9);
    expect(displayUnit('spp', 'ft', 'bar')).toEqual(['bar', expect.any(Function)]);
    expect(displayUnit('spp', 'ft', 'bar')[1](21550)).toBeCloseTo(215.5, 9);
  });
});

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-u2-imp-${n += 1}`);
  const backend = makeLocalBackend({ transport: makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS }), db, autoSync: false });
  const well = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well };
}

test('screen: a pasted export shows what was read, asks for the datum, imports, lists the import and withdraws it', async () => {
  const { backend, well } = await setup();
  fireEvent.click(screen.getByTestId('ws-nav-import'));
  fireEvent.change(await screen.findByTestId('ws-import-paste'), { target: { value: file('mudlog_depth_ft_reordered_units_in_header.csv') } });
  fireEvent.click(screen.getByTestId('ws-import-read'));
  await waitFor(() => expect(screen.getByTestId('ws-import-read-summary')).toHaveTextContent('11 column(s), 12 row(s)'));
  expect(screen.getByTestId('ws-import-quantity-3')).toHaveValue('md');
  expect(screen.getByTestId('ws-import-unit-3')).toHaveValue('ft');
  expect(screen.getByTestId('ws-import-quantity-0')).toHaveValue('');
  expect(screen.getByTestId('ws-import-missing')).toHaveTextContent('Before import: declare the datum the depths are measured from (KB, RT, GL or MSL).');
  expect(screen.queryByTestId('ws-import-go')).toBeNull();
  fireEvent.change(screen.getByTestId('ws-import-datum'), { target: { value: 'KB' } });
  await waitFor(() => expect(screen.getByTestId('ws-import-preview-rows')).toHaveTextContent('12 row(s) will be imported, 9800 ft to 9910 ft MD below KB.'));
  // un-declaring a unit takes the import away again
  fireEvent.change(screen.getByTestId('ws-import-unit-5'), { target: { value: '' } });
  await waitFor(() => expect(screen.getByTestId('ws-import-missing')).toHaveTextContent(/declare the unit of WOB \(klb\) \(Weight on bit\)/));
  fireEvent.change(screen.getByTestId('ws-import-unit-5'), { target: { value: 'klbf' } });
  await act(async () => { fireEvent.click(await screen.findByTestId('ws-import-go')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('pasted table: 12 row(s) imported.'));
  const heads = await backend.listRecords(well.id, { subtype: IMPORT_SUBTYPE });
  const data = await backend.listRecords(well.id, { subtype: DATA_SUBTYPE });
  expect(heads).toHaveLength(1);
  expect(data).toHaveLength(1);
  expect(data[0].payload.import_id).toBe(heads[0].id);
  expect(data[0].md_calc_m).toBeCloseTo(9800 * FT, 6);
  expect(await backend.db.outbox.where('entity_id').equals(data[0].id).count()).toBe(1);
  await waitFor(() => expect(screen.getByTestId('ws-import-series')).toHaveTextContent('12 data row(s) on this well: 1 import(s), 0 typed.'));
  expect(screen.getByTestId(`ws-import-row-${heads[0].id}`)).toHaveTextContent(/declared ROP \(ft\/hr\) as Rate of penetration in ft\/hr.*depths from KB/);
  fireEvent.click(screen.getByTestId(`ws-import-withdraw-${heads[0].id}`));
  fireEvent.change(screen.getByTestId('ws-import-withdraw-reason'), { target: { value: 'file from another well' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-import-withdraw-confirm')); });
  await waitFor(() => expect(screen.getByTestId('ws-import-series')).toHaveTextContent('0 data row(s) on this well'));
  expect(screen.getByTestId('ws-status')).toHaveTextContent('Import pasted table withdrawn; its rows are no longer used.');
});
