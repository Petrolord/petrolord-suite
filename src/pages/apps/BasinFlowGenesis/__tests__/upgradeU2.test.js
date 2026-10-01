/**
 * Basin & Charge Modeling upgrade U2 (docs/upgrade/BasinFlowGenesis-UPGRADE.md,
 * Step 2 build): the services behind each built item. Every test calls the
 * shipped code; the negative controls are recorded in the upgrade doc.
 */
import { SimulationEngine } from '../services/SimulationEngine';
import { burialChartRows, erodedSections, alignSeriesByAge, layerKey } from '../services/resultsView';
import { referenceBasinRow } from '../services/backend';

const ref = () => { const r = referenceBasinRow(); return { stratigraphy: r.stratigraphy, heatFlow: r.heat_flow, erosionEvents: r.erosion_events, settings: r.settings }; };

let refRun;
beforeAll(async () => { refRun = await SimulationEngine.run(ref()); }, 120000);

describe('U2-001 the eroded section on the burial history (BF-T1-E3)', () => {
  test('the reference basin draws its 600 m eroded section from 20 Ma until the 10 Ma event, on top of the column', () => {
    const er = erodedSections(refRun);
    expect(er).toHaveLength(1);
    expect(er[0]).toMatchObject({ depositAge: 20, erodeAge: 10 });
    expect(er[0].amountM).toBeCloseTo(600, 6);
    const rows = burialChartRows(refRun, (m) => m / 0.3048);
    const at = (age) => rows.find((r) => r.age === age);
    expect(at(15)[er[0].key][0]).toBe(0);
    expect(at(15)[er[0].key][1]).toBeCloseTo(600 / 0.3048, 6);
    expect(at(11)[er[0].key]).toBeDefined();
    expect(at(10)[er[0].key]).toBeUndefined();
    expect(at(25)[er[0].key]).toBeUndefined();
  });

  test('a result with no erosion, or saved before U2, draws without one', () => {
    const old = { ...refRun, meta: { ...refRun.meta, phantoms: undefined }, data: { ...refRun.data, phantoms: undefined } };
    expect(erodedSections(old)).toEqual([]);
    expect(burialChartRows(old).every((r) => !Object.keys(r).some((k) => k.startsWith('__eroded')))).toBe(true);
  });
});

describe('U2-012 plots keyed by layer id (BF-U1-018)', () => {
  test('two layers named alike are two series, labelled by name', async () => {
    const p = ref();
    p.stratigraphy = p.stratigraphy.map((l) => (l.lithology === 'shale' ? { ...l, name: 'Shale' } : l));
    const r = await SimulationEngine.run(p);
    const shales = r.meta.layers.filter((l) => l.name === 'Shale');
    expect(shales).toHaveLength(2);
    const rows = alignSeriesByAge(r.data.timeSteps, r.data.maturity, r.meta.layers);
    const last = rows[rows.length - 1];
    const [a, b] = shales.map((l) => last[layerKey(l)]);
    expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
    expect(a).not.toBeCloseTo(b, 3);
    expect(last.Shale).toBeUndefined();
    // a layer id like "__proto__" is a key like any other
    const weird = alignSeriesByAge([0], [[{ age: 0, value: 1 }]], [{ id: '__proto__', name: 'x' }]);
    expect(Object.keys(weird[0])).toContain('__proto__');
  });
});

describe('U2-004 Ro through the whole column', () => {
  test('calibration compares a point inside a thick layer with the Ro at its own depth', async () => {
    const { calibrationProfile, finalDepthProfile } = require('../services/resultsView');
    const { calibrationSummary } = require('../services/report');
    const col = calibrationProfile(refRun);
    const centres = finalDepthProfile(refRun);
    expect(col.length).toBeGreaterThan(centres.length * 5);
    // the Base Sand (1500 m) has its own profile: deep in it Ro is above the layer-centre value
    const base = refRun.data.column.filter((c) => c.layerId === 'base_sand');
    expect(base.length).toBe(15);
    const deep = base[base.length - 1];
    const centre = centres.find((c) => c.id === 'base_sand');
    expect(deep.ro).toBeGreaterThan(centre.ro + 0.05);
    // a measured point equal to the column value there has no misfit
    const cal = calibrationSummary(refRun, { ro: [{ depth: deep.depth, value: deep.ro }], temp: [{ depth: deep.depth, value: deep.temp }] });
    expect(cal.roRms).toBeLessThan(1e-9);
    expect(cal.tRms).toBeLessThan(1e-9);
    // a result saved before U2 has no column: the layer centres
    const old = { ...refRun, data: { ...refRun.data, column: undefined } };
    expect(calibrationProfile(old).length).toBe(centres.length);
    // control: the layer-centre comparison (before U2) misses the same point
    const oldCal = calibrationSummary(old, { ro: [{ depth: deep.depth, value: deep.ro }], temp: [] });
    expect(oldCal.roRms).toBeGreaterThan(0.05);
  });
});

describe('U2-006 BHT correction (BF-U1-028)', () => {
  const { correctedTemperatures, bhtMethodText } = require('../services/bht');
  const { parseCalibrationText } = require('../services/calibrationImport');
  test('Horner groups the runs at one depth: the ZetaWare example (10 h; 115 at 8 h, 120 at 12 h) gives 134.80', () => {
    const cal = { temp: [{ depth: 2500, value: 115, shutInH: 8 }, { depth: 2500.4, value: 120, shutInH: 12 }, { depth: 3100, value: 125, kind: 'DST' }, { depth: 1800, value: 70, shutInH: 6 }], bht: { method: 'horner', circulationH: 10 } };
    const { points, notes } = correctedTemperatures(cal);
    const h = points.find((p) => p.method === 'horner');
    expect(h.value).toBeCloseTo(134.80, 2);
    expect(h.raw).toBe(120);
    expect(points.find((p) => p.depth === 3100)).toMatchObject({ value: 125, method: 'none' });
    // one run at 1,800 m cannot be extrapolated: kept raw and said
    expect(points.find((p) => p.depth === 1800)).toMatchObject({ value: 70, method: 'none' });
    expect(notes.join(' ')).toMatch(/two or more runs/);
    expect(bhtMethodText(cal.bht)).toBe('Horner, circulation 10 h');
  });

  test('AAPG and Harrison correct each BHT by depth; none leaves them as measured', () => {
    const temp = [{ depth: 3048, value: 100 }, { depth: 2000, value: 80 }];
    const a = correctedTemperatures({ temp, bht: { method: 'aapg' } }).points;
    expect(a[1].value - 100).toBeCloseTo(31.768 * 5 / 9, 2);
    const h = correctedTemperatures({ temp, bht: { method: 'harrison' } }).points;
    expect(h[0].value - 80).toBeCloseTo(10.728, 3);
    expect(correctedTemperatures({ temp }).points.map((p) => p.value)).toEqual([100, 80]);
  });

  test('the calibration and the report use the corrected temperature', () => {
    const { calibrationSummary, reviewerLines } = require('../services/report');
    const deep = refRun.data.column[refRun.data.column.length - 1];
    // a BHT 10 C cool, recovered by Horner to the modelled value
    const tInf = deep.temp; const m = -20; const tc = 6;
    const temp = [4, 9, 16].map((ts) => ({ depth: deep.depth, value: tInf + m * Math.log((tc + ts) / ts), shutInH: ts }));
    const raw = calibrationSummary(refRun, { ro: [], temp });
    const cor = calibrationSummary(refRun, { ro: [], temp, bht: { method: 'horner', circulationH: tc } });
    expect(raw.tRms).toBeGreaterThan(5);
    expect(cor.tRms).toBeLessThan(1e-6);
    const lines = reviewerLines({ modelName: 'M', state: { ...ref(), calibration: { ro: [], temp, bht: { method: 'horner', circulationH: tc } } }, results: refRun, units: { depth: 'm', temp: 'C' } });
    expect(lines.join('\n')).toMatch(/BHT correction: Horner, circulation 6 h/);
  });

  test('a calibration file carries the shut-in hours and marks DST rows', () => {
    const r = parseCalibrationText('depth_m,BHT_C,shut-in (h),type\n2500,115,8,BHT\n2500,120,12,BHT\n3100,125,,DST\n');
    expect(r.temp).toEqual([{ depth: 2500, value: 115, shutInH: 8 }, { depth: 2500, value: 120, shutInH: 12 }, { depth: 3100, value: 125, kind: 'DST' }]);
    expect(r.columns.shutIn).toBe('shut-in (h)');
  });
});

describe('U2-018 the worked example', () => {
  test('Auto-Fit with Horner on recovers the heat flow the example was sampled from; raw BHTs land low', async () => {
    const { workedExampleModel, WORKED_EXAMPLE_TRUTH_HEAT_FLOW } = require('../data/WorkedExample');
    const { HeatFlowFitter } = require('../services/HeatFlowFitter');
    const { correctedTemperatures } = require('../services/bht');
    const m = workedExampleModel();
    const inputs = { stratigraphy: m.stratigraphy, heatFlow: m.heatFlow, erosionEvents: m.erosionEvents, settings: m.settings };
    const corrected = correctedTemperatures(m.calibration);
    expect(corrected.points.filter((p) => p.method === 'horner')).toHaveLength(2);
    const fit = await HeatFlowFitter.fit(inputs, m.calibration.ro, corrected.points);
    expect(Math.abs(fit.heatFlow.value - WORKED_EXAMPLE_TRUTH_HEAT_FLOW)).toBeLessThan(2);
    const raw = await HeatFlowFitter.fit(inputs, [], m.calibration.temp);
    expect(raw.heatFlow.value).toBeLessThan(WORKED_EXAMPLE_TRUTH_HEAT_FLOW - 3);
  }, 600000);
});

describe('U2-005 maximum-burial compaction in the app', () => {
  test('the mode is an input of the run: the uplifted source shale stays thinner, the key changes, the report says it', async () => {
    const { engineInputsKey } = require('../services/honesty');
    const { reviewerLines } = require('../services/report');
    const base = { ...ref(), erosionEvents: [{ age: 10, amount: 2500 }] };
    const irr = { ...base, settings: { ...base.settings, compaction: 'irreversible' } };
    expect(engineInputsKey(irr)).not.toBe(engineInputsKey(base));
    expect(engineInputsKey({ ...base, settings: { ...base.settings, compaction: 'elastic' } })).toBe(engineInputsKey(base));
    const a = await SimulationEngine.run(base);
    const b = await SimulationEngine.run(irr);
    expect(b.meta.compaction).toMatchObject({ mode: 'irreversible' });
    expect(b.meta.compaction.presentThicknessErrorM).toBeLessThan(1e-3);
    const li = a.meta.layers.findIndex((l) => l.id === 'source_shale');
    const at = (r, age) => r.data.burial[li].find((e) => e.age === age).thickness;
    // elastic: re-expands after the 10 Ma unroofing; maximum burial: keeps its 11 Ma thickness
    expect(at(a, 0) - at(a, 11)).toBeGreaterThan(20);
    expect(Math.abs(at(b, 0) - at(b, 11))).toBeLessThan(1e-6);
    expect(Math.abs(at(b, 0) - 400)).toBeLessThan(1e-3);
    const lines = reviewerLines({ modelName: 'M', state: irr, results: b, units: { depth: 'm', temp: 'C' } }).join('\n');
    expect(lines).toMatch(/maximum-burial compaction/);
    expect(lines).toMatch(/Compaction: maximum burial; the present thicknesses are reproduced to 0(\.\d+)? m/);
  }, 300000);
});
