/**
 * AppUpgrade STRAT-U1-004 / 005 (2026-09-30): the interval-log paste door
 * (src/lib/wellImport.js buildIntervals, shared by the Well Data Manager
 * Intervals tab and the Stratigraphy Studio Intervals view) on the hostile
 * files in e2e/fixtures/strat/hostile.
 *
 * Negative controls on origin/main (4300f020a):
 *  - "Top TVDSS (m)" went in as MD (1410 m stored as MD 1410; the well is 30 m deeper)
 *  - "Top (ft)" never set the unit, so 4724.4 ft was stored as 4724.4 m
 *  - a StrataBugs export mapped "Top Age (Ma)" as the top DEPTH
 *  - comma decimals in a semicolon file were refused
 */
import fs from 'fs';
import path from 'path';
import { parseDelimited, guessMapping, buildIntervals, guessIntervalUnit, INTERVAL_FIELDS } from '../wellImport';

const FIX = path.join(__dirname, '..', '..', '..', 'e2e', 'fixtures', 'strat', 'hostile');
const read = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');
const door = (file, opts = {}) => {
  const parsed = parseDelimited(read(file));
  const map = guessMapping(parsed.header, INTERVAL_FIELDS);
  const mdUnit = opts.mdUnit || guessIntervalUnit(parsed.header, map) || 'm';
  return { parsed, map, mdUnit, run: () => buildIntervals(parsed.rows, map, { mdUnit, header: parsed.header, delimiter: parsed.delimiter }) };
};

test('a TVDSS interval file is refused with the reason (never stored as MD)', () => {
  const d = door('intervals_petrel_tvdss.csv');
  expect(d.run).toThrow(/"Top TVDSS \(m\)" is a TVDSS depth.*measured depth/);
});

test('a TWT interval file is refused with the reason', () => {
  expect(door('intervals_twt.csv').run).toThrow(/"Top TWT \(ms\)" is a time/);
});

test('"Top (ft)" in the header reads the depths in feet', () => {
  const d = door('intervals_feet_header.tsv');
  expect(d.mdUnit).toBe('ft');
  const rows = d.run();
  expect(rows[0].top_md_m).toBeCloseTo(4724.4 * 0.3048, 9);
  expect(rows[1].base_md_m).toBeCloseTo(5183.7 * 0.3048, 9);
  expect(rows[0].code).toBe('SST W/ SH STRINGERS');
});

test('a StrataBugs biozone export maps the depth columns, not the age columns, and reads feet', () => {
  const d = door('intervals_stratabugs_biozones_ft.csv');
  expect(d.parsed.header[d.map.top]).toBe('Top Depth (ft)');
  expect(d.parsed.header[d.map.base]).toBe('Base Depth (ft)');
  expect(d.parsed.header[d.map.code]).toBe('Zone');
  expect(d.mdUnit).toBe('ft');
  const rows = d.run();
  expect(rows.map((r) => r.code)).toEqual(['NN12', 'NN11']);
  expect(rows[0].top_md_m).toBeCloseTo(4921.3 * 0.3048, 9);
});

test('an age column mapped by hand as a depth is refused', () => {
  const parsed = parseDelimited(read('intervals_stratabugs_biozones_ft.csv'));
  const map = { ...guessMapping(parsed.header, INTERVAL_FIELDS), top: 2, base: 3 };
  expect(() => buildIntervals(parsed.rows, map, { header: parsed.header })).toThrow(/"Top Age \(Ma\)" holds ages/);
});

test('comma decimals in a semicolon file are read', () => {
  const rows = door('intervals_semicolon_comma.csv').run();
  expect(rows.map((r) => [r.top_md_m, r.base_md_m])).toEqual([[1440.5, 1460], [1460, 1500.25]]);
});
