/**
 * AppUpgrade PETRO-U2-004 (PETRO-U1-023, PL2): zonations the ways vendors
 * write them (e2e/fixtures/petro/hostile, generate.mjs). Every accepted file
 * must give the physical zones of the reference well (oil sand 1525 to
 * 1549.5 m MD, water sand 1575 to 1599.5 m MD); every refusal and skipped
 * row must say why.
 *
 * Negative controls (run 2026-09-29): with readHeader ignoring units in the
 * header, the Techlog file (ft) lands 3.28 times too deep; with the
 * delimiter fixed to a comma, the IP (tab) and Petrel (semicolon, comma
 * decimals) files refuse; with the TVDSS check removed, the TVDSS file
 * imports 30 m shallow without a word.
 */
import fs from 'fs';
import path from 'path';
import { parseZoneTable, readHeader } from '../services/zoneImport';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'petro', 'hostile');
const read = (name) => fs.readFileSync(path.join(HOSTILE, name), 'utf8');
const OIL = { top: 1525, base: 1549.5 };
const WATER = { top: 1575, base: 1599.5 };

const expectZone = (row, truth, tol = 0.005) => {
  expect(Math.abs(row.topMdM - truth.top)).toBeLessThan(tol);
  expect(Math.abs(row.baseMdM - truth.base)).toBeLessThan(tol);
};

test('headers: units and references read out of the words', () => {
  expect(readHeader('Top (ft)')).toMatchObject({ bare: 'top', unit: 'ft' });
  expect(readHeader('Bottom Depth [m]')).toMatchObject({ bare: 'bottom depth', unit: 'm' });
  expect(readHeader('TOP_FT')).toMatchObject({ unit: 'ft' });
  expect(readHeader('Top TVDSS (m)')).toMatchObject({ ref: 'TVDSS', unit: 'm' });
  expect(readHeader('﻿Zone Name')).toMatchObject({ bare: 'zone name' });
});

test('Techlog: comment line, base before top, feet in the headers, a unit column', () => {
  const r = parseZoneTable(read('zones_techlog_export_ft.csv'), { defaultUnit: 'm' });
  expect(r.refused).toBeNull();
  expect(r.unit).toBe('ft');
  expect(r.unitSource).toBe('the header');
  expect(r.rows.map((x) => x.name)).toEqual(['Oil sand', 'Water sand']);
  expectZone(r.rows[0], OIL);
  expectZone(r.rows[1], WATER);
  expect(r.skipped).toEqual([]);
});

test('IP: tab-delimited, BOM, CRLF, square-bracket units, a thickness column', () => {
  const r = parseZoneTable(read('zones_ip_tab_m.txt'), { defaultUnit: 'ft' });
  expect(r.delimiter).toBe('\t');
  expect(r.unit).toBe('m');
  expect(r.rows.map((x) => x.name)).toEqual(['Oil sand', 'Water sand']);
  expectZone(r.rows[0], OIL);
  expectZone(r.rows[1], WATER);
});

test('Petrel: semicolons, comma decimals, quoted name with a comma, two wells', () => {
  const r = parseZoneTable(read('zones_petrel_semicolon_multiwell.csv'), { well: { name: 'PETRO REF-1' } });
  expect(r.delimiter).toBe(';');
  expect(r.rows.map((x) => x.name)).toEqual(['Oil sand, upper', 'Water sand']);
  expectZone(r.rows[0], OIL);
  expectZone(r.rows[1], WATER);
  expect(r.skipped).toEqual([{ line: 3, reason: 'another well (OTHER-2)' }]);
});

test('TVDSS is refused with the reason, never converted silently', () => {
  const r = parseZoneTable(read('zones_tvdss_refused.csv'));
  expect(r.rows).toEqual([]);
  expect(r.refused).toMatch(/The depths are TVDSS\. Zones are stored as measured depth \(MD\)/);
});

test('messy paste: no header, repeats, text, inverted and negative rows each skipped with a reason', () => {
  const r = parseZoneTable(read('zones_messy_noheader.csv'), { defaultUnit: 'm', existingZones: [{ name: 'water SAND' }] });
  expect(r.notes).toContain('No header row: read as name, top, base.');
  expect(r.unitSource).toMatch(/session unit/);
  expect(r.rows.map((x) => x.name)).toEqual(['Oil sand']);
  expectZone(r.rows[0], OIL);
  const reasons = r.skipped.map((s) => `${s.line}: ${s.reason}`);
  expect(reasons).toEqual([
    '3: Oil sand: repeated in the file (first kept)',
    '4: Tight streak: top or base is not a number',
    '5: Inverted: base 1560 is not below top 1570',
    '6: Elevation: negative depth (not MD below KB)',
    '7: Water sand: a zone with this name already exists on the well',
  ]);
});

test('the user corrects the unit and the columns', () => {
  const text = 'Zone;A;B\nSand;5003,28;5083,66\n';
  const auto = parseZoneTable(text, { defaultUnit: 'm' });
  expect(auto.refused).toMatch(/Could not find a top column/);
  const fixed = parseZoneTable(text, { unit: 'ft', columns: { name: 0, top: 1, base: 2 } });
  expect(fixed.unitSource).toBe('your choice');
  expectZone(fixed.rows[0], OIL, 0.01);
});

test('overlaps and zones outside the log are named', () => {
  const r = parseZoneTable('Zone,Top,Base\nA,1500,1520\nB,1510,1530\nC,3000,3010\n', { logRange: [1500, 1600] });
  expect(r.notes.join(' ')).toMatch(/A and B overlap/);
  expect(r.notes.join(' ')).toMatch(/Outside the logged interval, kept but empty: C\./);
});

test('empty input', () => {
  expect(parseZoneTable('# only a comment\n\n').refused).toMatch(/no rows/);
});
