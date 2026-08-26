// Drilling engine hard validation gate (Well Design Studio program).
// Mirrors tools/validation/mbal-validation.ts: every ACTIVE gate must
// pass or the process exits 1. Gates whose published source data the
// owner has not yet supplied are ARMED (schema + tolerance committed,
// reported as pending, never silently passed).
//
// Run:  npx tsx tools/validation/drilling-validation.ts
//
// ACTIVE gates (self-contained truth):
//   A1 closed-form circle exactness   (arc_vertical_plane.json)
//   A2 toolface spherical triangle    (toolface_sphere.json)
//   A3 TVD-plane crossings            (tvd_crossings.json)
//   A4 survey listing m + ft          (survey_table.json)
//   A5 build-hold closed form         (compile_buildhold.json)
//   A6 WMM2025 vs the official NOAA test values (wmm2025_noaa_testvalues.json)
//   A7 ISCWSA MWD Rev4 error model vs official example Well #1
//      (iscwsa_mwd_rev4_well1.json — the former ARMED L4, activated in
//      WD4 when the official iscwsa.net workbook data was secured)
//   A8 ISCWSA separation rule vs the official clearance example wells
//      (iscwsa_clearance_wells.json, published per-station SFs)
//   A9 ADE ch.8 survey-calculation example (the former ARMED L1,
//      activated when the published values were secured via the
//      attributed open-access republication, Amorin & Broni-Bediako
//      2010 RJASET 2(7):679-686; ade_ch8_survey_methods.json)
//   A10 soft-string T&D closed forms + oracle golden agreement
//      (torquedrag_cases.json — Drilling D1; independent RK4 oracle)
//   A11 capstan limit: weightless arc converges to T·e^{μβ}
//   A12 casing wear crescent geometry + energy model round-trip
//      (casingwear_cases.json)
//   A13 rheology fits + Newtonian/power-law laminar closed forms
//      (Drilling D2; hydraulics_cases.json)
//   A14 circulating losses / bit / ECD vs the independent oracle
//   A15 surge-swab + hole-cleaning slip velocities vs the oracle
//   A16 kill sheet + volumes closed forms + oracle agreement
//      (Drilling D3; wellcontrol_cases.json incl. the self-asserting
//      IWCF-style fixture)
//   A17 kick tolerance + Boyle + MAASP vs the oracle
// ARMED gates (pending owner literature PDFs):
//   L2 Mitchell & Miska, Fundamentals of Drilling Engineering survey table
//   L3 Amoco/API MD-TVD table (the Amoco Directional Survey Handbook,
//      BPA-D-004, is publicly viewable on document-sharing sites but
//      blocked to scripted download — drop the PDF in
//      /root/wds-literature/ to arm extraction)
//   L4 Mitchell & Miska torque & drag worked example (same book as L2)
//   L5 Johancsik SPE 11380 field cases (owner PDF; chart-read data,
//      tolerance band to be set at extraction)
//   L6 ADE ch.4 (Bourgoyne et al.) hydraulics worked example (owner PDF
//      or attributed open-access republication, the A9 route)
//   L7 API RP 13D worked example well (owner PDF)
//   L8 IWCF/IADC kill sheet worked example (owner PDF)
//   L9 ADE worked kick and kill example (owner PDF)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dirname = path.dirname(fileURLToPath(import.meta.url));
const goldens = (name: string) => JSON.parse(fs.readFileSync(
  path.join(dirname, '..', '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', name), 'utf8',
));

async function main() {
  const { computeWellPath, mdsAtTvd, computeSurveyTable } = await import(
    '../../packages/engines/engines/drilling/surveyMath.js');
  const { compileSegments, attitudeAfterArc } = await import(
    '../../packages/engines/engines/drilling/segmentCompiler.js');
  const { fieldAt } = await import(
    '../../packages/engines/engines/drilling/magnetics.js');
  const { computeErrorModel } = await import(
    '../../packages/engines/engines/drilling/errorModel.js');
  const { computeTorqueDrag } = await import(
    '../../packages/engines/engines/drilling/torqueDrag.js');
  const { grooveArea, grooveDepthForArea, slidingDistanceM } = await import(
    '../../packages/engines/engines/drilling/casingWear.js');
  const { fitModels } = await import(
    '../../packages/engines/engines/drilling/rheology.js');
  const { computeHydraulics, elementLoss } = await import(
    '../../packages/engines/engines/drilling/hydraulics.js');
  const { computeSurgeSwab } = await import(
    '../../packages/engines/engines/drilling/surgeSwab.js');
  const { computeHoleCleaning } = await import(
    '../../packages/engines/engines/drilling/holeCleaning.js');
  const { wellVolumes, annulusCapAt, killSheet, kickTolerance, boyle, maaspPa: maaspFn, tvdAt } = await import(
    '../../packages/engines/engines/drilling/wellControl.js');
  const { computeClearance } = await import(
    '../../packages/engines/engines/drilling/antiCollision.js');

  let failures = 0;
  const gate = (id: string, name: string, fn: () => void) => {
    try {
      fn();
      console.log(`PASS  ${id}  ${name}`);
    } catch (e: any) {
      failures += 1;
      console.error(`FAIL  ${id}  ${name}: ${e.message}`);
    }
  };
  const close = (a: number, b: number, tol: number, what: string) => {
    if (!(Math.abs(a - b) <= tol)) {
      throw new Error(`${what}: ${a} vs ${b} (tol ${tol})`);
    }
  };
  const toStations = (rows: number[][]) => rows.map(([md, inc, azi]) => ({ md, inc, azi }));

  gate('A1', 'closed-form circle exactness', () => {
    for (const c of goldens('arc_vertical_plane.json').cases) {
      const p = computeWellPath(toStations(c.stations));
      c.expected.forEach((exp: any, i: number) => {
        close(p[i].x, exp.e, 1e-6, `case azi ${c.aziDeg} station ${i} E`);
        close(p[i].y, exp.n, 1e-6, `case azi ${c.aziDeg} station ${i} N`);
        close(p[i].tvd, exp.tvd, 1e-6, `case azi ${c.aziDeg} station ${i} TVD`);
      });
    }
  });

  gate('A2', 'toolface spherical triangle vs vector rotation', () => {
    for (const c of goldens('toolface_sphere.json').cases) {
      const a = attitudeAfterArc(c.inc1, c.azi1, c.betaDeg * Math.PI / 180, c.toolfaceDeg);
      close(a.inc, c.inc2, 1e-7, 'inc');
      const dAzi = ((a.azi - c.azi2) % 360 + 540) % 360 - 180;
      close(dAzi, 0, 1e-7, 'azi');
    }
  });

  gate('A3', 'TVD-plane crossings vs dense-sampled oracle', () => {
    const g = goldens('tvd_crossings.json');
    const st = toStations(g.stations);
    const p = computeWellPath(st);
    for (const c of g.cases) {
      const mds = mdsAtTvd(st, p, c.tvd);
      if (mds.length !== c.mds.length) {
        throw new Error(`tvd ${c.tvd}: ${mds.length} crossings vs ${c.mds.length}`);
      }
      mds.forEach((md: number, i: number) => close(md, c.mds[i], 1e-4, `tvd ${c.tvd} crossing ${i}`));
    }
  });

  gate('A4', 'survey listing (m and ft, incl. the ft-rate regression class)', () => {
    const g = goldens('survey_table.json');
    for (const key of ['metric', 'feet'] as const) {
      const c = g[key];
      const rows = computeSurveyTable(toStations(c.stations), {
        mdUnit: c.mdUnit, vsAzimuthDeg: c.vsAzimuthDeg,
      });
      c.rows.forEach((exp: any, i: number) => {
        close(rows[i].tvd, exp.tvd, 1e-6, `${key} row ${i} tvd`);
        close(rows[i].dls30m, exp.dls30m, 1e-6, `${key} row ${i} dls30m`);
        close(rows[i].dls100ft, exp.dls100ft, 1e-6, `${key} row ${i} dls100ft`);
        close(rows[i].vs, exp.vs, 1e-6, `${key} row ${i} vs`);
      });
    }
  });

  gate('A5', 'build-hold closed form via the segment compiler', () => {
    for (const c of goldens('compile_buildhold.json').cases) {
      const { stations, path: p } = compileSegments({
        mdUnit: c.mdUnit,
        tieOn: { md: 0, inc: 0, azi: c.aziDeg },
        segments: [
          { kind: 'hold', length: c.kop },
          { kind: 'build', rate: c.rate, targetInc: c.targetInc },
          { kind: 'hold', length: c.holdLen },
        ],
      });
      const last = p[p.length - 1];
      close(stations[stations.length - 1].inc, c.endInc, 1e-9, `${c.mdUnit} end inc`);
      close(last.tvd, c.endTvd, 1e-4, `${c.mdUnit} end tvd`);
      close(last.y, c.endN, 1e-4, `${c.mdUnit} end N`);
      close(last.x, c.endE, 1e-4, `${c.mdUnit} end E`);
    }
  });

  gate('A6', 'WMM2025 vs the official NOAA test-value table', () => {
    const g = goldens('wmm2025_noaa_testvalues.json');
    for (const c of g.mainField) {
      const f = fieldAt({
        latDeg: c.latDeg, lonDeg: c.lonDeg, heightKm: c.heightKm, decimalYear: c.date,
      });
      const tag = `${c.date} h${c.heightKm} lat${c.latDeg} lon${c.lonDeg}`;
      close(f.x, c.x, 0.06, `${tag} X`);
      close(f.y, c.y, 0.06, `${tag} Y`);
      close(f.z, c.z, 0.06, `${tag} Z`);
      close(f.f, c.f, 0.06, `${tag} F`);
      close(f.declinationDeg, c.d, 0.006, `${tag} D`);
      close(f.inclinationDeg, c.i, 0.006, `${tag} I`);
      if (c.gv != null) close(f.gridVariationDeg, c.gv, 0.006, `${tag} GV`);
    }
    for (const c of g.secularVariation) {
      const f = fieldAt({
        latDeg: c.latDeg, lonDeg: c.lonDeg, heightKm: c.heightKm, decimalYear: c.date,
      });
      const tag = `SV ${c.date} h${c.heightKm} lat${c.latDeg}`;
      close(f.xDot, c.xDot, 0.06, `${tag} Xdot`);
      close(f.yDot, c.yDot, 0.06, `${tag} Ydot`);
      close(f.zDot, c.zDot, 0.06, `${tag} Zdot`);
      close(f.declinationDotDeg, c.dDot, 0.006, `${tag} Ddot`);
    }
  });

  gate('A7', 'ISCWSA MWD Rev4 error model vs official example Well #1', () => {
    const g = goldens('iscwsa_mwd_rev4_well1.json');
    const stations = g.survey.md.map((md: number, i: number) => ({
      md, inc: g.survey.inc[i], azi: g.survey.azi[i],
    }));
    const result = computeErrorModel(stations, g.header);
    const mdIndex = new Map(g.survey.md.map((md: number, i: number) => [md, i]));
    const bySource = new Map(result.sources.map((s: any) => [s.code, s]));
    const comps = (cov: number[][]) => ({
      nn: cov[0][0], ee: cov[1][1], vv: cov[2][2],
      ne: cov[0][1], nv: cov[0][2], ev: cov[1][2],
    });
    for (const row of g.perSource) {
      const i = mdIndex.get(row.md) as number;
      const cov = row.source === 'Totals'
        ? result.totalCov[i]
        : (bySource.get(row.source) as any).covNEV[i];
      const got: any = comps(cov);
      const exp: any = { nn: row.nn, ee: row.ee, vv: row.vv, ne: row.ne, nv: row.nv, ev: row.ev };
      const scale = Math.max(1e-9, ...Object.values(exp).map((v: any) => Math.abs(v)));
      for (const key of Object.keys(exp)) {
        close(got[key] / scale, exp[key] / scale, 1e-8, `${row.md} ${row.source} ${key}`);
      }
    }
    for (let i = 0; i < g.survey.md.length; i++) {
      const got: any = comps(result.totalCov[i]);
      const exp: any = {
        nn: g.totalsAll.nn[i], ee: g.totalsAll.ee[i], vv: g.totalsAll.vv[i],
        ne: g.totalsAll.ne[i], nv: g.totalsAll.nv[i], ev: g.totalsAll.ev[i],
      };
      const scale = Math.max(1e-9, ...Object.values(exp).map((v: any) => Math.abs(v)));
      for (const key of Object.keys(exp)) {
        close(got[key] / scale, exp[key] / scale, 1e-8, `totals@${g.survey.md[i]} ${key}`);
      }
    }
  });

  gate('A8', 'ISCWSA separation rule vs official clearance example wells', () => {
    const g = goldens('iscwsa_clearance_wells.json');
    const build = (name: string, radius: number) => {
      const w = g.wells[name];
      const stations = w.md.map((md: number, i: number) => ({
        md, inc: w.inc[i], azi: w.azi[i], tvd: w.tvd[i],
      }));
      const positions = w.md.map((_: number, i: number) => ({
        n: w.n[i], e: w.e[i], tvd: w.tvd[i],
      }));
      const model = computeErrorModel(stations, w.header);
      return { stations, positions, cov: model.totalCov, sources: model.sources, radius };
    };
    const reference = build('Reference well', g.acr.refRadius);
    for (const name of Object.keys(g.wells)) {
      if (name === 'Reference well') continue;
      const clearance = computeClearance(reference, build(name, g.acr.offRadius), {
        k: g.acr.k, sigmaPa: g.acr.sigmaPa, Sm: g.acr.Sm,
        kopDepth: g.oracle[name].kopDepth,
      });
      const sfOfficial = g.wells[name].sfOfficial;
      if (clearance.sf.length !== sfOfficial.length) {
        throw new Error(`${name}: ${clearance.sf.length} stations vs ${sfOfficial.length} published`);
      }
      for (let i = 0; i < sfOfficial.length; i++) {
        // official criteria: |got - exp| <= 1e-3 + 1e-2|exp|
        close(clearance.sf[i], sfOfficial[i], 1e-3 + 1e-2 * Math.abs(sfOfficial[i]), `${name} SF@${clearance.md[i]}`);
      }
    }
  });

  gate('A9', 'ADE ch.8 survey-calculation example (Bourgoyne et al. 1991)', () => {
    const g = goldens('ade_ch8_survey_methods.json');
    const stations = g.survey.md.map((md: number, i: number) => ({
      md, inc: g.survey.inc[i], azi: g.survey.azi[i],
    }));
    const p = computeWellPath(stations, { surfaceX: 0, surfaceY: 0, kb: 0 });
    const last = p[p.length - 1];
    const exp = g.expected.minimumCurvature;
    close(last.tvd, exp.tvd, g.expected.tolerance, 'TVD at TD');
    close(last.y, exp.northDisplacement, g.expected.tolerance, 'north displacement at TD');
    close(last.x, 0, 1e-9, 'east displacement (due-north well)');
  });

  gate('A10', 'soft-string T&D closed forms + oracle golden agreement', () => {
    const g = goldens('torquedrag_cases.json');
    // Closed form: straight slant T = wL(cosθ ± μ sinθ), exact.
    const bf = 1 - 1440 / 7850;
    const w = 33.126529 * 9.80665 * bf;
    const theta = 30 * Math.PI / 180;
    const slantStations = [{ md: 0, inc: 30, azi: 45 }, { md: 1500, inc: 30, azi: 45 }];
    const slantGeom = [{ fromMd: 0, toMd: 1500, frictionFactor: 0.3, holeIdM: 0.2159, cased: false }];
    const slantString = [{ type: 'dp', lengthM: 1500, odM: 0.127, idM: 0.1086, weightKgM: 33.126529 }];
    for (const [op, sign] of [['trip_out', 1], ['trip_in', -1]] as [string, number][]) {
      const res = computeTorqueDrag({
        stations: slantStations, string: slantString, geometry: slantGeom,
        mud: { densityKgM3: 1440 }, operation: op, params: { stepM: 50 },
      });
      const exp = w * 1500 * (Math.cos(theta) + sign * 0.3 * Math.sin(theta));
      close(res.summary.hookloadN, exp, 1e-6 * Math.abs(exp), `slant ${op}`);
    }
    // Oracle agreement on every golden well × operation (rtol 1e-4 + floors).
    for (const c of g.cases) {
      for (const [op, exp] of Object.entries(c.expected) as [string, any][]) {
        const res = computeTorqueDrag({
          stations: c.stations, string: c.string, geometry: c.geometry,
          mud: { densityKgM3: c.mudDensityKgM3 }, operation: op,
          params: { ...c.params, stepM: 1 },
        });
        close(res.summary.hookloadN, exp.hookloadN, 200 + 1e-4 * Math.abs(exp.hookloadN), `${c.name}/${op} hookload`);
        close(res.summary.surfaceTorqueNm, exp.surfaceTorqueNm, 5 + 1e-4 * Math.abs(exp.surfaceTorqueNm), `${c.name}/${op} torque`);
      }
    }
  });

  gate('A11', 'capstan limit: weightless arc converges to T·e^{μβ}', () => {
    const stations: { md: number; inc: number; azi: number }[] = [];
    for (let md = 0; md <= 900; md += 30) stations.push({ md, inc: md / 10, azi: 0 });
    const res = computeTorqueDrag({
      stations,
      string: [{ type: 'dp', lengthM: 900, odM: 0.127, idM: 0.1086, weightKgM: 0 }],
      geometry: [{ fromMd: 0, toMd: 900, frictionFactor: 0.3, holeIdM: 0.2159, cased: false }],
      mud: { densityKgM3: 0 }, operation: 'slide_drill',
      params: { stepM: 0.5, wobN: 100000 },
    });
    const capstan = -100000 * Math.exp(0.3 * Math.PI / 2);
    close(res.summary.hookloadN, capstan, 1e-3 * Math.abs(capstan), 'capstan compression');
  });

  gate('A12', 'casing wear crescent geometry + energy model round-trip', () => {
    const g = goldens('casingwear_cases.json');
    const R = g.casing.irM;
    const r = g.tjRadiusM;
    for (const { depthM, areaM2 } of g.grooveGeometry) {
      close(grooveArea({ casingIrM: R, tjRadiusM: r, depthM }), areaM2, 1e-9 + 1e-6 * Math.abs(areaM2), `A(${depthM})`);
    }
    for (const d of [0.001, 0.005, 0.01]) {
      const a = grooveArea({ casingIrM: R, tjRadiusM: r, depthM: d });
      close(grooveDepthForArea({ casingIrM: R, tjRadiusM: r, areaM2: a }), d, 1e-10 + 1e-8 * d, `depth(A(${d}))`);
    }
    close(
      slidingDistanceM({ tjRadiusM: r, rpm: g.schedule[0].rpm, hours: g.schedule[0].hours }),
      g.totalSlidingDistanceM, 1e-9 * g.totalSlidingDistanceM, 'sliding distance',
    );
  });

  gate('A13', 'rheology fits + Newtonian/power-law laminar closed forms', () => {
    const g = goldens('hydraulics_cases.json');
    for (const c of g.cases) {
      const fits = fitModels(c.mud.fann);
      close(fits.herschelBulkley.n, c.fits.herschelBulkley.n, 1e-9 + 1e-6 * c.fits.herschelBulkley.n, `${c.well}/${c.mudName} n`);
      close(fits.herschelBulkley.tauYPa, c.fits.herschelBulkley.tauYPa, 1e-9 + 1e-6 * c.fits.herschelBulkley.tauYPa, `${c.well}/${c.mudName} tauY`);
    }
    // Newtonian laminar pipe = Hagen-Poiseuille exactly.
    const mu = 0.05;
    const d = 0.1086;
    const q = 0.004;
    const v = q / ((Math.PI / 4) * d * d);
    const loss = elementLoss({
      model: { type: 'bingham', pvPaS: mu, ypPa: 0 },
      rhoKgM3: 1440, vMs: v, dCharM: d, kind: 'pipe', lengthM: 1000,
    });
    close(loss.dpPa, (128 * mu * 1000 * q) / (Math.PI * d ** 4), 1e-9, 'Hagen-Poiseuille');
    // Power-law laminar pipe: dP = 4·L·tau_w/d exactly.
    const n = 0.7;
    const K = 0.5;
    const v2 = 0.006 / ((Math.PI / 4) * d * d);
    const gw = ((8 * v2) / d) * ((3 * n + 1) / (4 * n));
    const pl = elementLoss({
      model: { type: 'powerLaw', n, kPaSn: K },
      rhoKgM3: 1300, vMs: v2, dCharM: d, kind: 'pipe', lengthM: 800,
    });
    close(pl.dpPa, (4 * 800 * K * gw ** n) / d, 1e-6 * pl.dpPa, 'power-law laminar');
  });

  gate('A14', 'circulating losses / bit / ECD vs the independent oracle', () => {
    const g = goldens('hydraulics_cases.json');
    for (const c of g.cases) {
      const mud = { densityKgM3: c.mud.densityKgM3, model: fitModels(c.mud.fann).herschelBulkley };
      for (const q of c.flowRates) {
        const exp = c.expected.hydraulics[`q_${q}`];
        const res = computeHydraulics({
          stations: c.stations, string: c.string, geometry: c.geometry,
          mud, flowRateM3s: q, nozzleTfaM2: c.nozzleTfaM2,
        });
        close(res.summary.pumpPressurePa, exp.pumpPressurePa, 1 + 1e-6 * exp.pumpPressurePa, `${c.well}/${c.mudName}@${q} pump`);
        close(res.summary.ecdAtTdKgM3, exp.ecdAtTdKgM3, 1e-4 + 1e-6 * exp.ecdAtTdKgM3, `${c.well}/${c.mudName}@${q} ECD`);
      }
    }
  });

  gate('A15', 'surge-swab + hole-cleaning slip velocities vs the oracle', () => {
    const g = goldens('hydraulics_cases.json');
    for (const c of g.cases) {
      const mud = { densityKgM3: c.mud.densityKgM3, model: fitModels(c.mud.fann).herschelBulkley };
      for (const [key, exp] of Object.entries(c.expected.surgeSwab) as [string, any][]) {
        const open = key.startsWith('open_');
        const v = parseFloat(key.replace('open_v_', '').replace('v_', ''));
        const r = computeSurgeSwab({
          stations: c.stations, string: c.string, geometry: c.geometry, mud,
          tripSpeedMs: v, mode: open ? 'open' : 'closed',
        });
        close(r.surgeEmwKgM3, exp.surgeEmwKgM3, 1e-4 + 1e-6 * exp.surgeEmwKgM3, `${c.well}/${c.mudName} ${key} surge`);
      }
      const hc = computeHoleCleaning({
        stations: c.stations, string: c.string, geometry: c.geometry, mud,
        flowRateM3s: 0.025, cuttings: { ropMs: 0.005, dParticleM: 0.006, rhoSolidKgM3: 2600 },
      });
      close(hc.summary.minTransportRatio, c.expected.holeCleaning.minTransportRatio,
        1e-9 + 1e-6 * Math.abs(c.expected.holeCleaning.minTransportRatio), `${c.well}/${c.mudName} minTR`);
    }
  });

  gate('A16', 'kill sheet + volumes closed forms + oracle agreement', () => {
    const g = goldens('wellcontrol_cases.json');
    // Self-asserting IWCF-style fixture end to end.
    const fx = g.iwcfStyleExample;
    const ks = killSheet(fx.inputs);
    close(ks.killMudDensityKgM3, fx.killSheet.killMudDensityKgM3, 1e-6, 'fixture KMW');
    close(ks.icpPa, fx.killSheet.icpPa, 1e-3, 'fixture ICP');
    close(ks.fcpPa, fx.killSheet.fcpPa, 1e-3, 'fixture FCP');
    if (ks.influx.kind !== fx.killSheet.influx.kind) throw new Error('fixture influx kind');
    // Golden wells: volumes + kill sheets.
    for (const c of g.cases) {
      const v = wellVolumes({
        stations: c.stations, string: c.string, geometry: c.geometry,
        pumpOutputM3PerStroke: c.pump.outputM3PerStroke,
      });
      const ev = c.expected.volumes;
      close(v.stringVolumeM3, ev.stringVolumeM3, 1e-9 + 1e-6 * ev.stringVolumeM3, `${c.well} string vol`);
      close(v.annulusVolumeM3, ev.annulusVolumeM3, 1e-9 + 1e-6 * ev.annulusVolumeM3, `${c.well} annulus vol`);
      close(tvdAt(c.stations, v.bitMd), ev.tvdBhM, 1e-6 + 1e-6 * ev.tvdBhM, `${c.well} TVD bh`);
      const capBit = annulusCapAt(v.annulusRows, v.bitMd - 1);
      for (const [name, exp] of Object.entries(c.expected.killSheets) as [string, any][]) {
        const kick = { moderate_gas: { sidppPa: 2.0e6, sicpPa: 2.9e6, pitGainM3: 3.0 }, small_liquid: { sidppPa: 0.8e6, sicpPa: 0.9e6, pitGainM3: 1.5 } }[name];
        const r = killSheet({
          tvdBhM: tvdAt(c.stations, v.bitMd), tvdShoeM: tvdAt(c.stations, c.shoeMd),
          mudDensityKgM3: c.mudDensityKgM3, sidppPa: kick.sidppPa, sicpPa: kick.sicpPa,
          pitGainM3: kick.pitGainM3, scrPressurePa: c.pump.scrPressurePa,
          pumpOutputM3PerStroke: c.pump.outputM3PerStroke,
          stringVolumeM3: v.stringVolumeM3, annulusVolumeM3: v.annulusVolumeM3,
          annulusCapNearBitM2: capBit,
        });
        close(r.killMudDensityKgM3, exp.killMudDensityKgM3, 1e-6 + 1e-6 * exp.killMudDensityKgM3, `${c.well}/${name} KMW`);
        close(r.icpPa, exp.icpPa, 1 + 1e-6 * exp.icpPa, `${c.well}/${name} ICP`);
        close(r.fcpPa, exp.fcpPa, 1 + 1e-6 * exp.fcpPa, `${c.well}/${name} FCP`);
      }
    }
  });

  gate('A17', 'kick tolerance + Boyle + MAASP vs the oracle', () => {
    const g = goldens('wellcontrol_cases.json');
    close(boyle({ p1Pa: 50e6, v1M3: 2, p2Pa: 25e6 }), 4, 1e-12, 'Boyle');
    close(maaspFn({ tvdShoeM: 2000, mudDensityKgM3: 1200, fracEmwKgM3: 1700 }),
      500 * 9.80665 * 2000, 1e-6, 'MAASP algebra');
    for (const c of g.cases) {
      const v = wellVolumes({ stations: c.stations, string: c.string, geometry: c.geometry });
      const kt = kickTolerance({
        tvdBhM: tvdAt(c.stations, v.bitMd), tvdShoeM: tvdAt(c.stations, c.shoeMd),
        mudDensityKgM3: c.mudDensityKgM3, fracEmwKgM3: c.fracEmwKgM3,
        kickIntensityKgM3: 60, influxDensityKgM3: 240,
        annulusCapAtShoeM2: annulusCapAt(v.annulusRows, c.shoeMd - 1),
        annulusCapAtBitM2: annulusCapAt(v.annulusRows, v.bitMd - 1),
      });
      close(kt.maaspPa, c.expected.kickTolerance.maaspPa, 1 + 1e-6 * c.expected.kickTolerance.maaspPa, `${c.well} MAASP`);
      close(kt.kickToleranceM3, c.expected.kickTolerance.kickToleranceM3,
        1e-9 + 1e-6 * c.expected.kickTolerance.kickToleranceM3, `${c.well} KT`);
    }
  });

  const armed = [
    ['L2', 'Mitchell & Miska survey table'],
    ['L3', 'Amoco/API MD-TVD table'],
    ['L4', 'Mitchell & Miska torque & drag worked example'],
    ['L5', 'Johancsik SPE 11380 field cases'],
    ['L6', 'ADE ch.4 hydraulics worked example'],
    ['L7', 'API RP 13D worked example well'],
    ['L8', 'IWCF/IADC kill sheet worked example'],
    ['L9', 'ADE worked kick and kill example'],
  ];
  for (const [id, name] of armed) {
    console.log(`ARMED ${id}  ${name} (pending owner literature; gate schema committed)`);
  }

  if (failures > 0) {
    console.error(`\n${failures} gate(s) FAILED.`);
    process.exit(1);
  }
  console.log('\nAll active drilling gates passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
