/**
 * Wave D8, production engineering (episodes 21 to 25), through the
 * applications' OWN importers, context builders and engines.
 *
 * The generator (tools/demo-dataset/domains/production.mjs) asserts its
 * numbers as it writes them. This reads the written kit back the way each
 * studio would: the Surveillance and Allocation CSV parsers, the Well Test
 * Analysis gauge importer and data pipeline, the Nodal Analysis Studio's
 * input builders and the ESP Design Studio's form. Each block carries a
 * negative control that moves the answer outside its tolerance, so the gate
 * can tell a right file from a wrong one. Run the generator first:
 *
 *   npx tsx tools/demo-dataset/generate.mjs && npx jest tools/demo-dataset
 */
import fs from 'fs';
import path from 'path';

import {
  parseDailyProductionCSV, parseWellTestCSV, parseFieldTotalsCSV,
} from '../../../src/utils/production/csvImport';
import { buildWellSeries, seriesCadenceDays } from '../../../src/utils/production/surveillance';
import * as allocationDoor from '../../../src/utils/production/allocation';
import { parseGaugeCsv } from '../../../src/components/welltest/DataPanel';
import {
  buildReservoirInputs, buildTestConfig, prepareTestData, DEFAULT_RESERVOIR, DEFAULT_TEST_CONFIG,
} from '../../../src/contexts/WellTestStudioContext';
import { hornerAnalysis } from '../../../src/utils/welltest/analysis';
import {
  buildFluid, buildWell, buildInflow, buildVlpOpts,
  DEFAULT_FLUID, DEFAULT_INFLOW, DEFAULT_WELL, DEFAULT_COMPLETION,
} from '../../../src/contexts/NodalAnalysisStudioContext';
import { solveOperatingPoint } from '../../../src/utils/nodal/system';
import { CORRELATIONS } from '../../../src/utils/nodal/correlations/index';
import { defaultInputs as espDefaults, designFormFrom, buildWellModel } from '../../../src/contexts/EspDesignContext';
import { runEspDesign } from '../../../src/utils/production/esp';
import { REFERENCE_STAGES, MOTOR_FRAMES } from '../../../src/utils/production/engine/espCatalog';
import { DESIGN, PRODUCERS, INJECTORS } from '../domains/production/engineering.mjs';
import { FACILITY_DESIGN } from '../d8spine.mjs';

const ROOT = path.join(__dirname, '..', '..', '..');
const KIT = path.join(ROOT, 'dist-demo', 'ekene-demo-v1');
const read = (rel) => {
  const p = path.join(KIT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`${rel} is missing: run npx tsx tools/demo-dataset/generate.mjs first.`);
  }
  return fs.readFileSync(p, 'utf8');
};
const F = '11-production-engineering';
const WF = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'engines', 'test-data', 'ekene-dynamic', 'waterflood.json'), 'utf8'));
const daysIn = (iso) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const episode = (n) => {
  const dir = path.join(KIT, 'episodes');
  const f = fs.readdirSync(dir).find((x) => x.startsWith(`episode-${n}-`));
  if (!f) throw new Error(`episode ${n} note is missing: run the generator first.`);
  return fs.readFileSync(path.join(dir, f), 'utf8');
};

/** section,field,value,unit,source -> Map('section|field' -> value) */
const readSheet = (rel) => {
  const rows = read(rel).trim().split('\n').slice(1).map((line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  });
  const map = new Map(rows.map(([s, f, v]) => [`${s}|${f}`, v]));
  map.rows = rows;
  return map;
};
const get = (sheet, key) => {
  if (!sheet.has(key)) throw new Error(`input sheet has no row ${key}`);
  return sheet.get(key);
};
/** Every section and field label on a sheet must be text the app shows. */
const labelsAppearIn = (sheet, files) => {
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const missing = [];
  for (const [section, field] of sheet.rows) {
    if (!src.includes(section)) missing.push(`section "${section}"`);
    if (!src.includes(field)) missing.push(`field "${field}"`);
  }
  return missing;
};

const ledgerParsed = parseDailyProductionCSV(read(`${F}/ekene-daily-production.csv`));
const testsParsed = parseWellTestCSV(read(`${F}/ekene-well-tests.csv`));
const totalsParsed = parseFieldTotalsCSV(read(`${F}/ekene-field-totals.csv`));

// The po_* shapes the studios hold after import (well types as the note sets them).
const WELLS = [...PRODUCERS, ...INJECTORS].map((name) => ({
  id: name, name, well_type: INJECTORS.includes(name) ? 'injector' : 'producer',
}));
const LEDGER = ledgerParsed.rows.map((r) => ({
  ...r, well_id: r.well, prod_date: r.date, well: WELLS.find((w) => w.id === r.well),
}));
const TESTS = testsParsed.tests.map((t, i) => ({ ...t, id: `t${i}`, well_id: t.well, test_date: t.date, well: { name: t.well } }));
const TOTALS = totalsParsed.rows.map((t) => ({ ...t, total_date: t.date }));
const MF = DESIGN.meter_factor;

describe('Episode 21: Production Surveillance Studio imports', () => {
  test('the ledger: every column claimed by the field it is meant for, nothing dropped', () => {
    const { report } = ledgerParsed;
    expect(report.colMap).toEqual({
      date: 'date', well: 'well', hours_on: 'hours_on', winj_stb: 'winj_stb',
      oil_stb: 'oil_stb', water_stb: 'water_stb', gas_mscf: 'gas_mscf',
    });
    expect(Object.values(report.unitScales).every((s) => s === 1)).toBe(true);
    expect(report.skipped).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(report.imported).toBe(345);
    expect(new Set(ledgerParsed.rows.map((r) => r.well)).size).toBe(6);
  });

  test('negative control: the 08-production file loses its injection column in this importer', () => {
    const { report } = parseDailyProductionCSV(read('08-production/ekene-production-monthly.csv'));
    expect(report.colMap.winj_stb).toBeUndefined();
    expect(Object.values(report.colMap)).not.toContain('injection_rate_bwpd');
  });

  test('rate times days in the month reproduces the VRR ledger, every flood month', () => {
    const vrr = read('08-production/ekene-vrr-ledger.csv').trim().split('\n').slice(1).map((l) => l.split(','));
    expect(vrr).toHaveLength(36);
    for (const [month, np, wp, gp, wi] of vrr) {
      const rows = ledgerParsed.rows.filter((r) => r.date === `${month}-01`);
      const d = daysIn(`${month}-01`);
      const sum = (k) => rows.reduce((a, r) => a + r[k], 0) * d;
      expect(Math.abs(sum('oil_stb') - Number(np))).toBeLessThan(0.01);
      expect(Math.abs(sum('water_stb') - Number(wp))).toBeLessThan(0.01);
      expect(Math.abs(sum('gas_mscf') - Number(gp))).toBeLessThan(0.01);
      expect(Math.abs(sum('winj_stb') - Number(wi))).toBeLessThan(0.01);
    }
  });

  test('the studio reads it as a monthly ledger', () => {
    const series = buildWellSeries(LEDGER);
    expect(series).toHaveLength(6);
    for (const s of series) expect(seriesCadenceDays(s.points)).toBeGreaterThanOrEqual(28);
  });

  test('the well tests: every column claimed, 144 tests, each within 0.005 of its month\'s ledger rate', () => {
    const { report, tests } = testsParsed;
    expect(report.colMap).toEqual({
      date: 'test_date', well: 'well', duration_hours: 'duration_hours', thp_psia: 'thp_psia',
      choke_64ths: 'choke_64ths', oil_rate_stbd: 'oil_rate_stbd', water_rate_stbd: 'water_rate_stbd',
      gas_rate_mscfd: 'gas_rate_mscfd',
    });
    expect(report.skipped).toHaveLength(0);
    expect(tests).toHaveLength(144);
    for (const t of tests) {
      const led = ledgerParsed.rows.find((r) => r.well === t.well && r.date === t.date);
      expect(Math.abs(t.oil_rate_stbd - led.oil_stb)).toBeLessThanOrEqual(0.005 + 1e-9);
      expect(Math.abs(t.water_rate_stbd - led.water_stb)).toBeLessThanOrEqual(0.005 + 1e-9);
      expect(Math.abs(t.gas_rate_mscfd - led.gas_mscf)).toBeLessThanOrEqual(0.005 + 1e-9);
      // a flowing well's tubing head pressure clears the separator
      expect(t.thp_psia).toBeGreaterThan(FACILITY_DESIGN.separator_pressure_psig + 14.7);
      expect(t.choke_64ths).toBeGreaterThan(0);
    }
  });

  test('every test passes the Allocation Studio QC', () => {
    expect(allocationDoor.validateWellTests(TESTS, buildWellSeries(LEDGER))).toHaveLength(0);
  });
});

describe('Episode 22: Production Allocation Studio returns the meter factors', () => {
  test('field totals parse with every column claimed', () => {
    expect(totalsParsed.report.colMap).toEqual({ date: 'date', oil_stb: 'oil_stb', water_stb: 'water_stb', gas_mscf: 'gas_mscf' });
    expect(totalsParsed.rows).toHaveLength(36);
  });

  const alloc = allocationDoor.computeAllocation({ wells: WELLS, tests: TESTS, ledger: LEDGER, totals: TOTALS });

  test(`oil ${MF.oil}, water ${MF.water}, gas ${MF.gas} on every date, and allocation closes on the meters`, () => {
    expect(alloc.diagnostics).toHaveLength(0);
    expect(alloc.days).toHaveLength(36);
    for (const d of alloc.days) {
      expect(Math.abs(d.factors.oil - MF.oil)).toBeLessThan(0.001);
      expect(Math.abs(d.factors.gas - MF.gas)).toBeLessThan(0.001);
      if (d.factors.water != null) {
        // the tests read water to 0.01 bbl/d; early water is a few hundredths
        const bound = (MF.water * PRODUCERS.length * 0.005) / d.theoretical.water + 1e-4;
        expect(Math.abs(d.factors.water - MF.water)).toBeLessThan(bound);
      }
      expect(d.allocated.oil).toBeCloseTo(d.measured.oil, 6);
    }
    const t = alloc.totals;
    expect(t.measured.oil / t.theoretical.oil).toBeCloseTo(MF.oil, 3);
    expect(t.measured.water / t.theoretical.water).toBeCloseTo(MF.water, 3);
    expect(t.measured.gas / t.theoretical.gas).toBeCloseTo(MF.gas, 3);
    const note = episode(22);
    expect(note).toContain(`oil ${MF.oil.toFixed(3)} and gas ${MF.gas.toFixed(3)} on every one of the 36 dates, water ${(t.measured.water / t.theoretical.water).toFixed(3)} over the period`);
  });

  test('left as imported (injectors typed producer) the factors hold and the injectors are named', () => {
    const raw = allocationDoor.computeAllocation({
      wells: WELLS.map((w) => ({ ...w, well_type: 'producer' })), tests: TESTS, ledger: LEDGER, totals: TOTALS,
    });
    raw.days.forEach((d, i) => expect(d.factors.oil).toBeCloseTo(alloc.days[i].factors.oil, 12));
    expect([...new Set(raw.diagnostics.map((d) => `${d.code} ${d.wellName}`))].sort())
      .toEqual(INJECTORS.map((w) => `no_test_in_force ${w}`));
  });

  test('negative control: stale tests (each a month late) move the oil factor out of tolerance', () => {
    const shifted = TESTS.map((t) => {
      const [y, m] = t.test_date.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      return { ...t, test_date: next };
    });
    const bad = allocationDoor.computeAllocation({ wells: WELLS, tests: shifted, ledger: LEDGER, totals: TOTALS });
    const worst = Math.max(...bad.days.filter((d) => d.factors.oil != null).map((d) => Math.abs(d.factors.oil - MF.oil)));
    expect(worst).toBeGreaterThan(0.001);
  });

  test('negative control: totals equal to the well sum read a factor of 1, which the gate refuses', () => {
    const unity = TOTALS.map((t) => ({ ...t, oil_stb: t.oil_stb / MF.oil }));
    const bad = allocationDoor.computeAllocation({ wells: WELLS, tests: TESTS, ledger: LEDGER, totals: unity });
    expect(Math.abs(bad.days[0].factors.oil - MF.oil)).toBeGreaterThan(0.001);
  });
});

describe('Episode 23: Well Test Analysis Studio, Ekene-1 buildup', () => {
  const sheet = readSheet(`${F}/well-test-analysis-studio-inputs.csv`);
  const gauge = parseGaugeCsv(read(`${F}/ekene-1-buildup-2025-02.csv`));
  const R = 'Reservoir and fluid';
  const reservoirForm = {
    ...DEFAULT_RESERVOIR,
    fluid: 'oil',
    h: get(sheet, `${R}|Net thickness h`),
    phi: get(sheet, `${R}|Porosity`),
    rw: get(sheet, `${R}|Wellbore radius rw`),
    ct: get(sheet, `${R}|Total ct`),
    B: get(sheet, `${R}|Oil FVF B`),
    mu: get(sheet, `${R}|Viscosity`),
    q: get(sheet, `${R}|Rate q`),
    pi: get(sheet, `${R}|Initial pressure pi`),
  };
  const configForm = {
    ...DEFAULT_TEST_CONFIG,
    testType: 'buildup',
    tp: get(sheet, 'Test setup|Producing time tp'),
    pwfShutIn: get(sheet, 'Test setup|Flowing pressure at shut-in'),
  };
  const lo = Number(get(sheet, 'Horner window|From'));
  const hi = Number(get(sheet, 'Horner window|To'));

  // The studio's own chain: builders, prepareTestData (spike filter and log
  // decimation on, as by default), the Horner window, hornerAnalysis.
  const horner = (resForm = reservoirForm, cfgForm = configForm) => {
    const { reservoir } = buildReservoirInputs(resForm);
    const { config } = buildTestConfig(cfgForm);
    const prepared = prepareTestData({ gaugeRows: gauge, reservoir, config });
    const pts = prepared.points.filter((p) => p.time >= lo && p.time <= hi);
    const raw = hornerAnalysis({
      points: pts.map((p) => ({ dt: p.time, pws: p.pa })), tp: config.tp, pwfShutIn: prepared.paShutIn, ...reservoir,
    });
    return { ...raw, pStar: prepared.fromAnalysis(raw.pStar) };
  };
  const kTrue = 250 * 0.9;           // LOCKED k times the oil endpoint
  const skinTrue = DESIGN.buildup.skin;
  const pSurvey = WF.pressure.track.find((t) => t.label === DESIGN.buildup.flow_month).p_end_psia;

  test('every label on the input sheet is one the studio shows', () => {
    expect(labelsAppearIn(sheet, [
      'src/components/welltest/DataPanel.jsx', 'src/components/welltest/SpecializedPanel.jsx',
    ])).toEqual([]);
  });

  test('the gauge file imports (the studio needs at least 5 rows)', () => {
    expect(gauge.length).toBe(97);
    expect(gauge[0].t).toBeCloseTo(0.01, 9);
  });

  const h = horner();
  test('Horner: k within 2 percent, skin within 0.3, p* on the February 2025 survey', () => {
    expect(Math.abs(h.k / kTrue - 1)).toBeLessThan(0.02);
    expect(Math.abs(h.skin - skinTrue)).toBeLessThan(0.3);
    expect(Math.abs(h.pStar - pSurvey)).toBeLessThan(0.5);
    expect(h.r2).toBeGreaterThan(0.9999);
    const note = episode(23);
    expect(note).toContain(`k ${h.k.toFixed(1)} md, skin ${h.skin.toFixed(2)} and p* ${h.pStar.toFixed(2)} psia`);
  });

  test('negative control: h 10 percent high moves k beyond 2 percent', () => {
    const bad = horner({ ...reservoirForm, h: String(Number(reservoirForm.h) * 1.1) });
    expect(Math.abs(bad.k / kTrue - 1)).toBeGreaterThan(0.02);
  });

  test('negative control: q 5 percent high moves k beyond 2 percent', () => {
    const bad = horner({ ...reservoirForm, q: String(Number(reservoirForm.q) * 1.05) });
    expect(Math.abs(bad.k / kTrue - 1)).toBeGreaterThan(0.02);
  });

  test('negative control: leaving the flowing pressure blank (the note warns) moves skin beyond 0.3', () => {
    const bad = horner(reservoirForm, { ...configForm, pwfShutIn: '' });
    expect(Math.abs(bad.skin - skinTrue)).toBeGreaterThan(0.3);
  });
});

describe('Episode 24: Nodal Analysis Studio, Ekene-1 in December 2025', () => {
  const sheet = readSheet(`${F}/nodal-analysis-studio-inputs.csv`);
  const corrByLabel = Object.fromEntries(Object.entries(CORRELATIONS).map(([id, c]) => [c.label, id]));
  const IPR_LABELS = { 'Composite (Standing)': 'composite', 'Straight-line PI': 'pi', Vogel: 'vogel' };
  const fluid = {
    ...DEFAULT_FLUID,
    api: get(sheet, 'Fluid|Oil gravity'),
    gasSg: get(sheet, 'Fluid|Gas specific gravity'),
    gor: get(sheet, 'Fluid|Solution GOR at Pb'),
    salinityPpm: get(sheet, 'Fluid|Water salinity'),
  };
  const inflow = {
    ...DEFAULT_INFLOW,
    wellType: 'oil',
    pr: get(sheet, 'Reservoir and inflow|Reservoir pressure'),
    model: IPR_LABELS[get(sheet, 'Reservoir and inflow|IPR model')],
    pb: get(sheet, 'Reservoir and inflow|Bubble point'),
    calMode: get(sheet, 'Reservoir and inflow|Calibration') === 'Enter PI (J)' ? 'pi' : 'test',
    pi: get(sheet, 'Reservoir and inflow|Productivity index J'),
  };
  const well = {
    ...DEFAULT_WELL,
    mode: 'vertical',
    depthFt: get(sheet, 'Well and trajectory|Node depth (MD = TVD)'),
    whtF: get(sheet, 'Well and trajectory|Wellhead temperature'),
    bhtF: get(sheet, 'Well and trajectory|Bottomhole temperature'),
  };
  const completion = {
    ...DEFAULT_COMPLETION,
    idIn: get(sheet, 'Completion and rates|Tubing ID'),
    roughnessIn: get(sheet, 'Completion and rates|Roughness'),
    whp: get(sheet, 'Completion and rates|Wellhead pressure'),
    correlation: corrByLabel[get(sheet, 'Completion and rates|VLP correlation')],
    wctPct: get(sheet, 'Completion and rates|Water cut'),
    prodGor: get(sheet, 'Completion and rates|Producing GOR'),
    stepFt: get(sheet, 'Completion and rates|Traverse step'),
  };
  // The studio's system memo, verbatim in shape.
  const system = (comp = completion) => {
    const fluidSpec = buildFluid(fluid);
    const wellSpec = buildWell(well);
    const inflowSpec = buildInflow({ ...inflow, gasSg: fluid.gasSg });
    const vlpSpec = buildVlpOpts({ completion: comp, wellSpec, fluidModel: fluidSpec.model });
    expect(fluidSpec.error).toBeNull();
    expect(wellSpec.error).toBeNull();
    expect(inflowSpec.error).toBeNull();
    expect(vlpSpec.error).toBeNull();
    return solveOperatingPoint({ ipr: inflowSpec.ipr, vlp: vlpSpec.vlp, nGrid: 25 });
  };
  const decTest = testsParsed.tests.find((t) => t.well === 'Ekene-1' && t.date === '2025-12-01');

  test('every label on the input sheet is one the studio shows', () => {
    expect(labelsAppearIn(sheet, ['src/components/nodalstudio/InputCards.jsx'])).toEqual([]);
    expect(inflow.model).toBe('composite');
    expect(completion.correlation).toBe('hagedornBrown');
  });

  test('the sheet is the December test: its THP, its water cut, the pressure track', () => {
    expect(Number(completion.whp)).toBeCloseTo(decTest.thp_psia, 6);
    const wct = (100 * decTest.water_rate_stbd) / (decTest.oil_rate_stbd + decTest.water_rate_stbd);
    expect(Number(completion.wctPct)).toBeCloseTo(wct, 3);
    expect(Number(inflow.pr)).toBeCloseTo(WF.pressure.track.find((t) => t.label === '2025-11').p_end_psia, 2);
  });

  const sol = system();
  const nearTest = sol.intersections.find((x) => Math.abs(x.q / decTest.oil_rate_stbd - 1) < 0.05);

  test('a crossing within 5 percent of the test rate; the headline is the unchoked balance', () => {
    expect(sol.status).toBe('flowing');
    expect(nearTest).toBeDefined();
    expect(Math.abs(nearTest.q / decTest.oil_rate_stbd - 1)).toBeLessThan(0.002);
    // The headline Operating rate is the highest stable crossing and it is
    // NOT the test: the studio's outflow has no choke (see the README).
    expect(sol.op.q).toBeGreaterThan(5 * decTest.oil_rate_stbd);
    const note = episode(24);
    expect(note).toContain(`${nearTest.q.toFixed(1)} bopd (${nearTest.stable ? 'stable' : 'unstable heading branch'})`);
    expect(note).toContain(`The headline Operating rate is ${sol.op.q.toFixed(0)} bopd`);
  });

  test('negative control: the wellhead pressure 5 psi high moves the low crossing beyond 5 percent', () => {
    const bad = system({ ...completion, whp: String(Number(completion.whp) + 5) });
    const near = bad.intersections.map((x) => x.q).filter((q) => q < 3 * decTest.oil_rate_stbd);
    const miss = near.length ? Math.min(...near.map((q) => Math.abs(q / decTest.oil_rate_stbd - 1))) : Infinity;
    expect(miss).toBeGreaterThan(0.05);
  });
});

describe('Episode 25: ESP Design Studio, Ekene-6 on the day it stops flowing', () => {
  const sheet = readSheet(`${F}/esp-design-studio-inputs.csv`);
  const W = 'Well Model';
  const base = espDefaults();
  const stage = REFERENCE_STAGES.find((s) => s.label === get(sheet, 'Pump|Reference stage'));
  const frame = MOTOR_FRAMES.find((m) => `${m.hp} hp, ${m.volts} V, ${m.amps} A (${m.seriesOdIn} in)` === get(sheet, 'Motor and Cable|Start from a motor frame'));
  const inputs = {
    ...base,
    well: {
      ...base.well, mode: 'vertical',
      depthFt: get(sheet, `${W}|Perforation depth (ft TVD)`),
      whtF: get(sheet, `${W}|Wellhead temp (F)`), bhtF: get(sheet, `${W}|Bottomhole temp (F)`),
    },
    fluid: {
      ...base.fluid,
      api: get(sheet, `${W}|Oil API`), gasSg: get(sheet, `${W}|Gas gravity`),
      gor: get(sheet, `${W}|Producing GOR (scf/stb)`), salinityPpm: get(sheet, `${W}|Salinity (ppm)`),
    },
    inflow: {
      ...base.inflow, model: 'composite', calMode: 'pi',
      pr: get(sheet, `${W}|Reservoir pressure (psia)`), pb: get(sheet, `${W}|Bubble point (psia)`),
      pi: get(sheet, `${W}|PI (stb/d/psi)`),
    },
    completion: {
      ...base.completion,
      idIn: get(sheet, `${W}|Tubing ID (in)`), casingIdIn: get(sheet, `${W}|Casing ID (in)`),
      roughnessIn: get(sheet, `${W}|Roughness (in)`), stepFt: get(sheet, `${W}|Traverse step (ft)`),
      correlation: get(sheet, `${W}|Flow correlation`) === 'Modified Hagedorn-Brown' ? 'hagedornBrown' : 'beggsBrill',
    },
    duty: {
      ...base.duty,
      designRateStbd: get(sheet, 'Duty|Design oil rate (stb/d)'),
      wctPct: get(sheet, 'Duty|Water cut (%)'),
      whp: get(sheet, 'Duty|Wellhead pressure (psia)'),
      pumpTvdFt: get(sheet, 'Duty|Pump setting depth (ft TVD)'),
      annulusGradPsiPerFt: get(sheet, 'Duty|Annulus gradient (psi/ft)'),
      separatorEfficiencyPct: get(sheet, 'Duty|Intake separator efficiency (%)'),
      gvfStandardMaxPct: get(sheet, 'Duty|Standard stage limit (% GVF)'),
      gvfHandlerMaxPct: get(sheet, 'Duty|Gas handler limit (% GVF)'),
    },
    pump: { ...base.pump, curveSource: 'reference', referenceStageId: stage?.id, hz: get(sheet, 'Pump|Drive frequency (Hz)') },
    motor: {
      ...base.motor,
      motorFrameId: frame?.id, nameplateHp: String(frame?.hp), nameplateVolts: String(frame?.volts), nameplateAmps: String(frame?.amps),
      motorEfficiencyPct: get(sheet, 'Motor and Cable|Motor efficiency (%)'),
      powerFactor: get(sheet, 'Motor and Cable|Power factor'),
      cableLengthFt: get(sheet, 'Motor and Cable|Cable length (ft)'),
      cableTempF: get(sheet, 'Motor and Cable|Average cable temp (F)'),
      maxDropPct: get(sheet, 'Motor and Cable|Max voltage drop (%)'),
    },
  };
  const design = (inp = inputs) => {
    const model = buildWellModel(inp);
    return { model, res: runEspDesign({ form: designFormFrom(inp, model), model }) };
  };

  test('every label on the input sheet is one the studio shows', () => {
    expect(labelsAppearIn(sheet, [
      'src/pages/apps/EspDesignStudio.jsx', 'src/components/esp/WellModelPanel.jsx',
      'src/components/production/WellModelPanel.jsx', 'src/components/esp/DutyPanel.jsx',
      'src/components/esp/PumpPanel.jsx', 'src/components/esp/MotorCablePanel.jsx',
    ])).toEqual([]);
    expect(stage).toBeDefined();
    expect(frame).toBeDefined();
  });

  const { model, res } = design();
  test('the studio sizes the pump the note quotes, on a standard stage', () => {
    expect(res.ok).toBe(true);
    const d = res.design;
    expect(d.duty.intake.gas.verdict).toBe('standard');
    expect(d.duty.pumpIntakeBpd).toBeGreaterThan(500);
    expect(d.duty.pumpIntakeBpd).toBeLessThan(1450);
    const note = episode(25);
    expect(note).toContain(`sizes ${d.sized.stages} stages`);
    expect(note).toContain(`total dynamic head of ${d.duty.tdhFt.toFixed(0)} ft: ${d.sized.shaftHp.toFixed(1)} hp at the shaft`);
  });

  test('why a pump: at the design water cut the well does not flow at the design wellhead pressure', () => {
    const wct = Number(inputs.duty.wctPct) / 100;
    const natural = solveOperatingPoint({
      ipr: model.ipr, vlp: { ...model.vlp, whp: Number(inputs.duty.whp), rates: { wct, gor: Number(inputs.fluid.gor) } }, nGrid: 25,
    });
    expect(natural.status).toBe('dead');
  });

  test('negative control: twice the PI changes the stage count by more than 10 percent', () => {
    const bad = design({ ...inputs, inflow: { ...inputs.inflow, pi: String(2 * Number(inputs.inflow.pi)) } });
    const stages = bad.res.ok ? bad.res.design.sized.stages : 0;
    expect(Math.abs(stages / res.design.sized.stages - 1)).toBeGreaterThan(0.1);
  });
});
