// Column files for Basin & Charge Modeling (2026-10-14): ages, hiatuses,
// lithology, source rock and eroded thickness by surface name, for the
// Formation tops door (with depths) and the Registry well door (without).
import { parseColumnText, datedTops, layersFromColumn, applyColumnToLayers, erosionWithAmounts } from '../services/columnFile';
import { buildBasinModelRow } from '@/lib/basinHandoff';
import { ValidationEngine } from '../services/ValidationEngine';

// the kit's Ekene-1 tops file (metres in the header, ages, no lithology)
const KIT_TOPS = `top_name,md_m,tvd_m,tvdss_m,surface_type,age_ma,interpreter
Seabed,60.00,60.00,35.00,seabed,0.0,Demo Interpreter
Benin Formation,350.00,350.00,325.00,formation,2.6,Demo Interpreter
Agbada Formation,1150.00,1150.00,1125.00,formation,5.3,Demo Interpreter
Oboro Unconformity,1790.00,1790.00,1765.00,unconformity,16.4,Demo Interpreter
Oboro Sand,1845.00,1845.00,1820.00,sb,21.0,Demo Interpreter`;

// a column file in feet with a hiatus, eroded thickness, lithology, a source and a TD row
const COLUMN_FT = `surface,depth_ft,age_ma,hiatus_end_ma,surface_type,lithology,sand_pct,shale_pct,eroded_ft,toc,hi,kerogen
Seabed,0,0,,seabed,sandstone,,,,,,
Agbada Formation,1000,5.3,,formation,mixed,50,50,,,,
Oboro Unconformity,2000,16.4,20.5,unconformity,shale,,,492,,,
Akata Formation,3000,28,,formation,shale,,,,2.4,330,pc-B
TD,3500,30,,,,,,,,,`;

test('the kit tops file: metres from the header, ages read', () => {
  const c = parseColumnText(KIT_TOPS);
  expect(c.units.depth).toBe('m');
  expect(c.columns.depth).toBe('md_m');
  expect(c.columns.age).toBe('age_ma');
  expect(c.hasAge).toBe(true);
  expect(c.rows).toHaveLength(5);
  expect(c.rows[1]).toMatchObject({ name: 'Benin Formation', depth: 350, age: 2.6, type: 'formation' });
});

test('a column file in feet builds dated, typed layers with the base row and the erosion amount', () => {
  const c = parseColumnText(COLUMN_FT);
  expect(c.problems).toEqual([]);
  expect(c.units).toEqual({ depth: 'ft', eroded: 'ft' });
  expect(c.base).toEqual({ depth: 3500, age: 30 });
  const built = layersFromColumn(datedTops(c.rows, { fileUnit: 'ft' }), { baseDepthM: 3500 * 0.3048, baseAge: 30 });
  expect(built.layers.map((l) => l.name)).toEqual(['Seabed', 'Agbada Formation', 'Oboro Unconformity', 'Akata Formation']);
  expect(built.layers.every((l) => !l.agesGuessed)).toBe(true);
  // the layer under the unconformity stops at the older bound of the hiatus
  expect(built.layers[2]).toMatchObject({ ageStart: 28, ageEnd: 20.5 });
  expect(built.layers[3]).toMatchObject({ ageStart: 30, ageEnd: 28 });
  expect(built.layers[3].thickness).toBeCloseTo(500 * 0.3048, 9);
  const { layers, lithologies, sources } = applyColumnToLayers(built.layers, c.rows);
  expect(lithologies).toBe(4);
  expect(sources).toBe(1);
  expect(layers[1]).toMatchObject({ lithology: 'mixed', lithologyMix: { sandstone: 50, shale: 50, limestone: 0 } });
  expect(layers[3].sourceRock).toEqual({ isSource: true, toc: 2.4, hi: 330, kerogen: 'pc-B' });
  const ero = erosionWithAmounts(built.erosionEvents, c.rows, c.units.eroded);
  expect(ero).toHaveLength(1);
  expect(ero[0]).toMatchObject({ age: 16.4, to_ma: 20.5, amountUnknown: false });
  expect(ero[0].amount).toBeCloseTo(492 * 0.3048, 9);
});

test('control: without the age column the same tops are placeholders', () => {
  const noAges = KIT_TOPS.split('\n').map((l) => l.split(',').filter((_, i) => i !== 5).join(',')).join('\n');
  const c = parseColumnText(noAges);
  expect(c.hasAge).toBe(false);
  const built = layersFromColumn(datedTops(c.rows, { fileUnit: c.units.depth }), {});
  expect(built.layers.every((l) => l.agesGuessed)).toBe(true);
});

test('a column file dates a registry well by surface name; its TD row dates the last layer', () => {
  const col = parseColumnText(`surface,age_ma,hiatus_end_ma,lithology
Seabed,0,,sandstone
Benin Formation,2.6,,sandstone
Oboro Unconformity,16.4,20.5,shale
Akata Formation,28,,shale
TD,30,,`);
  const well = { id: 'w1', name: 'Ekene-1', td_md_m: 2250, tops: [
    { id: 'a', name: 'Seabed', md_m: 60 }, { id: 'b', name: 'Benin Formation', md_m: 350 },
    { id: 'c', name: 'Oboro Unconformity', md_m: 1790 }, { id: 'd', name: 'Akata Formation', md_m: 2080 }] };
  const merged = datedTops(col.rows, { withDepths: well.tops });
  expect(merged[2]).toMatchObject({ md_m: 1790, age_ma: 16.4, hiatus_to_ma: 20.5 });
  const b = buildBasinModelRow({ well, tops: [...merged, { id: '__base__', name: '__base__', md_m: 2250, age_ma: col.base.age }], userId: null });
  const layers = b.row.stratigraphy.filter((l) => l.name !== '__base__');
  expect(layers).toHaveLength(4);
  expect(layers.every((l) => !l.agesGuessed)).toBe(true);
  expect(layers[3]).toMatchObject({ name: 'Akata Formation', ageStart: 30, ageEnd: 28, thickness: 170 });
  // the model keeps the KB depth of its surface for the calibration datum
  expect(layers[0].provenance.top_tvd_m).toBe(60);
  expect(b.row.erosion_events).toHaveLength(1);
});

test('a hiatus is named as one, and an erosion event with a thickness in it silences the note', () => {
  const layers = [
    { name: 'Above', thickness: 100, lithology: 'shale', ageStart: 16.4, ageEnd: 15.4 },
    { name: 'Below', thickness: 100, lithology: 'shale', ageStart: 21, ageEnd: 20.5 },
  ];
  const w = ValidationEngine.validateStratigraphy(layers).warnings;
  expect(w).toHaveLength(1);
  expect(w[0]).toMatch(/^Hiatus of 4.1 Ma between 'Below' and 'Above' \(16.4 to 20.5 Ma\)/);
  expect(ValidationEngine.validateStratigraphy(layers, [{ age: 16.4, amount: 150 }]).warnings).toEqual([]);
  expect(ValidationEngine.validateStratigraphy(layers, [{ age: 16.4, amount: 0 }]).warnings).toHaveLength(1);
});

test('bad cells are reported with their row, never silently dropped', () => {
  const c = parseColumnText(`name,depth_m,age_ma,lithology,hiatus_end_ma
A,0,x,granite,
B,100,5,shale,4`);
  expect(c.problems).toEqual([
    'Row 2: age "x" is not an age in Ma.',
    'Row 2: lithology "granite" is not one of sandstone, shale, limestone, salt, coal or mixed.',
    "Row 3: B's hiatus ends at 4 Ma, which is not older than its age 5 Ma; the hiatus is ignored.",
  ]);
});
