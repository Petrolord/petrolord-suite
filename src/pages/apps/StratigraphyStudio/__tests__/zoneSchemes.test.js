import { parseZoneSchemeCsv, fillBiozoneAges } from '../services/zoneSchemes';

const CSV = `scheme,zone,top_ma,base_ma,source
TEST,Z1,1.0,2.0,"Test chart, 2026"
TEST,Z2,2.0,3.5,Test chart 2026
TEST,BAD,5,4,Test chart 2026
TEST,NOSRC,6,7,`;

test('parses a scheme and names every rejected row', () => {
  const { zones, problems } = parseZoneSchemeCsv(CSV);
  expect(zones.map((z) => z.zone)).toEqual(['Z1', 'Z2']);
  expect(zones[0].source).toBe('Test chart, 2026');
  expect(problems).toHaveLength(2);
  expect(problems[0]).toMatch(/Row 4: BAD base \(4 Ma\) must be older than its top \(5 Ma\)/);
  expect(problems[1]).toMatch(/Row 5: NOSRC needs a source/);
  expect(() => parseZoneSchemeCsv('zone,top_ma\nZ1,1')).toThrow(/needs a "scheme" column/);
});

test('dates matching intervals, keeps dated ones, lists the unmatched', () => {
  const { zones } = parseZoneSchemeCsv(CSV);
  const ivs = [
    { id: 'a', kind: 'biozone_interval', code: 'z1', properties: { scheme: 'test' } },
    { id: 'b', kind: 'biozone_interval', code: 'Z2', properties: { scheme: 'TEST', age_top_ma: 9, age_base_ma: 10 } },
    { id: 'c', kind: 'biozone_interval', code: 'Z9', properties: { scheme: 'TEST' } },
  ];
  const r = fillBiozoneAges(ivs, zones);
  expect(r.filled).toBe(1);
  expect(r.rows[0].properties).toMatchObject({ age_top_ma: 1, age_base_ma: 2, age_source: 'Test chart, 2026' });
  expect(r.rows[1].properties.age_top_ma).toBe(9);
  expect(r.unmatched).toEqual(['TEST Z9']);
  expect(fillBiozoneAges(ivs, zones, { overwrite: true }).rows[1].properties.age_top_ma).toBe(2);
});
