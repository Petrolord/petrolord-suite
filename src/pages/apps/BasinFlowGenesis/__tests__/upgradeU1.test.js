/**
 * Basin & Charge Modeling upgrade U1 (docs/upgrade/BasinFlowGenesis-UPGRADE.md):
 * the services and doors behind the practitioner-lens findings. Every test
 * calls the shipped code (engine, parsers, handoff, honesty); each finding's
 * negative control is recorded in the upgrade doc (these tests run against
 * the files on origin/main fail).
 */
import { SimulationEngine } from '../services/SimulationEngine';
import { finalDepthProfile } from '../services/resultsView';
import { BatchEngine } from '../services/BatchEngine';
import { ValidationEngine } from '../services/ValidationEngine';
import { parseCalibrationText, headerUnit } from '../services/calibrationImport';
import { staleOverrides, withLibraryProperties, modelNotes, engineInputsKey, chartAgeFlags, calibrationCoverage, fitAtBound } from '../services/honesty';
import { referenceBasinRow, REGISTRY_WELLS_DEV, REGISTRY_INTERVALS_DEV } from '../services/backend';
import { buildBasinModelRow, pointLiteral, mergeBasinUpdate } from '@/lib/basinHandoff';
import { TIMESCALE_V2023, TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';

const L = (id, a0, a1, h, lith = 'shale', src = false) => ({
  id, name: id, ageStart: a0, ageEnd: a1, thickness: h, lithology: lith,
  sourceRock: src ? { isSource: true, toc: 4, hi: 500, kerogen: 'type2' } : { isSource: false },
});
const ref = () => { const r = referenceBasinRow(); return { stratigraphy: r.stratigraphy, heatFlow: r.heat_flow, erosionEvents: r.erosion_events, settings: r.settings }; };

describe('BF-U1-001 (S1): an ICS column with a fractional basal age ends at present day', () => {
  const strat = [L('Holocene', 0.0117, 0, 50), L('Pliocene', 5.333, 0.0117, 800), L('Miocene', 23.03, 5.333, 1500, 'sandstone'), L('Source', 66.0, 23.03, 300, 'shale', true), L('Base', 145.5, 66, 1000, 'sandstone')];
  test('the Holocene is deposited, every layer has a sample at 0 Ma, and the column matches the whole-age twin', async () => {
    const r = await SimulationEngine.run({ stratigraphy: strat, heatFlow: { type: 'constant', value: 60 }, settings: { surfaceTemp: 15 } });
    expect(r.data.timeSteps[r.data.timeSteps.length - 1]).toBe(0);
    const prof = finalDepthProfile(r);
    expect(prof.map((p) => p.name)).toEqual(['Holocene', 'Pliocene', 'Miocene', 'Source', 'Base']);
    r.data.burial.forEach((b) => expect(b[b.length - 1].age).toBe(0));
    // present-day tops are the input column (cumulative thickness)
    expect(prof.find((p) => p.name === 'Base').top).toBeCloseTo(2650, 6);
    // the twin with a whole basal age: half a million years less heating changes Ro little
    const twin = await SimulationEngine.run({ stratigraphy: strat.map((l) => (l.id === 'Base' ? { ...l, ageStart: 146 } : l)), heatFlow: { type: 'constant', value: 60 }, settings: { surfaceTemp: 15 } });
    const a = finalDepthProfile(r).find((p) => p.name === 'Base'); const b = finalDepthProfile(twin).find((p) => p.name === 'Base');
    expect(a.top).toBeCloseTo(b.top, 6);
    expect(Math.abs(a.ro - b.ro)).toBeLessThan(0.01);
  });
});

describe('BF-U1-008 (S2): a batch run equals the single run (erosion and surface temperature)', () => {
  test('the reference basin through BatchEngine gives the single-run maximum Ro', async () => {
    const single = await SimulationEngine.run(ref());
    const [res] = await BatchEngine.runBatch([{ id: 'w', name: 'Ref', ...ref() }]);
    expect(res.status).toBe('success');
    const maxRo = Math.max(...single.data.maturity.flat().map((m) => m.value));
    expect(res.maxRo).toBeCloseTo(maxRo, 12);
  });
});

describe('BF-U1-010 (S2): hostile calibration files', () => {
  test('a TVD or TOC column is not read as temperature', () => {
    const r = parseCalibrationText('MD,TVD,TOC,Ro\n2000,1900,2.1,0.6\n3000,2800,1.5,0.9\n');
    expect(r.columns.depth).toBe('TVD');
    expect(r.columns.temp).toBeNull();
    expect(r.temp).toEqual([]);
    expect(r.ro.map((p) => p.depth)).toEqual([1900, 2800]);
    expect(r.problems.join(' ')).toMatch(/MD column is not used/);
  });
  test('units in the header are read: degF and feet', () => {
    const r = parseCalibrationText('Depth (ft); BHT (degF)\n6562; 212\n9843; 302\n');
    expect(r.units).toEqual({ depth: 'ft', temp: 'F' });
    expect(r.temp.map((p) => p.value)).toEqual([212, 302]);
    expect(headerUnit('Temp_C', 'temp')).toBe('C');
    expect(headerUnit('TF', 'temp')).toBe('F');
    expect(headerUnit('Depth_m', 'depth')).toBe('m');
    expect(headerUnit('Depth', 'depth')).toBeNull();
  });
  test('negative depths (elevations) are refused row by row', () => {
    const r = parseCalibrationText('depth,ro\n-1500,0.5\n2000,0.7\n');
    expect(r.ro).toHaveLength(1);
    expect(r.problems.join(' ')).toMatch(/negative/);
  });
});

describe('BF-U1-011 (S2): a layer saved by an earlier release with another lithology\'s values', () => {
  // the live bf_wells row shape: a "shale" with the sandstone preset written out
  const live = { id: 'x', name: 'Layer 2', lithology: 'shale', ageStart: 10, ageEnd: 0, thickness: 1000, thermal: { conductivity: 3.5, radiogenic: 1.2e-6, heatCapacity: 900 }, compaction: { model: 'exponential', phi0: 0.49, c: 0.00027 } };
  test('is named, with the values it carries, and changes the answer until reset', async () => {
    expect(staleOverrides(live)).toEqual({ from: 'sandstone', fields: ['conductivity', 'radiogenic', 'heatCapacity', 'phi0', 'c'] });
    const notes = modelNotes({ stratigraphy: [live], erosionEvents: [] });
    expect(notes.find((n) => n.key === 'stale-x').text).toMatch(/Layer 2 is shale but carries sandstone values/);
    const fixed = withLibraryProperties(live);
    expect(staleOverrides(fixed)).toBeNull();
    const a = finalDepthProfile(await SimulationEngine.run({ stratigraphy: [live], heatFlow: { type: 'constant', value: 60 } }))[0];
    const b = finalDepthProfile(await SimulationEngine.run({ stratigraphy: [fixed], heatFlow: { type: 'constant', value: 60 } }))[0];
    expect(Math.abs(a.temp - b.temp)).toBeGreaterThan(5); // shale conducts less: hotter
  });
  test('a typed custom value is not called stale', () => {
    expect(staleOverrides({ ...live, thermal: { conductivity: 2.1 }, compaction: {} })).toBeNull();
  });
});

describe('BF-U1-012/014: model notes and the input key', () => {
  test('the key changes with every engine input and not with the report fields', () => {
    const s = ref();
    const k = engineInputsKey(s);
    expect(engineInputsKey({ ...s, settings: { ...s.settings, report: { field: 'Keta' } } })).toBe(k);
    expect(engineInputsKey({ ...s, erosionEvents: [{ age: 10, amount: 700 }] })).not.toBe(k);
    expect(engineInputsKey({ ...s, settings: { surfaceTemp: 16 } })).not.toBe(k);
    expect(engineInputsKey({ ...s, stratigraphy: s.stratigraphy.map((l, i) => (i === 2 ? { ...l, sourceRock: { ...l.sourceRock, toc: 5 } } : l)) })).not.toBe(k);
  });
  test('an erosion event with no amount (from Stratigraphy) is said to be skipped, as are shared deposition intervals', () => {
    const notes = modelNotes({ stratigraphy: [L('A', 10, 0, 1000), L('B', 10, 0, 1000)], erosionEvents: [{ age: 23.03, amount: 0, surface: 'Top Oligocene', amountUnknown: true }] });
    expect(notes.map((n) => n.key)).toEqual(expect.arrayContaining(['erosion-unknown', 'same-10|0']));
    expect(notes.find((n) => n.key === 'erosion-unknown').text).toMatch(/Top Oligocene, 23.03 Ma/);
  });
});

describe('BF-U1-013: calibration coverage and the fit bound', () => {
  test('points outside the layer centres are named; a fit on the bound is caught', () => {
    expect(calibrationCoverage([{ depth: 100 }, { depth: 1500 }, { depth: 5000 }], [800, 2000, 3500]).outside.map((p) => p.depth)).toEqual([100, 5000]);
    expect(fitAtBound(150, [30, 150])).toBe('high');
    expect(fitAtBound(30.5, [30, 150])).toBe('low');
    expect(fitAtBound(72, [30, 150])).toBeNull();
  });
});

describe('BF-U1-017: a cleared box does not run the engine to NaN', () => {
  test('NaN thickness or ages are errors', () => {
    const v = ValidationEngine.validateStratigraphy([{ name: 'A', thickness: NaN, ageStart: 10, ageEnd: 0 }, { name: 'B', thickness: 100, ageStart: NaN, ageEnd: 0 }]);
    expect(v.isValid).toBe(false);
    expect(v.errors.join(' ')).toMatch(/A'.*positive number/);
    expect(v.errors.join(' ')).toMatch(/B'.*must be numbers/);
  });
});

describe('BF-U1-004/005/009/015: the Stratigraphy door', () => {
  const well = REGISTRY_WELLS_DEV.find((w) => w.name === 'KETA-2');
  const intervals = REGISTRY_INTERVALS_DEV[well.id];
  test('004: location_coords is a Postgres point literal (an {x, y} object is refused by bf_wells)', () => {
    expect(pointLiteral(512000.5, 9876543)).toBe('(512000.5,9876543)');
    expect(pointLiteral(NaN, 1)).toBeNull();
    const { row } = buildBasinModelRow({ well: { ...well, surface_x: 1, surface_y: 2 }, tops: well.tops, intervals, userId: 'u' });
    expect(row.location_coords).toBe('(1,2)');
  });
  test('009: the registry build is vertical, dated and typed from the log (KETA-2, deviated below 1,000 m)', () => {
    const { row, datedCount, erosionCount } = buildBasinModelRow({ well, tops: well.tops, intervals, userId: null });
    const s = row.stratigraphy;
    expect(s.map((l) => l.name)).toEqual(['Top Miocene', 'Top Oligocene Shale', 'Top Eocene Sand', 'Top Paleocene Source', 'Top Cretaceous']);
    expect(datedCount).toBe(4);
    expect(erosionCount).toBe(1);
    expect(s[1]).toMatchObject({ ageStart: 33.9, ageEnd: 28.1, lithology: 'shale' });
    expect(s[2].lithology).toBe('sandstone');
    // below the kick-off the vertical thickness is less than the 800 m MD interval
    expect(s[2].thickness).toBeLessThan(800);
    expect(s[0].thickness).toBeCloseTo(800, 6);
  });
  test('015: each dated layer carries the chart of its ages; a 2023/09 age the new chart moved is flagged', () => {
    const tops = [{ id: 'a', name: 'Top K', md_m: 1000, age_ma: 66 }, { id: 'b', name: 'Top J', md_m: 2000, age_ma: 145.0 }, { id: 'c', name: 'Top Tr', md_m: 3000, age_ma: 201.4 }];
    const stamps = { tops: { a: { age_ma: TIMESCALE_VERSION } } }; // b, c entered before stamps: 2023/09
    const { row } = buildBasinModelRow({ well: { id: 'w', name: 'W', td_md_m: 3500 }, tops, userId: null, ageCharts: stamps });
    const k = row.stratigraphy[0];
    expect(k.provenance.age_charts.ageEnd).toMatchObject({ top: 'Top K', chart: TIMESCALE_VERSION });
    expect(k.provenance.age_charts.ageStart).toMatchObject({ top: 'Top J', value: 145, chart: TIMESCALE_V2023 });
    expect(row.settings.timescale).toBe(TIMESCALE_VERSION);
    const flags = chartAgeFlags({ stratigraphy: row.stratigraphy, settings: row.settings });
    expect(flags.some((f) => /Top J/.test(f.message) && /143\.1/.test(f.message))).toBe(true);
  });
  test('015: a model sent before chart versions travelled says so once', () => {
    const flags = chartAgeFlags({ stratigraphy: [{ name: 'A', provenance: { registry_well_id: 'w' } }], settings: { fromStratigraphyStudio: '2026-09-30' } });
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toMatch(/before chart versions travelled/);
  });
  test('005: a re-send keeps the source rock, the layer properties and typed erosion amounts set in Basin', () => {
    const { row } = buildBasinModelRow({ well, tops: well.tops, intervals, userId: null });
    const existing = {
      stratigraphy: row.stratigraphy.map((l) => (l.name === 'Top Paleocene Source'
        ? { ...l, sourceRock: { isSource: true, toc: 3.5, hi: 450, kerogen: 'type2' }, thermal: { conductivity: 1.6, radiogenic: 2e-6, heatCapacity: 1100 }, color: '#123456' } : l)),
      erosion_events: row.erosion_events.map((e) => ({ ...e, amount: 350, amountUnknown: false })).concat([{ age: 5, amount: 200 }]),
    };
    const merged = mergeBasinUpdate(existing, row);
    const src = merged.stratigraphy.find((l) => l.name === 'Top Paleocene Source');
    expect(src.sourceRock).toEqual({ isSource: true, toc: 3.5, hi: 450, kerogen: 'type2' });
    expect(src.thermal.conductivity).toBe(1.6);
    expect(src.color).toBe('#123456');
    expect(merged.erosion_events.find((e) => e.surface === 'Top Oligocene Shale').amount).toBe(350);
    expect(merged.erosion_events.find((e) => e.age === 5).amount).toBe(200);
    expect(merged.kept).toEqual({ sources: 1, properties: 1, erosion: 2 });
  });
});
