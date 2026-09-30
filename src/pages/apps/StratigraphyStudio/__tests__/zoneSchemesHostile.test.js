/**
 * AppUpgrade STRAT-U1-006 / 007 (2026-09-30): biozone scheme import on the
 * hostile files in e2e/fixtures/strat/hostile.
 *
 * Negative controls on origin/main (4300f020a):
 *  - two rows naming one zone with different ages: the LAST silently won
 *    (NN11 dated 8.10 to 11.63 Ma from calibration B, no word)
 *  - a StrataBugs-style export (Zonation, Top Age, Base Age, Reference) was refused
 *  - ages in ka (top_ka, base_ka) were refused; semicolon files were refused
 *  - importing a second scheme replaced the first (mergeZoneSchemes did not exist)
 */
import fs from 'fs';
import path from 'path';
import { parseZoneSchemeCsv, fillBiozoneAges, mergeZoneSchemes } from '../services/zoneSchemes';

const FIX = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'strat', 'hostile');
const read = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');

test('two rows that disagree on a zone date nothing from it, and say so; an identical repeat is dropped quietly', () => {
  const { zones, problems } = parseZoneSchemeCsv(read('zone_scheme_duplicates.csv'));
  expect(zones.map((z) => z.zone)).toEqual(['NN12']);
  expect(problems.join(' ')).toMatch(/NN11 appears 2 times with different ages \(8\.29 to 11\.63 Ma, 8\.1 to 11\.63 Ma\); not imported/);
  const { rows, unmatched } = fillBiozoneAges([{ code: 'NN11', properties: { scheme: 'NN' } }], zones);
  expect(rows[0].properties.age_top_ma).toBeUndefined();
  expect(unmatched).toEqual(['NN NN11']);
});

test('vendor column names are read (Zonation, Top Age, Base Age, Reference)', () => {
  const { zones, problems } = parseZoneSchemeCsv(read('zone_scheme_stratabugs_headers.csv'));
  expect(problems).toEqual([]);
  expect(zones).toEqual([
    { scheme: 'P', zone: 'P9', top_ma: 1.2, base_ma: 2.4, source: 'Operator scheme v3 (sample)' },
    { scheme: 'P', zone: 'P8', top_ma: 2.4, base_ma: 3.1, source: 'Operator scheme v3 (sample)' },
  ]);
});

test('ages in ka are converted to Ma and the conversion is said', () => {
  const { zones, notes } = parseZoneSchemeCsv(read('zone_scheme_ka.csv'));
  expect(zones[0]).toMatchObject({ zone: 'MIS 5e', top_ma: 0.116, base_ma: 0.129 });
  expect(zones[1].base_ma).toBeCloseTo(0.191, 12);
  expect(notes.join(' ')).toMatch(/ages read in ka and converted to Ma/);
});

test('a semicolon file with comma decimals is read', () => {
  const { zones } = parseZoneSchemeCsv(read('zone_scheme_semicolon.csv'));
  expect(zones).toEqual([{ scheme: 'NN', zone: 'NN12', top_ma: 5.59, base_ma: 8.29, source: 'Kalibrierung (sample)' }]);
});

test('columns in any order; a row whose base is younger than its top is refused; overlapping zones in one scheme are noted', () => {
  const { zones, problems, notes } = parseZoneSchemeCsv(read('zone_scheme_odd_order.csv'));
  expect(zones.map((z) => z.zone)).toEqual(['NN11', 'NN13', 'NN12']);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/NN12b base \(5\.59 Ma\) must be older than its top \(8\.29 Ma\)/);
  expect(notes.join(' ')).not.toMatch(/overlap/);
  const o = parseZoneSchemeCsv('scheme,zone,top_ma,base_ma,source\nNN,NN12,5.59,8.29,s\nNN,NN11,8.0,11.63,s\n');
  expect(o.notes.join(' ')).toMatch(/NN: NN12 and NN11 overlap \(8 to 8\.29 Ma\)/);
});

test('importing a second scheme keeps the first; a scheme imported again is replaced and said', () => {
  const a = parseZoneSchemeCsv(read('zone_scheme_ok.csv')).zones;
  const b = parseZoneSchemeCsv(read('zone_scheme_stratabugs_headers.csv')).zones;
  const m1 = mergeZoneSchemes(a, b);
  expect(m1.zones.map((z) => `${z.scheme}:${z.zone}`)).toEqual(['NN:NN12', 'NN:NN11', 'P:P9', 'P:P8']);
  expect(m1.replaced).toEqual([]);
  const m2 = mergeZoneSchemes(m1.zones, [{ scheme: 'nn', zone: 'NN12', top_ma: 5.5, base_ma: 8.2, source: 'x' }]);
  expect(m2.zones.map((z) => `${z.scheme}:${z.zone}`)).toEqual(['P:P9', 'P:P8', 'nn:NN12']);
  expect(m2.replaced).toEqual([{ scheme: 'NN', before: 2 }]);
});
