// Registry interval strips in the shared track layout (Stratigraphy ST1):
// an `intervals:<kind>` strip resolves the well's interval rows onto its
// depth vector with the vocabulary colours, absent kinds draw nothing,
// the lithology quicklook template carries a registry lithology strip,
// and the layout editor's strip sources list every kind.

import { resolveTracks } from '../layout/resolveTracks';
import { buildDefaultTemplates, STRIP_SOURCES, migrateLayouts } from '../layout/layoutSchema';

const depth = Float64Array.from({ length: 21 }, (_, i) => 1500 + i * 0.5);   // 1500 .. 1510
const gr = Float32Array.from({ length: 21 }, (_, i) => 40 + i);
const intervals = [
  { id: 'a', well_id: 'w', kind: 'lithology', top_md_m: 1500, base_md_m: 1505, code: 'sandstone', label: null, properties: {} },
  { id: 'b', well_id: 'w', kind: 'lithology', top_md_m: 1505, base_md_m: 1510, code: 'shale', label: null, properties: {} },
  { id: 'c', well_id: 'w', kind: 'facies', top_md_m: 1502, base_md_m: 1508, code: 'Channel', label: null, properties: { colour: '#123456' } },
];

const template = (source) => ({
  id: 't', name: 't', tracks: [
    { id: 'gr', title: 'GR', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150, curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }] },
    { id: 'strip', title: 'Lith', type: 'strip', width: 0.45, source },
  ],
});
const ctx = (extra = {}) => ({ curves: { DEPT: depth, GR: gr }, logs: {}, outputs: {}, faciesData: null, facies: [], params: {}, intervals, depth, ...extra });

test('a lithology strip rasterizes the registry rows with vocabulary colours', () => {
  const tracks = resolveTracks(template('intervals:lithology'), ctx());
  expect(tracks.map((t) => t.key)).toEqual(['gr', 'strip']);
  const strip = tracks[1];
  expect(strip.type).toBe('strip');
  expect(strip.labels).toEqual(['Sandstone', 'Shale']);
  expect(strip.colors).toEqual(['#f4d03f', '#8fa08a']);
  const data = Array.from(strip.curves[0].data);
  expect(data.slice(0, 10).every((v) => v === 0)).toBe(true);    // 1500 .. 1504.5 sandstone
  expect(data.slice(10, 20).every((v) => v === 1)).toBe(true);   // 1505 .. 1509.5 shale
  expect(Number.isNaN(data[20])).toBe(true);                     // 1510 is the base, exclusive
});

test('a facies strip uses the row colour; an absent kind draws no track; no depth means no strip', () => {
  const facies = resolveTracks(template('intervals:facies'), ctx())[1];
  expect(facies.labels).toEqual(['Channel']);
  expect(facies.colors).toEqual(['#123456']);
  expect(resolveTracks(template('intervals:environment'), ctx()).map((t) => t.key)).toEqual(['gr']);
  expect(resolveTracks(template('intervals:lithology'), ctx({ depth: null })).map((t) => t.key)).toEqual(['gr']);
  expect(resolveTracks(template('intervals:lithology'), ctx({ intervals: undefined })).map((t) => t.key)).toEqual(['gr']);
});

test('the crossplot facies strip is unchanged', () => {
  const faciesData = Float64Array.from({ length: 21 }, (_, i) => (i < 5 ? 0 : 1));
  const t = resolveTracks(template('facies'), ctx({ faciesData, facies: [{ name: 'A', color: '#a' }, { name: 'B', color: '#b' }] }))[1];
  expect(t.labels).toEqual(['A', 'B']);
  expect(t.curves[0].data).toBe(faciesData);
});

test('the lithology quicklook template carries a registry lithology strip and reaches saved layouts', () => {
  const tpl = buildDefaultTemplates().find((t) => t.id === 'lithology-quicklook');
  const strip = tpl.tracks.find((t) => t.type === 'strip');
  expect(strip).toMatchObject({ source: 'intervals:lithology', title: 'Lithology' });
  const migrated = migrateLayouts({ version: 2, activeTemplateId: 'lithology-quicklook', templates: [{ id: 'lithology-quicklook', name: 'old', tracks: [] }] });
  expect(migrated.templates.find((t) => t.id === 'lithology-quicklook').tracks.some((t) => t.source === 'intervals:lithology')).toBe(true);
});

test('strip sources list the crossplot facies, the rule facies and every registry kind an editor offers', () => {
  expect(STRIP_SOURCES.map((s) => s.value)).toEqual([
    'facies', 'rulefacies', 'intervals:lithology', 'intervals:core_description', 'intervals:facies', 'intervals:electrofacies', 'intervals:environment', 'intervals:motif', 'intervals:systems_tract',
  ]);
});
