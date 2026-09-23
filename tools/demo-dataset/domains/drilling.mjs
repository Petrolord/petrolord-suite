// Wave D8, drilling domain: Ekene-11 from trajectory to AFE (episodes 17-20).
// ============================================================================
// Everything here is DERIVED and ASSERTED, like sections 1-16 of generate.mjs:
//
//   * the planned survey is the Ekene-11 build-and-hold geology.mjs already
//     drills (01-wells/surveys/Ekene-11-survey.csv), resampled with stations
//     at the target and the shoes, recomputed through the Suite's own
//     minimum-curvature engine and asserted onto target T1;
//   * the casing program and mud weights come from the kit's own pressure
//     files (05-pressure: the designed prognosis and the Ekene-1 shoe tests),
//     read back from disk, with every window margin asserted;
//   * each input sheet is run through the app's own run service (the one its
//     workstation calls) and the episode notes quote what came back;
//   * the Well Cost & Time case is written by the app's own case-file writer
//     and its AFE total is asserted onto EKENE11.dc_cost_usd (d8spine.mjs).
//
// The gate that re-reads all of it from the kit is
// __tests__/domain.drilling.test.js.
// ============================================================================

import fs from 'fs';
import path from 'path';

import { FRAME } from '../spine.mjs';
import { EKENE11 } from '../d8spine.mjs';
import { computeWellPath } from '../../../packages/engines/engines/seismolord/wellPath.js';
import { tvdAt } from '../../../packages/engines/engines/drilling/wellControl.js';
import {
  DRILL_PIPE, HWDP, DRILL_COLLARS, CASING_QUICK, gradeYieldPa,
} from '../../../packages/engines/engines/drilling/data/tubulars.js';
import {
  runAll as runCasingTubing, defaultCaseDoc as defaultCtDoc, fmtSF,
} from '../../../src/pages/apps/CasingTubingDesignPro/services/ctRun.js';
import { runCase as runTorqueDrag } from '../../../src/pages/apps/TorqueDragStudio/services/tdRun.js';
import { holeSectionsFromCasingStrings } from '../../../src/pages/apps/TorqueDragStudio/services/geometrySource.js';
import { runHydraulics } from '../../../src/pages/apps/HydraulicsStudio/services/hydRun.js';
import { runKickTolerance } from '../../../src/pages/apps/WellControlStudio/services/wcRun.js';
import { runDeterministic, runMonteCarlo } from '../../../src/pages/apps/WellCostTime/services/wctRun.js';
import { caseFileText, caseDocFromFile } from '../../../src/pages/apps/WellCostTime/services/wctCaseFile.js';

const IN = 0.0254;
const PPG = 119.826;                 // kg/m3 per ppg, the drilling studios' constant
const BBL = 0.1589873;               // m3 per bbl, Well Control Studio's constant
const G = 9.80665;

// Design rules (DESIGN, stated in the README and the casing program).
export const RULES = {
  trip_margin_ppg: 0.3,              // mud weight over the highest pore pressure in the open hole
  kick_margin_ppg: 0.5,              // fracture gradient at the shoe above over the mud weight
  mw_step_ppg: 0.1,                  // mud weights are rounded UP to this step
  shoe_md_step_m: 10,                // intermediate shoe rounded down-hole to this step
  target_tolerance_m: 1.0,           // planned survey must pass this close to the T1 centre
};

// RFC 4180 CSV writer (the input sheets carry commas and inch marks).
const q = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvQ = (headers, rows) => `${[headers, ...rows].map((r) => r.map(q).join(',')).join('\n')}\n`;

// RFC 4180 reader (the kit's own CSVs quote fields that hold commas).
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [keys, ...body] = rows;
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
}

// geology.mjs's build-and-hold solve (same KOP and build rate), aimed at a
// point instead of the Oboro top: the hold angle that reaches H by tvdT.
function solveHold({ kop, buildRatePer30m, tvdT, H }) {
  const r = (30 * 180) / (buildRatePer30m * Math.PI);
  const f = (deg) => {
    const th = deg * Math.PI / 180;
    const s = (tvdT - kop - r * Math.sin(th)) / Math.cos(th);
    return s < 0 ? Infinity : r * (1 - Math.cos(th)) + s * Math.sin(th) - H;
  };
  let lo = 0.001; let hi = 75;
  for (let i = 0; i < 200; i += 1) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

const upTo = (x, step) => Math.ceil(x / step - 1e-9) * step;
const fix = (x, d) => Number(x.toFixed(d));
const usd = (x) => `${Math.round(x).toLocaleString('en-US')} USD`;

export async function build(ctx) {
  const { write, n, say, assertClose, OUT, built } = ctx;

  // ==========================================================================
  // 1. The planned survey
  // ==========================================================================
  const e11 = built.find((b) => b.well.name === 'Ekene-11');
  if (!e11 || e11.well.kind !== 'planned') throw new Error('ASSERT drilling: Ekene-11 is not the planned well.');
  const plan = e11.survey.plan;
  if (plan.kind !== 'build-and-hold') throw new Error('ASSERT drilling: Ekene-11 is not a build-and-hold plan.');
  const geoSt = e11.survey.stations;
  const tdMd = geoSt[geoSt.length - 1].md;

  // Site card and targets, read back from the kit as a presenter has them.
  const site = Object.fromEntries(readCsv(path.join(OUT, '07-well-design/ekene-alpha-site.csv')).map((r) => [r.item, r.value]));
  const whE = Number(site['wellhead easting m']);
  const whN = Number(site['wellhead northing m']);
  const targets = readCsv(path.join(OUT, '07-well-design/ekene-11-targets.csv'));
  const T1 = targets.find((t) => t.target.startsWith('T1'));
  const T2 = targets.find((t) => t.target.startsWith('T2'));

  // The same KOP and build rate as 01-wells/surveys/Ekene-11-survey.csv
  // (which aims at the Oboro top), aimed at T1 itself, 8 m deeper.
  const dxT = Number(T1.easting_m) - whE;
  const dyT = Number(T1.northing_m) - whN;
  const azimuth = (Math.atan2(dxT, dyT) * 180 / Math.PI + 360) % 360;
  const theta = solveHold({ kop: plan.kop, buildRatePer30m: plan.buildRate, tvdT: Number(T1.tvd_m), H: Math.hypot(dxT, dyT) });
  const holdStart = plan.kop + (theta / plan.buildRate) * 30;
  const incAt = (md) => (md <= plan.kop ? 0 : md >= holdStart ? theta : ((md - plan.kop) / (holdStart - plan.kop)) * theta);
  const stationsFor = (mds) => [...new Set(mds.map((m) => fix(m, 2)))].sort((a, b) => a - b)
    .map((md) => ({ md, inc: incAt(md), azi: azimuth }));

  const base = [];
  for (let md = 0; md <= tdMd + 1e-9; md += 30) base.push(md);
  let stations = stationsFor([...base, plan.kop, holdStart, tdMd]);
  const mdAtTvd = (tvd) => {
    let lo = 0; let hi = tdMd;
    for (let i = 0; i < 80; i += 1) {
      const mid = (lo + hi) / 2;
      if (tvdAt(stations, mid) < tvd) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const t1Md = mdAtTvd(Number(T1.tvd_m));

  // ==========================================================================
  // 2. Pressure window, read from 05-pressure
  // ==========================================================================
  const prog = readCsv(path.join(OUT, '05-pressure/ekene-1-designed-prognosis.csv'))
    .map((r) => ({ tvd: Number(r.tvd_m), pp: Number(r.pore_pressure_ppg), fg: Number(r.fracture_ppg) }))
    .sort((a, b) => a.tvd - b.tvd);
  const interp = (key) => (tvd) => {
    if (tvd <= prog[0].tvd) return prog[0][key];
    for (let i = 1; i < prog.length; i += 1) {
      if (tvd <= prog[i].tvd) {
        const f = (tvd - prog[i - 1].tvd) / (prog[i].tvd - prog[i - 1].tvd);
        return prog[i - 1][key] + f * (prog[i][key] - prog[i - 1][key]);
      }
    }
    return prog[prog.length - 1][key];
  };
  const pp = interp('pp');
  const fg = interp('fg');
  const shoeTests = readCsv(path.join(OUT, '05-pressure/ekene-lot-fit.csv'))
    .map((r) => ({ casing: r.casing, md: Number(r.shoe_md_m), tvd: Number(r.shoe_tvd_m), test: r.test, emw: Number(r.emw_ppg) }));
  // The offset shoe tests calibrate the prognosis: every LOT sits on the
  // fracture curve and the FIT 0.6 ppg under it (held, not broken down).
  for (const t of shoeTests) {
    const expect = t.test === 'LOT' ? fg(t.tvd) : fg(t.tvd) - 0.6;
    assertClose(`Ekene-1 ${t.test} at ${t.md} m against the prognosis`, t.emw, expect, 0.02);
  }
  const lot958 = shoeTests.find((t) => t.test === 'LOT' && t.casing.startsWith('9-5/8'));
  const fit20 = shoeTests.find((t) => t.test === 'FIT');

  const tops = readCsv(path.join(OUT, '01-wells/tops/Ekene-11-tops.csv'))
    .map((r) => ({ name: r.top_name, md: Number(r.md_m), tvd: Number(r.tvd_m) }));
  const formationAt = (md) => [...tops].reverse().find((t) => t.md <= md)?.name ?? 'Seabed';
  const topTvd = (name) => tops.find((t) => t.name === name).tvd;

  // ==========================================================================
  // 3. Casing program: bottom up from TD, on the Ekene-11 trajectory
  // ==========================================================================
  const tvdTd = tvdAt(stations, tdMd);
  const maxPp = (tvdA, tvdB) => {
    let m = -Infinity;
    for (let z = tvdA; z <= tvdB + 1e-9; z += 0.5) m = Math.max(m, pp(Math.min(z, tvdB)));
    return Math.max(m, pp(tvdB));
  };
  const minFg = (tvdA, tvdB) => {
    let m = Infinity;
    for (let z = tvdA; z <= tvdB + 1e-9; z += 0.5) m = Math.min(m, fg(Math.min(z, tvdB)));
    return Math.min(m, fg(tvdB));
  };
  const mwFor = (tvdA, tvdB) => fix(upTo(maxPp(tvdA, tvdB) + RULES.trip_margin_ppg, RULES.mw_step_ppg), 1);

  // 9-5/8in: at the TVD where Ekene-1's 9-5/8in LOT was measured, so the
  // 8-1/2in section's limit is a measured leak-off, not only a prognosis.
  const md958 = Math.round(mdAtTvd(lot958.tvd));
  // 13-3/8in: the shallowest point (10 m steps) whose fracture gradient
  // leaves the kick margin over the 12-1/4in section's mud weight.
  const md20 = 600;                                        // Ekene-1's 20in FIT depth
  const md30 = 150;
  stations = stationsFor([...base, plan.kop, holdStart, tdMd, t1Md, md30, md20, md958]);
  const tvd958 = tvdAt(stations, md958);
  const mw8 = mwFor(tvd958, tvdTd);
  const mw12Probe = (tvdTop) => mwFor(tvdTop, tvd958);
  let md1338 = null;
  for (let md = md20 + RULES.shoe_md_step_m; md < md958; md += RULES.shoe_md_step_m) {
    const z = tvdAt(stations, md);
    if (fg(z) - RULES.kick_margin_ppg >= mw12Probe(z) - 1e-9) { md1338 = md; break; }
  }
  if (md1338 === null) throw new Error('ASSERT drilling: no 13-3/8in setting depth satisfies the kick margin.');
  stations = stationsFor([...base, plan.kop, holdStart, tdMd, t1Md, md30, md20, md1338, md958]);
  const tvd1338 = tvdAt(stations, md1338);
  const tvd20 = tvdAt(stations, md20);
  const tvd30 = tvdAt(stations, md30);
  const mw12 = mwFor(tvd1338, tvd958);
  const mw17 = mwFor(tvd20, tvd1338);
  const mw26 = mwFor(tvd30, tvd20);
  const needsLot20 = mw17 >= fit20.emw;
  const linerTop = md958 - 150;
  const linerShoe = tdMd - 3;

  const sections = [
    { string: '30in conductor', hole: 36, od: 30, weight: 310, grade: 'X-52', conn: 'weld-on', top: 0, shoe: md30, mw: null, note: 'jetted from the platform; no shoe test (returns at the seabed)' },
    { string: '20in surface casing', hole: 26, od: 20, weight: 94, grade: 'K-55', conn: 'BTC', top: 0, shoe: md20, mw: mw26, openFrom: tvd30, openTo: tvd20, shoeAbove: null, note: '' },
    { string: '13-3/8in intermediate casing', hole: 17.5, od: 13.375, weight: 68, grade: 'L-80', conn: 'BTC', top: 0, shoe: md1338, mw: mw17, openFrom: tvd20, openTo: tvd1338, shoeAbove: tvd20, note: 'shallowest depth whose fracture gradient keeps the kick margin over the 12-1/4in mud weight; in the Ogbia Shale, inside the top of the pressure ramp' },
    { string: '9-5/8in casing', hole: 12.25, od: 9.625, weight: 47, grade: 'L-80', conn: 'BTC', top: 0, shoe: md958, mw: mw12, openFrom: tvd1338, openTo: tvd958, shoeAbove: tvd1338, note: `at the TVD of Ekene-1's 9-5/8in shoe, whose LOT measured ${n(lot958.emw, 2)} ppg; below the Ekene Sand, above the Oboro Unconformity` },
    { string: '7in production liner', hole: 8.5, od: 7, weight: 29, grade: 'P-110', conn: 'Premium', top: linerTop, shoe: linerShoe, mw: mw8, openFrom: tvd958, openTo: tvdTd, shoeAbove: tvd958, note: 'hung 150 m inside the 9-5/8in; across the Oboro Sand to TD' },
  ];
  sections[1].note = needsLot20
    ? `at Ekene-1's 20in shoe depth, where the FIT held ${n(fit20.emw, 2)} ppg; the 17-1/2in mud is ${n(mw17, 1)} ppg, so take a full leak-off here (prognosis ${n(fg(tvd20), 2)} ppg) before drilling ahead`
    : `at Ekene-1's 20in shoe depth, where the FIT held ${n(fit20.emw, 2)} ppg`;
  for (const s of sections) {
    s.shoeTvd = tvdAt(stations, s.shoe);
    if (s.mw === null) continue;
    s.maxPp = maxPp(s.openFrom, s.openTo);
    s.minFg = minFg(s.openFrom, s.openTo);
    s.overbalance = s.mw - s.maxPp;
    // Kick margin against the fracture gradient at the shoe above (and never
    // above the weakest point of the open hole).
    s.fgLimit = s.shoeAbove === null ? s.minFg : Math.min(fg(s.shoeAbove), s.minFg);
    s.kickMargin = s.fgLimit - s.mw;
    s.shoeTest = s.string.startsWith('7in') ? null : fg(s.shoeTvd);
    if (!(s.overbalance >= RULES.trip_margin_ppg - 1e-9)) throw new Error(`ASSERT drilling: ${s.string} mud ${s.mw} ppg is under the trip margin (${s.overbalance}).`);
    if (s.shoeAbove !== null && !(s.kickMargin >= RULES.kick_margin_ppg - 1e-9)) {
      throw new Error(`ASSERT drilling: ${s.string} mud ${s.mw} ppg leaves ${s.kickMargin.toFixed(3)} ppg to the shoe above.`);
    }
    if (!(s.mw < s.minFg)) throw new Error(`ASSERT drilling: ${s.string} mud ${s.mw} ppg fractures the open hole.`);
  }
  // The measured offset tests agree: the 17-1/2in mud stays under the 20in
  // FIT, the 8-1/2in mud keeps the kick margin under the 9-5/8in LOT.
  // Ekene-1 only pressured its 20in shoe to the FIT; a FIT is a lower bound.
  // When the 17-1/2in mud reaches it, Ekene-11 must take a full leak-off at
  // its own 20in shoe before drilling ahead (the prognosis, which both LOTs
  // sit on, puts leak-off well above the mud: asserted by the kick margin).
  if (needsLot20 && !(fg(tvd20) - mw17 >= RULES.kick_margin_ppg)) {
    throw new Error(`ASSERT drilling: 17-1/2in mud ${mw17} is over the 20in FIT and inside the kick margin of the prognosis.`);
  }
  if (!(lot958.emw - mw8 >= RULES.kick_margin_ppg)) throw new Error(`ASSERT drilling: 8-1/2in mud ${mw8} is inside the kick margin of the ${lot958.emw} LOT.`);
  // Geology: the 9-5/8in shoe cases off the Ekene Sand and stops above the Oboro Unconformity.
  if (!(tvd958 > topTvd('Ekene Sand Base') && tvd958 < topTvd('Oboro Unconformity'))) {
    throw new Error('ASSERT drilling: the 9-5/8in shoe is not between the Ekene Sand base and the Oboro Unconformity.');
  }

  // Survey through the Suite engine; consistent with geology.mjs and on T1.
  let surveyApartTd = 0;
  const pathE = computeWellPath(stations, { surfaceX: whE, surfaceY: whN, kb: FRAME.kb_m });
  {
    // Same slot, KOP, build rate and azimuth as the 01-wells survey; aimed
    // 8 m deeper, so the two differ by a few metres at TD and no more.
    const g = geoSt[geoSt.length - 1];
    const last = pathE[pathE.length - 1];
    const apart = Math.hypot(last.x - whE - g.ew, last.y - whN - g.ns, last.tvd - g.tvd);
    assertClose('planned survey against 01-wells/surveys/Ekene-11-survey.csv at TD (m)', apart, 0, 5);
    assertClose('azimuth against the 01-wells survey', azimuth, plan.azimuth, 1e-6);
    surveyApartTd = apart;
  }
  const iT1 = stations.findIndex((s) => Math.abs(s.md - fix(t1Md, 2)) < 1e-6);
  const t1Miss = Math.hypot(pathE[iT1].x - Number(T1.easting_m), pathE[iT1].y - Number(T1.northing_m), pathE[iT1].tvd - Number(T1.tvd_m));
  assertClose('Ekene-11 planned survey onto T1', t1Miss, 0, RULES.target_tolerance_m);
  // T2 is the landing point of the horizontal option; this plan is the
  // deviated option, so it is reported, not claimed.
  const t2At = (() => {
    const tv = Number(T2.tvd_m);
    const md = mdAtTvd(Math.min(tv, tvdTd));
    const st = stationsFor([...stations.map((s) => s.md), md]);
    const p = computeWellPath(st, { surfaceX: whE, surfaceY: whN });
    const k = st.findIndex((s) => Math.abs(s.md - fix(md, 2)) < 1e-6);
    return Math.hypot(p[k].x - Number(T2.easting_m), p[k].y - Number(T2.northing_m));
  })();

  const surveyRows = stations.map((s, i) => {
    const prev = stations[i - 1];
    const dls = prev ? ((Math.abs(s.inc - prev.inc)) / (s.md - prev.md)) * 30 : 0;   // single-azimuth plane
    return [n(s.md, 2), n(s.inc, 4), n(s.azi, 4), n(pathE[i].tvd, 3), n(pathE[i].tvd - FRAME.kb_m, 3),
      n(pathE[i].x, 2), n(pathE[i].y, 2), n(dls, 3)];
  });
  write('10-drilling/ekene-11-planned-survey.csv', csvQ(
    ['md_m', 'inclination_deg', 'azimuth_deg_grid', 'tvd_m', 'tvdss_m', 'easting_m', 'northing_m', 'dls_deg_30m'],
    surveyRows,
  ));

  // The studios run on the survey as imported: the file's rounded values.
  const appStations = stations.map((s) => ({ md: fix(s.md, 2), inc: fix(s.inc, 4), azi: fix(s.azi, 4) }));

  // Mud weights as the studios take them (kg/m3, whole numbers).
  const kg = (ppgV) => Math.round(ppgV * PPG);
  write('10-drilling/ekene-11-casing-program.csv', csvQ(
    ['string', 'hole_in', 'casing_od_in', 'weight_lb_ft', 'grade', 'connection', 'top_md_m', 'shoe_md_m', 'shoe_tvd_m',
      'deepest_top_above_shoe', 'hole_mud_ppg', 'hole_mud_kg_m3', 'max_pore_ppg', 'fracture_limit_ppg', 'overbalance_ppg',
      'kick_margin_ppg', 'planned_shoe_test_ppg', 'reason'],
    sections.map((s) => [s.string, s.hole, s.od, s.weight, s.grade, s.conn, n(s.top, 1), n(s.shoe, 1), n(s.shoeTvd, 2),
      formationAt(s.shoe), s.mw === null ? '' : n(s.mw, 1), s.mw === null ? '' : kg(s.mw),
      s.mw === null ? '' : n(s.maxPp, 3), s.mw === null ? '' : n(s.fgLimit, 3),
      s.mw === null ? '' : n(s.overbalance, 3), s.mw === null ? '' : n(s.kickMargin, 3),
      s.shoeTest ? n(s.shoeTest, 2) : '', s.note]),
  ));
  say(`  drilling: Ekene-11 planned survey (${stations.length} stations, T1 missed by ${t1Miss.toFixed(3)} m, TD ${tdMd} m MD / ${tvdTd.toFixed(1)} m TVD); `
    + `casing 20in@${md20}, 13-3/8in@${md1338}, 9-5/8in@${md958}, 7in liner to ${linerShoe} m MD; `
    + `mud ${mw26}/${mw17}/${mw12}/${mw8} ppg`);

  // ==========================================================================
  // 4. The input sheets, and each one run through its app's service
  // ==========================================================================
  const cs958 = sections[3];
  const muds = { m12: kg(mw12), m8: kg(mw8) };

  // --- Casing & Tubing Design Pro: the 9-5/8in string ---------------------
  const fracShoeKg = Math.round(lot958.emw * PPG);           // the LOT at this TVD
  const poreShoeKg = Math.round(pp(tvd958) * PPG);
  const ctPreview = defaultCtDoc({ shoeMdM: tdMd });
  const gasKick = ctPreview.environment.gasGradPaPerM;
  const masp = fracShoeKg * G * tvd958 - gasKick * tvd958;    // the gas-kick case's surface pressure
  const testPressurePa = Math.ceil(masp / 1e6) * 1e6;
  const CT_ROWS = [
    ['Casing Design > Production Casing (section Prod-1)', 'Top MD (m)', 0, 'm', 'the new-case default; the string hangs from the wellhead'],
    ['Casing Design > Production Casing (section Prod-1)', 'Bottom MD (m)', md958, 'm', 'ekene-11-casing-program.csv: 9-5/8in shoe'],
    ['Casing Design > Production Casing (section Prod-1)', 'OD', 9.625, 'in', 'the new-case default (9-5/8in 47 lb/ft L-80 BTC is the program string)'],
    ['Casing Design > Production Casing (section Prod-1)', 'Weight (lb/ft)', 47, 'lb/ft', 'the new-case default'],
    ['Casing Design > Production Casing (section Prod-1)', 'Grade', 'L-80', '', 'the new-case default'],
    ['Casing Design > Production Casing (section Prod-1)', 'Connection', 'BTC', '', 'the new-case default'],
    ['Well & Loads > Pore Pressure & Fracture Gradient', 'Pore EMW at shoe', poreShoeKg, 'kg/m³', `prognosis at ${n(tvd958, 1)} m TVD: ${n(pp(tvd958), 2)} ppg (display only)`],
    ['Well & Loads > Pore Pressure & Fracture Gradient', 'Frac EMW at shoe', fracShoeKg, 'kg/m³', `ekene-lot-fit.csv: the 9-5/8in LOT, ${n(lot958.emw, 2)} ppg at ${n(lot958.tvd, 2)} m TVD`],
    ['Well & Loads > Well Fluids', 'Mud Density', muds.m12, 'kg/m³', `the 12-1/4in hole mud the casing is run in, ${n(mw12, 1)} ppg`],
    ['Well & Loads > Well Fluids', 'Cement Slurry', 1900, 'kg/m³', 'the default; a 15.8 ppg tail slurry'],
    ['Well & Loads > Well Fluids', 'Backup Water', 1030, 'kg/m³', 'seawater at 1.03 SG, the kit frame'],
    ['Well & Loads > Well Fluids', 'Gas Gradient', gasKick, 'Pa/m', 'the default, about 0.10 psi/ft'],
    ['Well & Loads > Well Fluids', 'Design DLS', 2.5, '°/30m', 'the planned build rate (ekene-11-planned-survey.csv)'],
    ['Load Cases > Pressure Test (Burst)', 'Test pressure', testPressurePa, 'Pa', `the gas-kick case's surface pressure (${n(masp / 1e6, 2)} MPa) rounded up to the next MPa`],
    ['Load Cases > Running (Axial)', 'Overpull', 445000, 'N', 'the default, 100 klbf'],
    ['Tubing Design > Packer', 'Packer set', 'off', '', 'this episode designs the casing; the new-case completion is a placeholder, so switch it off'],
    ['Analysis Parameters > Design Factors', 'Burst Factor', 1.1, '', 'the default'],
    ['Analysis Parameters > Design Factors', 'Collapse Factor', 1.0, '', 'the default'],
    ['Analysis Parameters > Design Factors', 'Tension Factor', 1.6, '', 'the default'],
    ['Analysis Parameters > Design Factors', 'Triaxial Factor', 1.25, '', 'the default'],
  ];
  write('10-drilling/casing-tubing-inputs.csv', csvQ(['section', 'field', 'value', 'unit', 'source'], CT_ROWS));
  const ctDoc = defaultCtDoc({ shoeMdM: tdMd });
  Object.assign(ctDoc.strings.casingStrings[0].sections[0], {
    topMdM: 0, bottomMdM: md958, odIn: 9.625, weightLbFt: 47, grade: 'L-80', connection: 'BTC',
  });
  Object.assign(ctDoc.environment, {
    mudKgM3: muds.m12, cementKgM3: 1900, seawaterKgM3: 1030, gasGradPaPerM: gasKick, bendingDlsDegPer30m: 2.5,
    ppfg: { ...ctDoc.environment.ppfg, source: 'manual', ppEmwAtShoeKgM3: poreShoeKg, fracEmwAtShoeKgM3: fracShoeKg },
  });
  ctDoc.loadCases.find((l) => l.kind === 'pressureTestBurst').params.testPressurePa = testPressurePa;
  ctDoc.loadCases.find((l) => l.kind === 'runningAxial').params.overpullN = 445000;
  ctDoc.packer.hasPacker = false;
  const ct = runCasingTubing({ caseDoc: ctDoc, stations: appStations });
  const k = ct.kpis;
  const governing = k.minCollapse.value < k.minBurst.value
    ? { ...k.minCollapse, mode: 'Collapse' } : { ...k.minBurst, mode: 'Burst' };
  if (k.overall === 'FAIL') throw new Error('ASSERT drilling: the 9-5/8in string fails its own load cases.');
  const CTN = {
    burst: fmtSF(k.minBurst.value), burstCase: k.minBurst.caseName,
    collapse: fmtSF(k.minCollapse.value), collapseCase: k.minCollapse.caseName,
    triax: fmtSF(k.minTriaxial.value), tension: fmtSF(k.minTension.value),
    governing: `${governing.caseName} (${governing.mode})`, govTvd: Math.round(governing.tvdM),
  };

  // --- Torque & Drag Studio ------------------------------------------------
  const dc = DRILL_COLLARS[2]; const hw = HWDP[3]; const dp = DRILL_PIPE[3];
  const tdString = [
    { type: 'dc', label: dc.designation, lengthM: 150, odM: dc.odM, idM: dc.idM, weightKgM: dc.weightKgM },
    { type: 'hwdp', label: hw.designation, lengthM: 150, odM: hw.odM, idM: hw.idM, weightKgM: hw.weightKgM, tooljointOdM: hw.tooljointOdM },
    { type: 'dp', label: dp.designation, lengthM: tdMd - 300, odM: dp.odM, idM: dp.idM, weightKgM: dp.weightKgM, tooljointOdM: dp.tooljointOdM, grade: 'S-135', yieldPa: gradeYieldPa('S-135') },
  ];
  const holeSections = holeSectionsFromCasingStrings(ctDoc.strings, tdMd);
  if (holeSections.length !== 2 || !holeSections[0].cased || holeSections[1].cased
    || Math.abs(holeSections[0].to_md_m - md958) > 1e-9 || Math.abs(holeSections[1].hole_id_m - 8.5 * IN) > 1e-9) {
    throw new Error(`ASSERT drilling: hole sections derived from the Casing & Tubing case are not 9-5/8in to the shoe then 8-1/2in: ${JSON.stringify(holeSections)}`);
  }
  const casingQuick = CASING_QUICK.find((c) => Math.abs(c.odM - 9.625 * IN) < 1e-9 && Math.abs(c.idM - holeSections[0].casing_id_m) < 1e-9);
  const tdOps = { wobN: 90e3, bitTorqueNm: 5e3, tripSpeedMs: 0.3, rpm: 120, ops: ['trip_out', 'trip_in', 'rotate_on_bottom'] };
  const tdCase = { string: tdString, mud: { densityKgM3: muds.m8 }, friction: { cased: 0.25, open: 0.35, overrides: [] }, operations: tdOps };
  const tdRes = runTorqueDrag({ stations: appStations, caseRow: tdCase, geometryRow: { hole_sections: holeSections } });
  const TDN = {
    pickup: (tdRes.results.trip_out.summary.hookloadN / 1e3).toFixed(1),
    slackoff: (tdRes.results.trip_in.summary.hookloadN / 1e3).toFixed(1),
    torque: (tdRes.results.rotate_on_bottom.summary.surfaceTorqueNm / 1e3).toFixed(2),
    buckling: tdRes.results.trip_in.summary.bucklingFirstMd,
  };
  const TD_ROWS = [
    ['String & Geometry > Drillstring (bottom up) > Bit end', 'Type', 'Drill collar', '', 'the new-case default BHA'],
    ['String & Geometry > Drillstring (bottom up) > Bit end', 'Catalog', dc.designation, '', 'the new-case default'],
    ['String & Geometry > Drillstring (bottom up) > Bit end', 'Length (m)', 150, 'm', 'the new-case default'],
    ['String & Geometry > Drillstring (bottom up) > 2', 'Type', 'HWDP', '', 'the new-case default'],
    ['String & Geometry > Drillstring (bottom up) > 2', 'Catalog', hw.designation, '', 'the new-case default'],
    ['String & Geometry > Drillstring (bottom up) > 2', 'Length (m)', 150, 'm', 'the new-case default'],
    ['String & Geometry > Drillstring (bottom up) > 3', 'Type', 'Drill pipe', '', 'the new-case default'],
    ['String & Geometry > Drillstring (bottom up) > 3', 'Catalog', dp.designation, '', 'the new-case default'],
    ['String & Geometry > Drillstring (bottom up) > 3', 'Length (m)', tdMd - 300, 'm', `Fill last to TD (TD ${tdMd} m less the 300 m BHA)`],
    ['String & Geometry > Drillstring (bottom up) > 3', 'Grade', 'S-135', '', 'the new-case default'],
    ['String & Geometry > Hole & casing sections > 1', 'From (m)', 0, 'm', 'derived by the app from the Casing & Tubing case (Episode 17)'],
    ['String & Geometry > Hole & casing sections > 1', 'To (m)', md958, 'm', '9-5/8in shoe'],
    ['String & Geometry > Hole & casing sections > 1', 'Cased', 'yes', '', ''],
    ['String & Geometry > Hole & casing sections > 1', 'Casing', casingQuick ? casingQuick.designation : '9-5/8" 47 L-80', '', '9-5/8in 47 lb/ft L-80'],
    ['String & Geometry > Hole & casing sections > 1', 'Hole/Csg ID (in)', n(holeSections[0].casing_id_m / IN, 3), 'in', 'API 5CT drift body ID of 9-5/8in 47 lb/ft'],
    ['String & Geometry > Hole & casing sections > 2', 'From (m)', md958, 'm', ''],
    ['String & Geometry > Hole & casing sections > 2', 'To (m)', tdMd, 'm', 'TD'],
    ['String & Geometry > Hole & casing sections > 2', 'Cased', 'no', '', 'open hole'],
    ['String & Geometry > Hole & casing sections > 2', 'Hole/Csg ID (in)', n(holeSections[1].hole_id_m / IN, 3), 'in', '8-1/2in bit'],
    ['String & Geometry > Mud, friction & operations', 'Mud (kg/m3)', muds.m8, 'kg/m3', `ekene-11-casing-program.csv: 8-1/2in hole mud ${n(mw8, 1)} ppg`],
    ['String & Geometry > Mud, friction & operations', 'FF cased', 0.25, '', 'the default'],
    ['String & Geometry > Mud, friction & operations', 'FF open', 0.35, '', 'the default'],
    ['String & Geometry > Mud, friction & operations', 'WOB (kN)', 90, 'kN', 'about 20 klbf on an 8-1/2in PDC bit'],
    ['String & Geometry > Mud, friction & operations', 'Bit torque (kN-m)', 5, 'kN-m', 'about 3.7 kft-lbf on bottom'],
    ['String & Geometry > Mud, friction & operations', 'Trip speed (m/s)', 0.3, 'm/s', 'the default'],
    ['String & Geometry > Mud, friction & operations', 'RPM', 120, 'rpm', 'the default'],
    ['String & Geometry > Mud, friction & operations', 'Trip out', 'yes', '', 'pick-up'],
    ['String & Geometry > Mud, friction & operations', 'Trip in', 'yes', '', 'slack-off'],
    ['String & Geometry > Mud, friction & operations', 'Rotate on btm', 'yes', '', 'drilling torque'],
  ];
  write('10-drilling/torque-drag-inputs.csv', csvQ(['section', 'field', 'value', 'unit', 'source'], TD_ROWS));

  // --- Hydraulics Studio ---------------------------------------------------
  const fann = { theta600: 68, theta300: 43, theta6: 9, theta3: 8 };   // PV 25 cP, YP 18 lbf/100 ft2
  const flowLpm = 1900;
  const nozzles = [12, 12, 12];
  const hydCase = {
    mud: { densityKgM3: muds.m8, fann, model: 'auto' },
    string: tdString,
    flow: { flowRateM3s: flowLpm / 60000, nozzlesMm: nozzles, surfaceLossPa: 0 },
  };
  const hyd = runHydraulics({ stations: appStations, caseRow: hydCase, geometryRow: { hole_sections: holeSections } });
  const ecdShoe = hyd.ecdProfile.find((r) => Math.abs(r.md - md958) < 1e-6);
  if (!ecdShoe) throw new Error('ASSERT drilling: no ECD row at the 9-5/8in shoe.');
  const ecdTdPpg = hyd.summary.ecdAtTdKgM3 / PPG;
  const ecdShoePpg = ecdShoe.ecdKgM3 / PPG;
  if (!(ecdTdPpg < fg(tvdTd) - 0.5)) throw new Error(`ASSERT drilling: ECD at TD ${ecdTdPpg} is within 0.5 ppg of the fracture gradient.`);
  if (!(ecdShoePpg < lot958.emw - 0.3)) throw new Error(`ASSERT drilling: ECD at the shoe ${ecdShoePpg} is within 0.3 ppg of the LOT.`);
  const HYN = {
    ecdTd: (hyd.summary.ecdAtTdKgM3 / 1000).toFixed(3), ecdTdPpg: ecdTdPpg.toFixed(2), fgTd: fg(tvdTd).toFixed(2),
    ecdShoePpg: ecdShoePpg.toFixed(2), pump: (hyd.summary.pumpPressurePa / 1e3).toFixed(0),
    bit: (hyd.summary.bitDpPa / 1e3).toFixed(0),
  };
  const HY_ROWS = [
    ['Mud & Rheology > Mud properties', 'Density (kg/m3)', muds.m8, 'kg/m3', `8-1/2in hole mud ${n(mw8, 1)} ppg`],
    ['Mud & Rheology > Mud properties', 'Fann 600', fann.theta600, 'dial', 'designed: plastic viscosity 25 cP'],
    ['Mud & Rheology > Mud properties', 'Fann 300', fann.theta300, 'dial', 'designed: yield point 18 lbf/100 ft2'],
    ['Mud & Rheology > Mud properties', 'Fann 6', fann.theta6, 'dial', 'designed low-shear reading'],
    ['Mud & Rheology > Mud properties', 'Fann 3', fann.theta3, 'dial', 'designed low-shear reading'],
    ['Mud & Rheology > Mud properties', 'Model', 'Auto (Herschel-Bulkley)', '', 'the default'],
    ['Mud & Rheology > Drillstring', 'Import string from T&D case', 'the Torque & Drag case of Episode 18', '', 'the same 150 m DC, 150 m HWDP and drill pipe to TD'],
    ['Hydraulics', 'Flow rate (L/min)', flowLpm, 'L/min', 'about 500 gpm for 8-1/2in hole'],
    ['Hydraulics', 'Nozzles (mm, comma separated)', nozzles.join(', '), 'mm', 'three 12 mm jets'],
    ['Hydraulics', 'Surface loss (kPa)', 0, 'kPa', 'the default'],
  ];
  write('10-drilling/hydraulics-inputs.csv', csvQ(['section', 'field', 'value', 'unit', 'source'], HY_ROWS));

  // --- Well Control Studio -------------------------------------------------
  const fracGcc = Number((lot958.emw * PPG / 1000).toFixed(2));   // the field shows g/cc to 2 dp
  const wcCase = {
    string: tdString,
    mud: { densityKgM3: muds.m8 },
    pump: { outputM3PerStroke: 0.012, scr: [{ spm: 30, pressurePa: 4.5e6 }], scrIndex: 0 },
    shoe: { mdM: md958, fracEmwKgM3: fracGcc * 1000 },
    kick: { sidppPa: 2e6, sicpPa: 2.6e6, pitGainM3: 3, influxDensityKgM3: 240, kickIntensityKgM3: 60 },
  };
  const kt = runKickTolerance({ stations: appStations, caseRow: wcCase, geometryRow: { hole_sections: holeSections } });
  const WCN = {
    kt: kt.result.kickToleranceM3.toFixed(2), ktBbl: (kt.result.kickToleranceM3 / BBL).toFixed(1),
    maasp: (kt.result.maaspPa / 1e3).toFixed(0), maaspPsi: (kt.result.maaspPa / 6894.757).toFixed(0),
    shutIn: kt.result.cases.shutInM3.toFixed(2), atShoe: kt.result.cases.atShoeM3.toFixed(2),
  };
  if (!(kt.result.kickToleranceM3 > 0)) throw new Error('ASSERT drilling: no kick tolerance at the 9-5/8in shoe.');
  const WC_ROWS = [
    ['Volumes', `Shoe MD (m)`, md958, 'm', 'ekene-11-casing-program.csv: 9-5/8in shoe'],
    ['Volumes', 'Shoe frac EMW (g/cc)', fracGcc, 'g/cc', `ekene-lot-fit.csv: the 9-5/8in LOT, ${n(lot958.emw, 2)} ppg at ${n(lot958.tvd, 2)} m TVD, the same TVD as this shoe`],
    ['Volumes', 'Mud (kg/m3)', muds.m8, 'kg/m3', `8-1/2in hole mud ${n(mw8, 1)} ppg`],
    ['Volumes', 'Pump output (L/stk)', 12, 'L/stk', 'the default (not used by kick tolerance)'],
    ['Volumes', 'Drillstring', 'import the Torque & Drag case of Episode 18', '', 'annulus capacities at the bit and at the shoe'],
    ['Kick Tolerance', 'Kick intensity (kg/m3)', 60, 'kg/m3', 'the default, 0.5 ppg over the mud'],
    ['Kick Tolerance', 'Influx density (kg/m3)', 240, 'kg/m3', 'the default, gas'],
  ];
  write('10-drilling/well-control-inputs.csv', csvQ(['section', 'field', 'value', 'unit', 'source'], WC_ROWS));

  // ==========================================================================
  // 5. Well Cost & Time: the AFE is the capital the economics domain books
  // ==========================================================================
  const act = [];
  const A = (a) => { act.push({ id: `a${act.length + 1}`, ...a }); return act[act.length - 1].id; };
  A({ kind: 'flat', label: 'Skid the rig to the Ekene-11 slot and spud', durationHr: 12 });
  A({ kind: 'drill', label: 'Jet the 30in conductor (KB to mudline is 60 m)', fromMdM: 0, toMdM: md30, ropMPerHr: 25 });
  const aCond = A({ kind: 'casing', label: 'Release the conductor running tool', mdM: md30, runSpeedMPerHr: 150, flatHr: 6 });
  const a26 = A({ kind: 'drill', label: 'Drill 26in surface hole', fromMdM: md30, toMdM: md20, ropMPerHr: 30 });
  const a20 = A({ kind: 'casing', label: 'Run and cement 20in casing', mdM: md20, runSpeedMPerHr: 250, flatHr: 16 });
  A({ kind: 'flat', label: 'Nipple up and test the BOP', durationHr: 30 });
  const a17 = A({ kind: 'drill', label: 'Drill 17-1/2in intermediate hole', fromMdM: md20, toMdM: md1338, ropMPerHr: 20 });
  A({ kind: 'casing', label: 'Run and cement 13-3/8in casing', mdM: md1338, runSpeedMPerHr: 220, flatHr: 18 });
  A({ kind: 'flat', label: 'Drill out and leak-off test at the 13-3/8in shoe', durationHr: 6 });
  const a12a = A({ kind: 'drill', label: 'Drill 12-1/4in hole, first bit', fromMdM: md1338, toMdM: 1650, ropMPerHr: 14 });
  A({ kind: 'trip', label: 'Bit trip in the 12-1/4in hole', mdM: 1650, tripSpeedMPerHr: 300 });
  const a12b = A({ kind: 'drill', label: 'Drill 12-1/4in hole to the 9-5/8in shoe', fromMdM: 1650, toMdM: md958, ropMPerHr: 12 });
  A({ kind: 'casing', label: 'Run and cement 9-5/8in casing', mdM: md958, runSpeedMPerHr: 200, flatHr: 20 });
  A({ kind: 'flat', label: 'Drill out and leak-off test at the 9-5/8in shoe', durationHr: 6 });
  const a8 = A({ kind: 'drill', label: 'Drill 8-1/2in hole through the Oboro Sand to TD', fromMdM: md958, toMdM: tdMd, ropMPerHr: 9 });
  const aLog = A({ kind: 'flat', label: 'Wireline logging across the Oboro Sand', durationHr: 30 });
  const aLiner = A({ kind: 'casing', label: 'Run and cement the 7in liner', mdM: linerShoe, runSpeedMPerHr: 180, flatHr: 24 });
  const aComp = A({ kind: 'flat', label: 'Complete: sand screens, tubing, perforate, clean up and test', durationHr: 160 });
  A({ kind: 'flat', label: 'Rig down and skid off the slot', durationHr: 12 });
  void a26; void a12a; void a12b;

  const program = { activities: act, nptFrac: 0.15 };
  const contingencyFrac = 0.10;
  const items = [
    { id: 'k1', label: 'Rig dayrate', category: 'intangible', basis: 'per-day', rate: 130000 },
    { id: 'k2', label: 'Integrated services spread', category: 'intangible', basis: 'per-day', rate: 0 },
    { id: 'k3', label: 'Marine and aviation logistics', category: 'intangible', basis: 'per-day', rate: 28000 },
    { id: 'k4', label: 'Mud and consumables', category: 'intangible', basis: 'per-meter', rate: 220 },
    { id: 'k5', label: 'Bits and downhole tools', category: 'intangible', basis: 'per-meter', rate: 120 },
    { id: 'k6', label: 'Conductor, wellhead and tree', category: 'tangible', basis: 'lump', value: 1150000, atActivityId: a20 },
    { id: 'k7', label: 'Casing, liner and accessories', category: 'tangible', basis: 'lump', value: 1650000, atActivityId: aLiner },
    { id: 'k8', label: 'Cementing services', category: 'intangible', basis: 'lump', value: 480000, atActivityId: aLiner },
    { id: 'k9', label: 'Wireline logging', category: 'intangible', basis: 'lump', value: 380000, atActivityId: aLog },
    { id: 'k10', label: 'Completion equipment and sand screens', category: 'tangible', basis: 'lump', value: 1450000, atActivityId: aComp },
  ];
  void aCond;
  // Tune the one open rate (the services spread) so the AFE total is the
  // Ekene-11 capital the economics domain books, rounded to 100 USD/day.
  const probe = runDeterministic({ caseDoc: { program, costs: { items, contingencyFrac } } });
  const days = probe.kpis.totalDays;
  const need = EKENE11.dc_cost_usd / (1 + contingencyFrac) - probe.kpis.baseUsd;
  items[1].rate = Math.round(need / days / 100) * 100;
  if (!(items[1].rate > 20000 && items[1].rate < 120000)) {
    throw new Error(`ASSERT drilling: the services spread solves to ${items[1].rate} USD/day, outside a believable range.`);
  }
  const risk = {
    iterations: 2000,
    seed: 20270115,
    uncertainties: [
      { target: 'activity', id: a17, field: 'ropMPerHr', dist: { type: 'triangular', min: 12, mode: 20, max: 28 } },
      { target: 'activity', id: a8, field: 'ropMPerHr', dist: { type: 'triangular', min: 5, mode: 9, max: 12 } },
      { target: 'activity', id: aComp, field: 'durationHr', dist: { type: 'triangular', min: 130, mode: 160, max: 240 } },
      { target: 'item', id: 'k7', field: 'value', dist: { type: 'triangular', min: 1550000, mode: 1650000, max: 1950000 } },
    ],
  };
  const draft = {
    name: 'Ekene-11 AFE',
    program,
    costs: { items, contingencyFrac },
    risk,
    params: {},
    notes: `Ekene-11, Oboro Sand producer from Ekene Alpha. Spud ${EKENE11.spud}. Casing program and mud weights from ekene-11-casing-program.csv. `
      + `The services spread rate is the one number tuned: it makes the AFE total the ${usd(EKENE11.dc_cost_usd)} the economics episode books. `
      + `Risked run: ${risk.iterations} iterations at seed ${risk.seed}.`,
  };
  const wctText = caseFileText(draft);
  write('10-drilling/ekene-11-well-cost.wct.json', wctText);
  const loaded = caseDocFromFile(wctText);
  const det = runDeterministic({ caseDoc: loaded });
  const errFrac = Math.abs(det.kpis.totalUsd - EKENE11.dc_cost_usd) / EKENE11.dc_cost_usd;
  assertClose('Ekene-11 AFE total against EKENE11.dc_cost_usd (fraction)', errFrac, 0, 0.01);
  const mc = runMonteCarlo({ caseDoc: loaded });
  const WCT = {
    total: usd(det.kpis.totalUsd), base: usd(det.kpis.baseUsd), days: det.kpis.totalDays.toFixed(1),
    spread: items[1].rate.toLocaleString('en-US'),
    p10: usd(mc.cost.p10), p50: usd(mc.cost.p50), p90: usd(mc.cost.p90),
    d10: mc.days.p10.toFixed(1), d50: mc.days.p50.toFixed(1), d90: mc.days.p90.toFixed(1),
  };
  say(`  drilling: C&T min burst ${CTN.burst} (${CTN.burstCase}), min collapse ${CTN.collapse} (${CTN.collapseCase}); `
    + `T&D pick-up ${TDN.pickup} kN, slack-off ${TDN.slackoff} kN; ECD at TD ${HYN.ecdTdPpg} ppg vs FG ${HYN.fgTd}; `
    + `kick tolerance ${WCN.kt} m3 (${WCN.ktBbl} bbl); AFE ${WCT.total} over ${WCT.days} days (P50 base ${WCT.p50})`);

  write('10-drilling/README-drilling.md', [
    '# Drilling: Ekene-11', '',
    'Ekene-11 is the well Episode 10 designs from Ekene Alpha. This folder carries it from trajectory to AFE:',
    'the planned survey, the casing program and mud weights, one input sheet per drilling studio and a',
    'Well Cost & Time case file. Every number here is derived from the rest of the kit, and every headline',
    'the episode notes quote is what the studio\'s own engine returns for these inputs.', '',
    '| File | What it is |', '|---|---|',
    '| `ekene-11-planned-survey.csv` | the trajectory, MD, inclination and grid azimuth first; import it in Well Design Studio |',
    '| `ekene-11-casing-program.csv` | strings, shoes, hole sizes, mud weights and the pressure window for each hole section |',
    '| `casing-tubing-inputs.csv` | Casing & Tubing Design Pro, the 9-5/8in string |',
    '| `torque-drag-inputs.csv` | Torque & Drag Studio at TD in the 8-1/2in hole |',
    '| `hydraulics-inputs.csv` | Hydraulics Studio at TD |',
    '| `well-control-inputs.csv` | Well Control Studio, kick tolerance at the 9-5/8in shoe |',
    '| `ekene-11-well-cost.wct.json` | Well Cost & Time case file (Import case) |', '',
    'Each input sheet has the columns `section, field, value, unit, source`. Section and field are the',
    'labels on the studio\'s own screen; source says where the value came from.', '',
    '## The trajectory', '',
    `Build and hold from Ekene Alpha: vertical to ${plan.kop} m, build at ${plan.buildRate} degrees per 30 m to`,
    `${n(theta, 2)} degrees at ${n(holdStart, 1)} m MD, hold on grid azimuth ${n(azimuth, 2)} degrees to TD at ${tdMd} m MD`,
    `(${n(tvdTd, 1)} m TVD). It is \`01-wells/surveys/Ekene-11-survey.csv\` (same slot, KOP, build rate and`,
    `azimuth) aimed 8 m deeper at T1 itself, so the two are ${n(surveyApartTd, 1)} m apart at TD;`,
    `it carries stations at the target and at each shoe. It passes ${t1Miss.toFixed(2)} m from the centre of target T1 (radius ${T1.radius_m} m) at`,
    `${n(t1Md, 1)} m MD. T2 is the landing point of the horizontal option, a separate design: this deviated plan`,
    `passes ${Math.round(t2At)} m from it and does not claim it.`, '',
    '## How the casing program was set', '',
    'Pore pressure and fracture gradient are the designed prognosis in `05-pressure`, read at Ekene-11\'s own',
    'TVD. The Ekene-1 shoe tests sit on that prognosis (both LOTs on the fracture curve, the FIT 0.6 ppg under',
    'it), which is what makes the prognosis usable for a well with no logs. Two rules, worked bottom up:', '',
    `- mud weight is the highest pore pressure in the open hole plus ${RULES.trip_margin_ppg} ppg, rounded up to ${RULES.mw_step_ppg} ppg;`,
    `- the fracture gradient at the shoe above must exceed that mud weight by at least ${RULES.kick_margin_ppg} ppg.`, '',
    `The 9-5/8in shoe is set at the TVD of Ekene-1's 9-5/8in shoe (${n(lot958.tvd, 2)} m), so the 8-1/2in section is`,
    `limited by a measured leak-off of ${n(lot958.emw, 2)} ppg. The 13-3/8in shoe is the shallowest ${RULES.shoe_md_step_m} m step`,
    'whose fracture gradient keeps the kick margin over the 12-1/4in mud. The 20in shoe sits at Ekene-1\'s,',
    needsLot20
      ? `where Ekene-1's FIT held ${n(fit20.emw, 2)} ppg. A FIT only shows the shoe held that much; the 17-1/2in mud is ${n(mw17, 1)} ppg, so the program takes a full leak-off at the Ekene-11 20in shoe (the prognosis, which both Ekene-1 LOTs sit on, expects ${n(fg(tvd20), 2)} ppg) before drilling ahead.`
      : `where the FIT held ${n(fit20.emw, 2)} ppg, above every mud weight used beneath it.`,
  ].join('\n'));

  // ==========================================================================
  // 6. Episodes 17-20
  // ==========================================================================
  const episodes = [
    { n: 17, app: 'Casing & Tubing Design Pro', files: [
      ['10-drilling/ekene-11-planned-survey.csv', 'the Ekene-11 trajectory; import it in Well Design Studio first'],
      ['10-drilling/ekene-11-casing-program.csv', 'shoes, hole sizes and mud weights, with the pressure window of every section'],
      ['10-drilling/casing-tubing-inputs.csv', 'every value to type, by tab and field'],
      ['05-pressure/ekene-lot-fit.csv', `the 9-5/8in LOT (${n(lot958.emw, 2)} ppg) that becomes the frac EMW at the shoe`],
    ], note: 'Set up the trajectory first. In Well Design Studio, on the Ekene-11 wellbore (metres), open Surveys, New, '
      + 'source CSV / Excel file, pick ekene-11-planned-survey.csv; the columns map themselves (md_m, inclination_deg, '
      + 'azimuth_deg_grid). Set the Azimuths are field to Grid north and MD unit to Metres, save, then tick In definitive composite. '
      + 'Every drilling studio now reads it as the Actual survey composite. If Episode 10 left a definitive design on '
      + 'Ekene-11, the studios prefer that design, so add a new wellbore for this series instead. '
      + `In Casing & Tubing Design Pro create a case: it opens with one 9-5/8in 47 L-80 BTC string to TD. Set its Bottom MD to ${md958} m, `
      + `then type the Well & Loads and Load Cases values from casing-tubing-inputs.csv (mud ${muds.m12} kg/m³, frac EMW at shoe ${fracShoeKg} kg/m³, `
      + `test pressure ${testPressurePa} Pa, which is ${testPressurePa / 1e6} MPa) and switch Packer set off on Tubing Design. Min Burst SF reads ${CTN.burst} (${CTN.burstCase}), Min Coll SF ${CTN.collapse} `
      + `(${CTN.collapseCase}), Min Triaxial SF ${CTN.triax}, and the controlling load is ${CTN.governing} at ${CTN.govTvd} m TVD. `
      + `The shoes come from the pressure data: mud ${n(mw26, 1)}, ${n(mw17, 1)}, ${n(mw12, 1)} and ${n(mw8, 1)} ppg in the 26, 17-1/2, 12-1/4 and 8-1/2in holes, each at least `
      + `${RULES.trip_margin_ppg} ppg over the pore pressure and ${RULES.kick_margin_ppg} ppg under the fracture gradient at the shoe above.`
      + (needsLot20 ? ` The ${n(mw17, 1)} ppg 17-1/2in mud is above the ${n(fit20.emw, 2)} ppg FIT Ekene-1 took at 600 m, so the program calls for a full leak-off at the Ekene-11 20in shoe.` : '') },
    { n: 18, app: 'Torque & Drag Studio and Hydraulics Studio', files: [
      ['10-drilling/torque-drag-inputs.csv', 'the drillstring, hole sections and operations at TD'],
      ['10-drilling/hydraulics-inputs.csv', 'mud, rheology, flow rate and nozzles'],
      ['10-drilling/ekene-11-casing-program.csv', `the 8-1/2in mud (${n(mw8, 1)} ppg) and the fracture gradient it must stay under`],
    ], note: 'Both studios read the trajectory from Episode 17 and derive the hole sections from its Casing & Tubing case: '
      + `9-5/8in casing to ${md958} m, 8-1/2in open hole to ${tdMd} m. Check them on the String & Geometry tab and Save to make them the plan of record. `
      + `Torque & Drag: new case, keep the default string and press Fill last to TD, set Mud (kg/m3) to ${muds.m8}, WOB 90 kN and bit torque 5 kN-m. `
      + `Run analysis: pick-up hookload ${TDN.pickup} kN, slack-off ${TDN.slackoff} kN (the Trip in curve on the broomstick) and `
      + `${TDN.torque} kN-m surface torque drilling on bottom, with the default friction factors 0.25 cased and 0.35 open. `
      + `Hydraulics: new case, import the string from the T&D case, density ${muds.m8} kg/m3, Fann 68, 43, 9 and 8, flow 1900 L/min, nozzles 12, 12, 12. `
      + `Run hydraulics: ECD at TD ${HYN.ecdTd} g/cc (${HYN.ecdTdPpg} ppg) against a fracture gradient of ${HYN.fgTd} ppg there, `
      + `and ${HYN.ecdShoePpg} ppg at the 9-5/8in shoe against its ${n(lot958.emw, 2)} ppg LOT. Pump pressure ${HYN.pump} kPa.` },
    { n: 19, app: 'Well Control Studio', files: [
      ['10-drilling/well-control-inputs.csv', 'shoe, frac EMW, mud and kick values'],
      ['05-pressure/ekene-lot-fit.csv', 'the LOT the frac EMW comes from'],
    ], note: `New case, import the string from the T&D case. On Volumes set Shoe MD ${md958} m, Shoe frac EMW ${fracGcc} g/cc `
      + `(the ${n(lot958.emw, 2)} ppg LOT: this shoe sits at the TVD where Ekene-1 measured it) and Mud ${muds.m8} kg/m3. `
      + `Compute kick tolerance with the default 60 kg/m3 kick intensity and 240 kg/m3 gas: MAASP ${WCN.maasp} kPa (${WCN.maaspPsi} psi), `
      + `kick tolerance ${WCN.kt} m3 (${WCN.ktBbl} bbl), the smaller of the shut-in case (${WCN.shutIn} m3) and the circulated-to-shoe case (${WCN.atShoe} m3). `
      + 'That is small, and it is the honest answer for 8-1/2in hole at this mud weight under this shoe: the sweep chart '
      + 'shows how quickly it grows as the mud gets lighter, which is why the program holds the trip margin to 0.3 ppg.' },
    { n: 20, app: 'Well Cost & Time', files: [
      ['10-drilling/ekene-11-well-cost.wct.json', 'the whole estimate as one case file: program, AFE items, risk model and seed'],
      ['10-drilling/ekene-11-casing-program.csv', 'the sections the time program drills'],
    ], note: 'Import case and pick the file; it creates the estimate Ekene-11 AFE with nothing to type. '
      + `Time Program: ${act.length} activities, 15 percent NPT, ${WCT.days} days. AFE Cost: base ${WCT.base}, 10 percent contingency, `
      + `total ${WCT.total}. That total is the Ekene-11 capital the economics episode books (${usd(EKENE11.dc_cost_usd)}); `
      + `the services spread (${WCT.spread} USD per day) is the one rate tuned to land it. `
      + `Risk: Run Monte Carlo (${risk.iterations} iterations, seed ${risk.seed}) gives base cost P10 ${WCT.p10}, P50 ${WCT.p50}, P90 ${WCT.p90} `
      + `and ${WCT.d10}, ${WCT.d50} and ${WCT.d90} days. The risked cost is the base without contingency, because the risk model replaces the provision.` },
  ];

  return {
    episodes,
    folders: [['10-drilling', 'Ekene-11 planned survey, casing program and mud weights, drilling studio input sheets, Well Cost & Time case']],
  };
}
