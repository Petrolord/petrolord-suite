/**
 * Drilling domain gate (Wave D8, episodes 17-20): the generated kit through
 * the drilling studios' OWN parsers and run services.
 *
 * Every sheet in 10-drilling is read from disk, mapped field by field the
 * way the studio's screen maps it (units included), and run through the
 * service the studio's workstation calls. The episode notes must quote what
 * comes back. Each engine gate carries a negative control: one plausible
 * wrong input that moves the answer past the precision the note quotes.
 *
 *   npx tsx tools/demo-dataset/generate.mjs && npx jest tools/demo-dataset
 */
import fs from 'fs';
import path from 'path';
import { parseDelimitedText } from '../../../src/lib/tabularFile';
import { guessMapping, buildDeviation } from '../../../src/lib/wellImport';
import { parseManualStations, toGridSurvey } from '../../../src/pages/apps/well-planning/services/surveyUtils';
import { computeWellPath } from '../../../packages/engines/engines/drilling/surveyMath';
import { tvdAt } from '../../../packages/engines/engines/drilling/wellControl';
import {
  DRILL_PIPE, HWDP, DRILL_COLLARS, CASING_QUICK, gradeYieldPa,
} from '../../../packages/engines/engines/drilling/data/tubulars';
import {
  runAll as runCasingTubing, defaultCaseDoc as defaultCtDoc, fmtSF, depthStore,
} from '../../../src/pages/apps/CasingTubingDesignPro/services/ctRun';
import { runCase, depthIn, forceOut, torqueOut } from '../../../src/pages/apps/TorqueDragStudio/services/tdRun';
import { holeSectionsFromCasingStrings } from '../../../src/pages/apps/TorqueDragStudio/services/geometrySource';
import { runHydraulics, flowIn, emwOut as hydEmwOut } from '../../../src/pages/apps/HydraulicsStudio/services/hydRun';
import {
  runKickTolerance, emwIn, volumeOut, pressureOut,
} from '../../../src/pages/apps/WellControlStudio/services/wcRun';
import { caseDocFromFile } from '../../../src/pages/apps/WellCostTime/services/wctCaseFile';
import { runDeterministic, runMonteCarlo } from '../../../src/pages/apps/WellCostTime/services/wctRun';
import { EKENE11 } from '../d8spine.mjs';

const KIT = path.join(__dirname, '..', '..', '..', 'dist-demo', 'ekene-demo-v1');
const read = (rel) => {
  const p = path.join(KIT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`${rel} is missing: run the generator first (npx tsx tools/demo-dataset/generate.mjs).`);
  }
  return fs.readFileSync(p, 'utf8');
};
const IN = 0.0254;
const PPG = 119.826;

// RFC 4180 rows (the sheets quote fields holding commas and inch marks).
function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;   // an inch mark mid-field is data
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
// One value from an input sheet, by the studio's own section and field label.
function sheet(rel) {
  const rows = parseCsv(read(rel));
  expect(Object.keys(rows[0])).toEqual(['section', 'field', 'value', 'unit', 'source']);
  const get = (section, field) => {
    const hit = rows.filter((r) => r.section === section && r.field === field);
    if (hit.length !== 1) throw new Error(`${rel}: ${hit.length} rows for "${section}" / "${field}"`);
    return hit[0].value;
  };
  return { rows, get, num: (s, f) => Number(get(s, f)) };
}
const note = (nn) => {
  const dir = path.join(KIT, 'episodes');
  if (!fs.existsSync(dir)) throw new Error('episodes/ is missing: run the generator first.');
  const f = fs.readdirSync(dir).find((x) => x.startsWith(`episode-${nn}-`));
  if (!f) throw new Error(`episode ${nn} note is missing: run the generator first.`);
  return fs.readFileSync(path.join(dir, f), 'utf8');
};
const usd = (x) => `${Math.round(x).toLocaleString('en-US')} USD`;

// ---- shared: the trajectory as Well Design Studio imports it --------------
const site = Object.fromEntries(parseCsv(read('07-well-design/ekene-alpha-site.csv')).map((r) => [r.item, r.value]));
const WH = { x: Number(site['wellhead easting m']), y: Number(site['wellhead northing m']) };
const targets = parseCsv(read('07-well-design/ekene-11-targets.csv'));
const T1 = targets.find((t) => t.target.startsWith('T1'));
const surveyText = read('10-drilling/ekene-11-planned-survey.csv');
const table = parseDelimitedText(surveyText, { delimiter: 'auto' });
const map = guessMapping(table.header, ['md', 'inc', 'azi']);
const stations = toGridSurvey(buildDeviation(table.rows, map), 'grid', {});
const TD = stations[stations.length - 1].md;

function t1Miss(st) {
  const p = computeWellPath(st, { surfaceX: WH.x, surfaceY: WH.y });
  const tv = Number(T1.tvd_m);
  const i = p.findIndex((r) => r.tvd >= tv);
  const f = (tv - p[i - 1].tvd) / (p[i].tvd - p[i - 1].tvd);
  const x = p[i - 1].x + f * (p[i].x - p[i - 1].x);
  const y = p[i - 1].y + f * (p[i].y - p[i - 1].y);
  return Math.hypot(x - Number(T1.easting_m), y - Number(T1.northing_m));
}

// ---- shared: the pressure window at Ekene-11 TVD ---------------------------
const prog = parseCsv(read('05-pressure/ekene-1-designed-prognosis.csv'))
  .map((r) => ({ tvd: Number(r.tvd_m), pp: Number(r.pore_pressure_ppg), fg: Number(r.fracture_ppg) }));
const at = (key, tvd) => {
  const i = prog.findIndex((r) => r.tvd >= tvd);
  if (i <= 0) return prog[Math.max(i, 0)][key];
  const f = (tvd - prog[i - 1].tvd) / (prog[i].tvd - prog[i - 1].tvd);
  return prog[i - 1][key] + f * (prog[i][key] - prog[i - 1][key]);
};
const lots = parseCsv(read('05-pressure/ekene-lot-fit.csv'));
const lot958 = lots.find((r) => r.casing.startsWith('9-5/8') && r.test === 'LOT');
const program = parseCsv(read('10-drilling/ekene-11-casing-program.csv'));

// ---- shared: the Casing & Tubing case built from its sheet -----------------
function ctCaseFromSheet(override = {}) {
  const s = sheet('10-drilling/casing-tubing-inputs.csv');
  const doc = defaultCtDoc({ shoeMdM: TD });                // what "new case" creates
  const SEC = 'Casing Design > Production Casing (section Prod-1)';
  Object.assign(doc.strings.casingStrings[0].sections[0], {
    topMdM: depthStore(s.num(SEC, 'Top MD (m)'), 'm'),
    bottomMdM: depthStore(s.num(SEC, 'Bottom MD (m)'), 'm'),
    odIn: s.num(SEC, 'OD'), weightLbFt: s.num(SEC, 'Weight (lb/ft)'),
    grade: s.get(SEC, 'Grade'), connection: s.get(SEC, 'Connection'),
  });
  const env = doc.environment;
  const PP = 'Well & Loads > Pore Pressure & Fracture Gradient';
  env.ppfg = {
    ...env.ppfg, source: 'manual',
    ppEmwAtShoeKgM3: s.num(PP, 'Pore EMW at shoe'), fracEmwAtShoeKgM3: s.num(PP, 'Frac EMW at shoe'),
  };
  const WF = 'Well & Loads > Well Fluids';
  env.mudKgM3 = s.num(WF, 'Mud Density');
  env.cementKgM3 = s.num(WF, 'Cement Slurry');
  env.seawaterKgM3 = s.num(WF, 'Backup Water');
  env.gasGradPaPerM = s.num(WF, 'Gas Gradient');
  env.bendingDlsDegPer30m = s.num(WF, 'Design DLS');
  doc.loadCases.find((l) => l.kind === 'pressureTestBurst').params.testPressurePa = s.num('Load Cases > Pressure Test (Burst)', 'Test pressure');
  doc.loadCases.find((l) => l.kind === 'runningAxial').params.overpullN = s.num('Load Cases > Running (Axial)', 'Overpull');
  doc.packer.hasPacker = s.get('Tubing Design > Packer', 'Packer set') === 'on';
  const DF = 'Analysis Parameters > Design Factors';
  doc.safetyFactors = {
    burst: s.num(DF, 'Burst Factor'), collapse: s.num(DF, 'Collapse Factor'),
    tension: s.num(DF, 'Tension Factor'), triaxial: s.num(DF, 'Triaxial Factor'),
  };
  Object.assign(env, override);
  return doc;
}

// ---- shared: the Torque & Drag case built from its sheet -------------------
const CATALOGS = { 'Drill collar': ['dc', DRILL_COLLARS], HWDP: ['hwdp', HWDP], 'Drill pipe': ['dp', DRILL_PIPE] };
function tdFromSheet() {
  const s = sheet('10-drilling/torque-drag-inputs.csv');
  const DS = 'String & Geometry > Drillstring (bottom up)';
  const string = ['Bit end', '2', '3'].map((pos) => {
    const [type, cat] = CATALOGS[s.get(`${DS} > ${pos}`, 'Type')];
    const item = cat.find((x) => x.designation === s.get(`${DS} > ${pos}`, 'Catalog'));
    if (!item) throw new Error(`catalog item missing for ${pos}`);
    const c = {
      type, label: item.designation, lengthM: depthIn(s.num(`${DS} > ${pos}`, 'Length (m)'), 'm'),
      odM: item.odM, idM: item.idM, weightKgM: item.weightKgM, tooljointOdM: item.tooljointOdM ?? null,
    };
    if (type === 'dp') { c.grade = s.get(`${DS} > ${pos}`, 'Grade'); c.yieldPa = gradeYieldPa(c.grade); }
    return c;
  });
  const HS = 'String & Geometry > Hole & casing sections';
  const holeSections = ['1', '2'].map((i) => {
    const sec = `${HS} > ${i}`;
    const row = {
      from_md_m: depthIn(s.num(sec, 'From (m)'), 'm'), to_md_m: depthIn(s.num(sec, 'To (m)'), 'm'),
      cased: s.get(sec, 'Cased') === 'yes', hole_id_m: 8.5 * IN,
    };
    if (row.cased) {
      const item = CASING_QUICK.find((x) => x.designation === s.get(sec, 'Casing'));
      Object.assign(row, { casing_od_m: item.odM, casing_id_m: item.idM, casing_weight_kgm: item.weightKgM, description: item.designation });
      row.casing_id_m = s.num(sec, 'Hole/Csg ID (in)') * IN;
    } else row.hole_id_m = s.num(sec, 'Hole/Csg ID (in)') * IN;
    return row;
  });
  const OP = 'String & Geometry > Mud, friction & operations';
  const ops = [['trip_out', 'Trip out'], ['trip_in', 'Trip in'], ['rotate_on_bottom', 'Rotate on btm']]
    .filter(([, label]) => s.get(OP, label) === 'yes').map(([op]) => op);
  const caseRow = {
    string,
    mud: { densityKgM3: s.num(OP, 'Mud (kg/m3)') },
    friction: { cased: s.num(OP, 'FF cased'), open: s.num(OP, 'FF open'), overrides: [] },
    operations: {
      wobN: s.num(OP, 'WOB (kN)') * 1e3, bitTorqueNm: s.num(OP, 'Bit torque (kN-m)') * 1e3,
      tripSpeedMs: s.num(OP, 'Trip speed (m/s)'), rpm: s.num(OP, 'RPM'), ops,
    },
  };
  return { caseRow, holeSections };
}

describe('Episode 17: the planned survey through Well Design Studio\'s importers', () => {
  test('the CSV door maps md, inclination and azimuth by itself, and the paste door reads the same stations', () => {
    expect(table.header.slice(0, 3)).toEqual(['md_m', 'inclination_deg', 'azimuth_deg_grid']);
    expect(map).toEqual({ md: 0, inc: 1, azi: 2 });
    expect(stations.length).toBeGreaterThan(70);
    expect(TD).toBe(2100);
    const pasted = parseManualStations(table.rows.map((r) => `${r[0]} ${r[1]} ${r[2]}`).join('\n'));
    expect(pasted).toEqual(stations.map((s) => ({ md: s.md, inc: s.inc, azi: s.azi })));
  });

  test('it lands on target T1 within 1 m (the target radius is 50 m)', () => {
    const miss = t1Miss(stations);
    console.log(`Ekene-11 planned survey misses T1 by ${miss.toFixed(3)} m`);
    expect(miss).toBeLessThan(1);
    // and stays with 01-wells (same slot, KOP, build and azimuth, aimed 8 m deeper)
    const geo = parseCsv(read('01-wells/surveys/Ekene-11-survey.csv'));
    const last = geo[geo.length - 1];
    expect(Math.abs(tvdAt(stations, TD) - Number(last.tvd_m))).toBeLessThan(5);
    expect(stations[stations.length - 1].azi).toBeCloseTo(Number(last.azimuth_deg_grid), 3);
  });

  test('negative control: the same file read as true-north azimuths misses T1 by more than the tolerance', () => {
    const wrong = toGridSurvey(buildDeviation(table.rows, map), 'true', { grid_convergence_deg: Number(site['grid convergence deg']) });
    expect(t1Miss(wrong)).toBeGreaterThan(1);
  });
});

describe('Episode 17: the casing program sits inside the pressure window', () => {
  test('every hole section: mud 0.3 ppg over its pore pressure and 0.5 ppg under the shoe above', () => {
    const tvdOf = (md) => tvdAt(stations, md);
    const rows = program.filter((r) => r.hole_mud_ppg);
    expect(rows.map((r) => r.string)).toEqual(['20in surface casing', '13-3/8in intermediate casing', '9-5/8in casing', '7in production liner']);
    const shoes = program.map((r) => Number(r.shoe_md_m));
    for (const r of rows) {
      const idx = program.indexOf(r);
      const topShoe = shoes[idx - 1];
      const bottom = r.string.startsWith('7in') ? TD : Number(r.shoe_md_m);
      const mw = Number(r.hole_mud_ppg);
      let maxPp = -Infinity; let minFg = Infinity;
      for (let md = topShoe; md <= bottom; md += 1) {
        maxPp = Math.max(maxPp, at('pp', tvdOf(md)));
        minFg = Math.min(minFg, at('fg', tvdOf(md)));
      }
      expect(mw - maxPp).toBeGreaterThanOrEqual(0.3 - 0.01);
      expect(mw).toBeLessThan(minFg);
      if (idx >= 2) expect(at('fg', tvdOf(topShoe)) - mw).toBeGreaterThanOrEqual(0.5 - 0.01);
      expect(Number(r.hole_mud_kg_m3)).toBe(Math.round(mw * PPG));
    }
    // the 9-5/8in shoe is at the TVD of the Ekene-1 LOT it is limited by
    const s958 = program.find((r) => r.string.startsWith('9-5/8'));
    expect(Math.abs(tvdOf(Number(s958.shoe_md_m)) - Number(lot958.shoe_tvd_m))).toBeLessThan(1);
    expect(Number(lot958.emw_ppg) - Number(program.find((r) => r.string.startsWith('7in')).hole_mud_ppg)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('Episode 17: Casing & Tubing Design Pro on the 9-5/8in string', () => {
  const doc = ctCaseFromSheet();
  const res = runCasingTubing({ caseDoc: doc, stations });
  const k = res.kpis;

  test('the minimum design factors and the controlling load the note quotes', () => {
    const text = note(17);
    console.log(`C&T: burst ${fmtSF(k.minBurst.value)} ${k.minBurst.caseName}, collapse ${fmtSF(k.minCollapse.value)} ${k.minCollapse.caseName}, triaxial ${fmtSF(k.minTriaxial.value)}`);
    expect(k.overall).toBe('PASS');
    expect(res.tubing).toBeNull();
    expect(text).toContain(`Min Burst SF reads ${fmtSF(k.minBurst.value)} (${k.minBurst.caseName})`);
    expect(text).toContain(`Min Coll SF ${fmtSF(k.minCollapse.value)} (${k.minCollapse.caseName})`);
    expect(text).toContain(`Min Triaxial SF ${fmtSF(k.minTriaxial.value)}`);
    const gov = k.minCollapse.value < k.minBurst.value ? { ...k.minCollapse, mode: 'Collapse' } : { ...k.minBurst, mode: 'Burst' };
    expect(text).toContain(`controlling load is ${gov.caseName} (${gov.mode}) at ${Math.round(gov.tvdM)} m TVD`);
    expect(k.minCollapse.value).toBeGreaterThanOrEqual(doc.safetyFactors.collapse);
    expect(k.minBurst.value).toBeGreaterThanOrEqual(doc.safetyFactors.burst);
  });

  test('negative control: the 8-1/2in mud typed as the casing mud moves the collapse factor past the quoted precision', () => {
    const mud8 = Number(program.find((r) => r.string.startsWith('7in')).hole_mud_kg_m3);
    const wrong = runCasingTubing({ caseDoc: ctCaseFromSheet({ mudKgM3: mud8 }), stations }).kpis;
    expect(Math.abs(wrong.minCollapse.value - k.minCollapse.value)).toBeGreaterThan(0.01);
  });
});

describe('Episode 18: Torque & Drag Studio and Hydraulics Studio at TD', () => {
  const { caseRow, holeSections } = tdFromSheet();

  test('the sheet\'s hole sections are the ones the app derives from the Casing & Tubing case', () => {
    const derived = holeSectionsFromCasingStrings(ctCaseFromSheet().strings, TD);
    expect(derived).toHaveLength(holeSections.length);
    derived.forEach((d, i) => {
      expect(holeSections[i].cased).toBe(d.cased);
      expect(holeSections[i].from_md_m).toBeCloseTo(d.from_md_m, 6);
      expect(holeSections[i].to_md_m).toBeCloseTo(d.to_md_m, 6);
      expect((d.cased ? holeSections[i].casing_id_m : holeSections[i].hole_id_m) / IN)
        .toBeCloseTo((d.cased ? d.casing_id_m : d.hole_id_m) / IN, 3);
    });
    expect(caseRow.string.reduce((a, c) => a + c.lengthM, 0)).toBeCloseTo(TD, 6);
  });

  const td = runCase({ stations, caseRow, geometryRow: { hole_sections: holeSections } });

  test('pick-up, slack-off and on-bottom torque are the note\'s', () => {
    const pickup = forceOut(td.results.trip_out.summary.hookloadN, 'm').toFixed(1);
    const slack = forceOut(td.results.trip_in.summary.hookloadN, 'm').toFixed(1);
    const torque = torqueOut(td.results.rotate_on_bottom.summary.surfaceTorqueNm, 'm').toFixed(2);
    console.log(`T&D: pick-up ${pickup} kN, slack-off ${slack} kN, torque ${torque} kN-m`);
    const text = note(18);
    expect(text).toContain(`pick-up hookload ${pickup} kN`);
    expect(text).toContain(`slack-off ${slack} kN`);
    expect(text).toContain(`${torque} kN-m surface torque`);
    expect(Number(pickup)).toBeGreaterThan(Number(slack));
  });

  test('negative control: the cased friction factor typed for open hole moves pick-up past the quoted precision', () => {
    const wrong = runCase({
      stations, caseRow: { ...caseRow, friction: { ...caseRow.friction, open: caseRow.friction.cased } },
      geometryRow: { hole_sections: holeSections },
    });
    const d = Math.abs(wrong.results.trip_out.summary.hookloadN - td.results.trip_out.summary.hookloadN) / 1e3;
    expect(d).toBeGreaterThan(0.1);
  });

  const hydCase = (() => {
    const s = sheet('10-drilling/hydraulics-inputs.csv');
    const M = 'Mud & Rheology > Mud properties';
    const model = s.get(M, 'Model') === 'Auto (Herschel-Bulkley)' ? 'auto' : s.get(M, 'Model');
    return {
      mud: {
        densityKgM3: s.num(M, 'Density (kg/m3)'), model,
        fann: { theta600: s.num(M, 'Fann 600'), theta300: s.num(M, 'Fann 300'), theta6: s.num(M, 'Fann 6'), theta3: s.num(M, 'Fann 3') },
      },
      string: caseRow.string,                                  // imported from the T&D case
      flow: {
        flowRateM3s: flowIn(s.num('Hydraulics', 'Flow rate (L/min)'), 'm'),
        nozzlesMm: s.get('Hydraulics', 'Nozzles (mm, comma separated)').split(',').map((x) => parseFloat(x)).filter((x) => x > 0),
        surfaceLossPa: s.num('Hydraulics', 'Surface loss (kPa)') * 1000,
      },
    };
  })();
  const hyd = runHydraulics({ stations, caseRow: hydCase, geometryRow: { hole_sections: holeSections } });

  test('ECD at TD is the note\'s, under the fracture gradient at TD and the LOT at the shoe', () => {
    const ecd = hydEmwOut(hyd.summary.ecdAtTdKgM3, 'm').toFixed(3);
    const ecdPpg = hyd.summary.ecdAtTdKgM3 / PPG;
    const fgTd = at('fg', tvdAt(stations, TD));
    const shoeMd = holeSections[0].to_md_m;
    const shoeEcd = hyd.ecdProfile.find((r) => Math.abs(r.md - shoeMd) < 1e-6).ecdKgM3 / PPG;
    console.log(`Hydraulics: ECD at TD ${ecd} g/cc (${ecdPpg.toFixed(2)} ppg) vs FG ${fgTd.toFixed(2)}; at the shoe ${shoeEcd.toFixed(2)} vs LOT ${lot958.emw_ppg}`);
    const text = note(18);
    expect(hydCase.flow.nozzlesMm).toEqual([12, 12, 12]);
    expect(text).toContain(`ECD at TD ${ecd} g/cc (${ecdPpg.toFixed(2)} ppg) against a fracture gradient of ${fgTd.toFixed(2)} ppg`);
    expect(text).toContain(`${shoeEcd.toFixed(2)} ppg at the 9-5/8in shoe`);
    expect(ecdPpg).toBeLessThan(fgTd - 0.5);
    expect(shoeEcd).toBeLessThan(Number(lot958.emw_ppg) - 0.3);
  });

  test('negative control: the flow rate typed in gpm moves ECD past the quoted precision', () => {
    const gpm = hydCase.flow.flowRateM3s / 6.30902e-5;
    const wrong = runHydraulics({
      stations, caseRow: { ...hydCase, flow: { ...hydCase.flow, flowRateM3s: flowIn(gpm, 'm') } },
      geometryRow: { hole_sections: holeSections },
    });
    expect(Math.abs(wrong.summary.ecdAtTdKgM3 - hyd.summary.ecdAtTdKgM3) / 1000).toBeGreaterThan(0.001);
  });
});

describe('Episode 19: Well Control Studio, kick tolerance at the 9-5/8in shoe', () => {
  const { caseRow: tdCase, holeSections } = tdFromSheet();
  const s = sheet('10-drilling/well-control-inputs.csv');
  const wc = (override = {}) => ({
    string: tdCase.string,
    mud: { densityKgM3: s.num('Volumes', 'Mud (kg/m3)') },
    pump: { outputM3PerStroke: s.num('Volumes', 'Pump output (L/stk)') / 1000, scr: [{ spm: 30, pressurePa: 4.5e6 }], scrIndex: 0 },
    shoe: { mdM: s.num('Volumes', 'Shoe MD (m)'), fracEmwKgM3: emwIn(s.num('Volumes', 'Shoe frac EMW (g/cc)'), 'm') },
    kick: {
      kickIntensityKgM3: s.num('Kick Tolerance', 'Kick intensity (kg/m3)'),
      influxDensityKgM3: s.num('Kick Tolerance', 'Influx density (kg/m3)'),
    },
    ...override,
  });
  const kt = runKickTolerance({ stations, caseRow: wc(), geometryRow: { hole_sections: holeSections } });

  test('MAASP and kick tolerance are the note\'s, from the LOT', () => {
    expect(s.num('Volumes', 'Shoe frac EMW (g/cc)')).toBeCloseTo(Number(lot958.emw_ppg) * PPG / 1000, 2);
    const m3 = volumeOut(kt.result.kickToleranceM3, 'm').toFixed(2);
    const bbl = volumeOut(kt.result.kickToleranceM3, 'ft').toFixed(1);
    const maasp = pressureOut(kt.result.maaspPa, 'm').toFixed(0);
    console.log(`Well control: MAASP ${maasp} kPa, kick tolerance ${m3} m3 (${bbl} bbl)`);
    const text = note(19);
    expect(text).toContain(`MAASP ${maasp} kPa`);
    expect(text).toContain(`kick tolerance ${m3} m3 (${bbl} bbl)`);
    expect(kt.result.kickToleranceM3).toBeGreaterThan(0);
    expect(kt.context.tvdShoeM).toBeCloseTo(Number(lot958.shoe_tvd_m), 0);
  });

  test('negative control: the shoe TVD typed as its MD moves kick tolerance past the quoted precision', () => {
    const wrong = runKickTolerance({
      stations, caseRow: wc({ shoe: { ...wc().shoe, mdM: Number(lot958.shoe_tvd_m) } }), geometryRow: { hole_sections: holeSections },
    });
    expect(Math.abs(wrong.result.kickToleranceM3 - kt.result.kickToleranceM3)).toBeGreaterThan(0.01);
  });
});

describe('Episode 20: Well Cost & Time, the Ekene-11 AFE', () => {
  const text = read('10-drilling/ekene-11-well-cost.wct.json');
  const doc = caseDocFromFile(text);                        // the Import case door
  const det = runDeterministic({ caseDoc: doc });

  test('the case file imports and its deterministic AFE is the Ekene-11 capital within 1 percent', () => {
    expect(JSON.parse(text).format).toBe('petrolord-wct-case');
    const err = Math.abs(det.kpis.totalUsd - EKENE11.dc_cost_usd) / EKENE11.dc_cost_usd;
    console.log(`AFE ${usd(det.kpis.totalUsd)} (${(err * 100).toFixed(3)} percent from ${EKENE11.dc_cost_usd}), ${det.kpis.totalDays.toFixed(1)} days`);
    expect(err).toBeLessThan(0.01);
    expect(det.kpis.tdMdM).toBe(TD);
    const n20 = note(20);
    expect(n20).toContain(`total ${usd(det.kpis.totalUsd)}`);
    expect(n20).toContain(`${det.kpis.totalDays.toFixed(1)} days`);
    expect(() => caseDocFromFile(surveyText)).toThrow(/not JSON/);
  });

  test('the seeded Monte Carlo reproduces the note\'s P10, P50 and P90', () => {
    const mc = runMonteCarlo({ caseDoc: doc });
    expect(mc.valid).toBe(doc.risk.iterations);
    const n20 = note(20);
    expect(n20).toContain(`P10 ${usd(mc.cost.p10)}, P50 ${usd(mc.cost.p50)}, P90 ${usd(mc.cost.p90)}`);
    expect(n20).toContain(`${mc.days.p10.toFixed(1)}, ${mc.days.p50.toFixed(1)} and ${mc.days.p90.toFixed(1)} days`);
    expect(mc.cost.p10).toBeLessThan(mc.cost.p50);
    expect(mc.cost.p50).toBeLessThan(mc.cost.p90);
  });

  test('negative control: dropping the NPT allowance moves the AFE more than 1 percent off the capital', () => {
    const wrong = runDeterministic({ caseDoc: { ...doc, program: { ...doc.program, nptFrac: 0 } } });
    expect(Math.abs(wrong.kpis.totalUsd - EKENE11.dc_cost_usd) / EKENE11.dc_cost_usd).toBeGreaterThan(0.01);
  });
});
