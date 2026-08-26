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
//   A18 cement job volumes + U-tube closed forms + oracle agreement
//      (Drilling D4; cementing_cases.json incl. the self-asserting
//      vertical fixture)
//   A19 placement ECD series + API 10D standoff vs the oracle
//   A20 geomech poroelastic/UCS/rotation closed forms + golden agreement
//      (Drilling D5; geomech_cases.json incl. the self-asserting vertical
//      Kirsch fixture)
//   A21 Kirsch collapse/frac-initiation closed forms + trajectory mud
//      windows vs the oracle
//   A22 API 5C3 tubular ratings: Barlow hand algebra, collapse
//      regime-boundary continuity, Ypa monotonicity, VME identity, and
//      catalog golden agreement (Drilling D6; tubular_cases.json)
//   A23 canonical load-case profiles + governing-depth string evaluation
//      + Lubinski tubing-packer forces vs the oracle
//   A24 API 5CT drift closed forms + completion stack-up + volumes vs the
//      oracle (Drilling D7; completion_cases.json)
//   A25 run-in clearance / through-bore governing logic + seal space-out
//      statuses vs the oracle
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
//   L10 API RP 10B-2/10D worked example (owner PDF)
//   L11 Nelson & Guillot, Well Cementing worked example (owner PDF)
//   L12 Zoback, Reservoir Geomechanics worked example (owner PDF)
//   L13 API 5C3 / vendor data book published ratings table (owner PDF;
//      spot-checks the computed catalog against the printed values)

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
  const { jobVolumes, simulatePlacement, standoffProfile, requiredSpacing } = await import(
    '../../packages/engines/engines/drilling/cementing.js');
  const { horizontalStresses, ucsFromDt, wellboreStability, mudWindowAlongWell, frictionalLimitRatio } = await import(
    '../../packages/engines/engines/drilling/geomech.js');
  const { computeClearance } = await import(
    '../../packages/engines/engines/drilling/antiCollision.js');
  const {
    barlowBurstPa, api5c3CollapsePa, adjustedYieldPa, pipeBodyYieldN,
    triaxialSF, loadCaseProfiles, evaluateString, tubingLoads,
    erosionalVelocityMs,
  } = await import('../../packages/engines/engines/drilling/tubularDesign.js');
  const { CASING_CATALOG, TUBING_CATALOG, casingGradeYieldPa } = await import(
    '../../packages/engines/engines/drilling/data/tubulars.js');
  const {
    apiDriftM, buildStack, casingProgramProfile, governingDriftTo,
    runInClearance, throughBoreProfile, completionVolumes, sealSpaceOut,
  } = await import('../../packages/engines/engines/drilling/completionDesign.js');

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

  gate('A18', 'cement job volumes + U-tube closed forms + oracle agreement', () => {
    const g = goldens('cementing_cases.json');
    const fx = g.verticalFixture;
    const vols = jobVolumes({
      stations: fx.stations, holeSections: fx.holeSections, casing: fx.casing,
      tocMd: fx.tocMd, excessOpenHolePct: 0, spacerVolM3: 3,
    });
    close(vols.slurryM3, fx.volumes.slurryM3, 1e-9 + 1e-6 * fx.volumes.slurryM3, 'fixture slurry');
    close(vols.displacementM3, fx.volumes.displacementM3, 1e-9 + 1e-6 * fx.volumes.displacementM3, 'fixture displacement');
    const res = simulatePlacement({
      stations: fx.stations, holeSections: fx.holeSections, casing: fx.casing,
      mudInHole: fx.mudInHole, fluids: fx.fluids, pumpRateM3s: fx.pumpRateM3s, tocMd: fx.tocMd,
    });
    close(res.achievedTocMd, fx.tocMd, 1e-6, 'fixture TOC');
    close(res.floatDiffPa, fx.placement.floatDiffPa, 1 + 1e-6 * Math.abs(fx.placement.floatDiffPa), 'fixture U-tube');
    close(res.endPumpPressurePa, fx.placement.endPumpPressurePa, 1 + 1e-6 * fx.placement.endPumpPressurePa, 'fixture end pressure');
    for (const c of g.cases) {
      const v = jobVolumes({
        stations: c.stations, holeSections: c.holeSections, casing: c.casing,
        tocMd: c.tocMd, excessOpenHolePct: c.excessOpenHolePct, spacerVolM3: 4,
        slurryYieldM3PerSack: c.slurryYieldM3PerSack, leadTailSplitMd: c.leadTailSplitMd,
      });
      close(v.slurryM3, c.expected.volumes.slurryM3, 1e-9 + 1e-6 * c.expected.volumes.slurryM3, `${c.well} slurry`);
      close(v.sacks, c.expected.volumes.sacks, 1e-9 + 1e-6 * c.expected.volumes.sacks, `${c.well} sacks`);
    }
  });

  gate('A19', 'placement ECD series + API 10D standoff vs the oracle', () => {
    const g = goldens('cementing_cases.json');
    const hb = (fann: any) => fitModels(fann).herschelBulkley;
    for (const c of g.cases) {
      const v = jobVolumes({
        stations: c.stations, holeSections: c.holeSections, casing: c.casing,
        tocMd: c.tocMd, excessOpenHolePct: c.excessOpenHolePct, spacerVolM3: 4,
        slurryYieldM3PerSack: c.slurryYieldM3PerSack, leadTailSplitMd: c.leadTailSplitMd,
      });
      const mud = { kind: 'mud', densityKgM3: 1440, rheology: hb(c.mudFann) };
      const fluids = [
        { kind: 'spacer', densityKgM3: 1500, volumeM3: 4, rheology: hb(c.spacerFann) },
        { kind: 'lead', densityKgM3: 1560, volumeM3: v.leadM3, rheology: hb(c.leadFann) },
        { kind: 'tail', densityKgM3: 1900, volumeM3: v.tailM3, rheology: hb(c.tailFann) },
        { kind: 'displacement', densityKgM3: 1440, volumeM3: v.displacementM3, rheology: hb(c.mudFann) },
      ];
      const res = simulatePlacement({
        stations: c.stations, holeSections: c.holeSections, casing: c.casing,
        mudInHole: mud, fluids, pumpRateM3s: c.pumpRateM3s,
        tocMd: c.tocMd, excessOpenHolePct: c.excessOpenHolePct,
      });
      const exp = c.expected.programs.lead_tail;
      close(res.endPumpPressurePa, exp.endPumpPressurePa, 1 + 1e-6 * exp.endPumpPressurePa, `${c.well} end pressure`);
      close(res.maxEcdPrevShoeKgM3, exp.maxEcdPrevShoeKgM3, 1e-4 + 1e-6 * exp.maxEcdPrevShoeKgM3, `${c.well} max ECD`);
      close(res.achievedTocMd, exp.achievedTocMd, 1e-6 + 1e-6 * exp.achievedTocMd, `${c.well} TOC`);
      const so = standoffProfile({
        stations: c.stations, holeSections: c.holeSections, casing: c.casing,
        mudDensityKgM3: 1440, centralizer: c.centralizer,
      });
      close(so.minStandoff, c.expected.standoff.minStandoff, 1e-9 + 1e-6 * c.expected.standoff.minStandoff, `${c.well} min standoff`);
      const req = requiredSpacing({
        stations: c.stations, holeSections: c.holeSections, casing: c.casing,
        mudDensityKgM3: 1440, centralizer: c.centralizer,
      });
      close(req, c.expected.requiredSpacingM, 1e-6 + 1e-6 * c.expected.requiredSpacingM, `${c.well} required spacing`);
    }
  });

  gate('A20', 'geomech poroelastic/UCS/rotation closed forms + golden agreement', () => {
    const g = goldens('geomech_cases.json');
    const P = g.params;
    const prof = g.profile;
    // Poroelastic algebra exact.
    const hs1 = horizontalStresses({ svPa: [50e6], ppPa: [20e6], nu: 0.25, frictionAngleDeg: 45 });
    close(hs1.shminPa[0], (0.25 / 0.75) * 30e6 + 20e6, 1e-6, 'poroelastic Shmin');
    close(frictionalLimitRatio(30), 3, 1e-12, 'frictional ratio');
    // UCS formulas exact.
    const u = ucsFromDt({ dtUsPerM: [300], correlation: 'horsrud' });
    close(u.ucsPa[0], 0.77 * (1e6 / 300 / 1000) ** 3.2 * 1e6, 1e-9, 'Horsrud');
    // Golden profile agreement.
    const hs = horizontalStresses({
      svPa: prof.svPa, ppPa: prof.ppPa, nu: P.nu, alphaBiot: P.alphaBiot,
      ePa: P.ePa, epsX: P.epsX, epsY: P.epsY,
      frictionAngleDeg: P.frictionAngleDeg, regime: P.regime,
    });
    for (let i = 0; i < prof.tvdM.length; i += 4) {
      close(hs.shminPa[i], prof.shminPa[i], 1 + 1e-6 * prof.shminPa[i], `Shmin[${i}]`);
      close(hs.shmaxPa[i], prof.shmaxPa[i], 1 + 1e-6 * prof.shmaxPa[i], `SHmax[${i}]`);
    }
  });

  gate('A21', 'Kirsch collapse/frac-init closed forms + trajectory mud windows', () => {
    const g = goldens('geomech_cases.json');
    const fx = g.verticalFixture;
    const st = wellboreStability(fx.inputs);
    close(st.collapsePa, fx.expected.closedFormCollapsePa, 500 + 1e-5 * fx.expected.closedFormCollapsePa, 'vertical collapse closed form');
    close(st.fracInitPa, fx.expected.closedFormFracPa, 500 + 1e-5 * fx.expected.closedFormFracPa, 'vertical frac-init closed form');
    const P = g.params;
    const prof = g.profile;
    for (const c of g.cases) {
      const res = mudWindowAlongWell({
        stations: c.stations,
        profile: {
          tvdM: prof.tvdM, svPa: prof.svPa, shmaxPa: prof.shmaxPa,
          shminPa: prof.shminPa, ppPa: prof.ppPa, ucsPa: prof.ucsPa,
        },
        params: {
          shmaxAzimuthDeg: P.shmaxAzimuthDeg, frictionAngleDeg: P.frictionAngleDeg,
          nu: P.nu, tensileStrengthPa: P.tensileStrengthPa, alphaBiot: P.alphaBiot,
        },
        stepMdM: 30,
      });
      if (res.rows.length !== c.expected.nRows) throw new Error(`${c.well}: ${res.rows.length} rows vs ${c.expected.nRows}`);
      for (const cp of c.expected.checkpoints) {
        const row = res.rows.find((r: any) => Math.abs(r.md - cp.md) < 1e-6);
        if (!row) throw new Error(`${c.well}: missing checkpoint at ${cp.md}`);
        close(row.collapseEmwKgM3, cp.collapseEmwKgM3, 1e-3 + 1e-6 * cp.collapseEmwKgM3, `${c.well} collapse@${cp.md}`);
        close(row.fracInitEmwKgM3, cp.fracInitEmwKgM3, 1e-3 + 1e-6 * cp.fracInitEmwKgM3, `${c.well} frac@${cp.md}`);
      }
      close(res.tightest.widthKgM3, c.expected.tightestWidthKgM3, 1e-3 + 1e-6 * Math.abs(c.expected.tightestWidthKgM3), `${c.well} tightest`);
    }
  });

  gate('A22', '5C3 ratings: closed forms, regime continuity, catalog golden agreement', () => {
    const g = goldens('tubular_cases.json');
    const IN = 0.0254;
    const KSI = 6.894757e6;
    const PSI = 6894.757293168;
    // Barlow hand algebra (9-5/8 47 L-80).
    const b = barlowBurstPa({ odM: 9.625 * IN, wallM: 0.472 * IN, yieldPa: 80 * KSI });
    close(b / PSI, (0.875 * 2 * 80000 * 0.472) / 9.625, 1e-3, 'Barlow 9-5/8 47 L-80');
    // Regime-boundary continuity for a representative grade.
    const { boundaries } = api5c3CollapsePa({ odM: 9.625 * IN, wallM: 0.472 * IN, yieldPa: 80 * KSI });
    for (const dt of [boundaries.dtYp, boundaries.dtPt, boundaries.dtTe]) {
      const wall = 0.5 * IN;
      const lo = api5c3CollapsePa({ odM: dt * wall * (1 - 1e-7), wallM: wall, yieldPa: 80 * KSI });
      const hi = api5c3CollapsePa({ odM: dt * wall * (1 + 1e-7), wallM: wall, yieldPa: 80 * KSI });
      close(lo.collapsePa, hi.collapsePa, 100 + 1e-4 * hi.collapsePa, `continuity at D/t ${dt.toFixed(2)}`);
      if (lo.regime === hi.regime) throw new Error(`no regime switch at D/t ${dt.toFixed(2)}`);
    }
    // Ypa monotone in tension.
    let prev = adjustedYieldPa(80 * KSI, 0);
    for (const f of [0.2, 0.5, 0.8]) {
      const cur = adjustedYieldPa(80 * KSI, f * 80 * KSI);
      if (!(cur < prev)) throw new Error(`Ypa not decreasing at ${f}`);
      prev = cur;
    }
    // Catalog golden agreement (every row x grade, incl. combined loading).
    const all = [...CASING_CATALOG, ...TUBING_CATALOG];
    for (const r of g.ratings) {
      const row = all.find((x: any) => Math.abs(x.odIn - r.odIn) < 1e-9
        && Math.abs(x.weightLbFt - r.weightLbFt) < 1e-9);
      if (!row) throw new Error(`catalog row missing: ${r.odIn}" ${r.weightLbFt}#`);
      const yp = casingGradeYieldPa(r.grade);
      close(barlowBurstPa({ odM: row.odM, wallM: row.wallM, yieldPa: yp }), r.burstPa,
        1 + 1e-6 * r.burstPa, `burst ${r.odIn}x${r.weightLbFt} ${r.grade}`);
      const col = api5c3CollapsePa({ odM: row.odM, wallM: row.wallM, yieldPa: yp });
      if (col.regime !== r.regime) throw new Error(`regime ${r.odIn}x${r.weightLbFt} ${r.grade}: ${col.regime} vs ${r.regime}`);
      close(col.collapsePa, r.collapsePa, 1 + 1e-6 * r.collapsePa, `collapse ${r.odIn}x${r.weightLbFt} ${r.grade}`);
      const colT = api5c3CollapsePa({ odM: row.odM, wallM: row.wallM, yieldPa: yp, axialStressPa: 0.4 * yp });
      close(colT.collapsePa, r.collapseAt40pctTensionPa, 1 + 1e-6 * r.collapseAt40pctTensionPa, `derated ${r.odIn}x${r.weightLbFt} ${r.grade}`);
      close(pipeBodyYieldN({ odM: row.odM, idM: row.odM - 2 * row.wallM, yieldPa: yp }), r.bodyYieldN,
        1 + 1e-6 * r.bodyYieldN, `body yield ${r.odIn}x${r.weightLbFt} ${r.grade}`);
    }
    // VME identity: pure tension.
    const areaM2 = (Math.PI / 4) * ((9.625 * IN) ** 2 - (8.681 * IN) ** 2);
    const tri = triaxialSF({ odM: 9.625 * IN, idM: 8.681 * IN, yieldPa: 80 * KSI, piPa: 0, poPa: 0, axialN: 1e6 });
    close(tri.vmePa, 1e6 / areaM2, 1, 'VME pure-tension identity');
  });

  gate('A23', 'load profiles + string evaluation + Lubinski tubing forces vs oracle', () => {
    const g = goldens('tubular_cases.json');
    const IN = 0.0254;
    const KSI = 6.894757e6;
    const sections = g.sections;
    for (const c of g.cases) {
      const profile = loadCaseProfiles({
        kind: c.kind, shoeTvdM: g.shoeTvdM, env: g.env, string: g.string,
      });
      for (const cp of c.profileCheckpoints) {
        const i = profile.tvdM.findIndex((z: number) => Math.abs(z - cp.tvdM) < 1e-6);
        if (i < 0) throw new Error(`${c.kind}: checkpoint TVD ${cp.tvdM} not on grid`);
        close(profile.piPa[i], cp.piPa, 1 + 1e-6 * Math.abs(cp.piPa), `${c.kind} pi@${cp.tvdM}`);
        close(profile.poPa[i], cp.poPa, 1 + 1e-6 * Math.abs(cp.poPa), `${c.kind} po@${cp.tvdM}`);
        close(profile.faN[i], cp.faN, 1 + 1e-6 * Math.abs(cp.faN), `${c.kind} fa@${cp.tvdM}`);
      }
      const res = evaluateString({
        sections, profile, safetyFactors: g.designFactors,
        bendingDlsDegPer30m: g.bendingDlsDegPer30m,
      });
      for (let s = 0; s < sections.length; s += 1) {
        const got: any = res.sections[s];
        const exp: any = c.sections[s];
        if (got.status !== exp.status) throw new Error(`${c.kind} sec ${s}: ${got.status} vs ${exp.status}`);
        for (const k of ['burstSF', 'collapseSF', 'tensionSF', 'triaxSF']) {
          if (exp[k] == null) continue;
          close(got[k], exp[k], 1e-6 + 1e-6 * exp[k], `${c.kind} sec ${s} ${k}`);
        }
      }
    }
    for (const t of g.tubing) {
      const r = tubingLoads({
        tubing: { odM: 3.5 * IN, idM: 2.992 * IN, lengthM: 2500, weightKgM: 9.3 * 1.4881639 },
        packer: { sealBoreM: 4 * IN, ratingN: 6.7e5, strokeM: 1.5 },
        loadCase: t.case,
        tempProfile: t.temp,
        casingIdM: 6.184 * IN,
      });
      for (const k of ['pistonN', 'ballooningN', 'thermalN', 'totalN']) {
        close(r.forces[k], t.result.forces[k], 1e-3 + 1e-6 * Math.abs(t.result.forces[k]), `${t.name} ${k}`);
      }
      if (r.buckling.state !== t.result.buckling.state) {
        throw new Error(`${t.name}: buckling ${r.buckling.state} vs ${t.result.buckling.state}`);
      }
      close(r.packer.sf, t.result.packer.sf, 1e-6 + 1e-6 * t.result.packer.sf, `${t.name} packer SF`);
    }
    close(erosionalVelocityMs({ mixtureKgM3: g.erosional.mixtureKgM3, cFactor: g.erosional.cFactor }),
      g.erosional.veMs, 1e-9, 'erosional velocity');
    void KSI;
  });

  gate('A24', 'API 5CT drift closed forms + completion stack-up + volumes vs oracle', () => {
    const g = goldens('completion_cases.json');
    const IN = 0.0254;
    // Published drift table (exact inch-fraction deductions).
    for (const r of g.driftTable) {
      const d = apiDriftM({ odM: r.odIn * IN, idM: r.idIn * IN, kind: r.kind });
      close(d / IN, r.driftIn, 1e-9 + 1e-9 * r.driftIn, `drift ${r.odIn}" ${r.kind}`);
    }
    // Hand spot value: 9-5/8 47# drift 8.525" (published table rounding).
    close(apiDriftM({ odM: 9.625 * IN, idM: 8.681 * IN, kind: 'casing' }) / IN, 8.525, 5e-4, 'drift 9-5/8 47');
    // Stack-up telescoping + golden rows.
    const stack = buildStack({ hangerMdM: g.stack.hangerMdM, components: g.stack.components });
    close(stack.bottomMdM, g.results.bottomMdM, 1e-9, 'stack bottom');
    g.results.stackRows.forEach((r: any, i: number) => {
      close(stack.components[i].topMdM, r.topMdM, 1e-9 + 1e-12, `stack top ${i}`);
      close(stack.components[i].bottomMdM, r.bottomMdM, 1e-9 + 1e-12, `stack bottom ${i}`);
    });
    // Exposed program profile (liner overlap) + volumes vs the oracle's
    // independent 1 cm slicing.
    const profile = casingProgramProfile(g.program.strings);
    if (profile.length !== g.results.profile.length) throw new Error('profile segment count');
    profile.forEach((seg: any, i: number) => {
      close(seg.idM, g.results.profile[i].idM, 1e-9, `profile id ${i}`);
      close(seg.driftM, g.results.profile[i].driftM, 1e-9, `profile drift ${i}`);
    });
    const vols = completionVolumes({ stack, profile, packerMdM: g.packerMdM, tdMdM: g.tdMdM });
    close(vols.stringCapacityM3, g.results.volumes.stringCapacityM3, 1e-6 * g.results.volumes.stringCapacityM3, 'string capacity');
    close(vols.annulusAbovePackerM3, g.results.volumes.annulusAbovePackerM3, 1e-5 * g.results.volumes.annulusAbovePackerM3, 'annulus above packer');
    close(vols.belowPackerM3, g.results.volumes.belowPackerM3, 1e-5 * g.results.volumes.belowPackerM3, 'below packer');
    // Field capacity identity: 2-7/8 6.5# = ID^2/1029.4 bbl/ft.
    const capM3PerM = (Math.PI / 4) * (2.441 * IN) ** 2;
    close((capM3PerM / 0.158987294928) * 0.3048, (2.441 ** 2) / 1029.4, 5e-5 * 0.0058, 'capacity identity');
  });

  gate('A25', 'run-in clearance / through-bore governing logic + space-out vs oracle', () => {
    const g = goldens('completion_cases.json');
    const stack = buildStack({ hangerMdM: g.stack.hangerMdM, components: g.stack.components });
    const profile = casingProgramProfile(g.program.strings);
    // Governing drift monotone + gap-aware.
    const d1 = governingDriftTo(profile, 1000);
    const d3 = governingDriftTo(profile, 3000);
    if (!(d1.driftM > d3.driftM)) throw new Error('governing drift not decreasing');
    const cl = runInClearance({ stack, profile, warnMarginM: g.warnMarginM });
    cl.rows.forEach((r: any, i: number) => {
      const e = g.results.clearance[i];
      close(r.clearanceM, e.clearanceM, 1e-9 + 1e-6 * Math.abs(e.clearanceM), `clearance ${i}`);
      if (r.status !== e.status) throw new Error(`clearance status ${i}: ${r.status} vs ${e.status}`);
      if (r.controlling !== e.controlling) throw new Error(`controlling ${i}: ${r.controlling} vs ${e.controlling}`);
    });
    const tb = throughBoreProfile(stack);
    close(tb.minIdM, g.results.throughBore.minIdM, 1e-9, 'through-bore min');
    if (tb.controlling !== g.results.throughBore.controlling) {
      throw new Error(`through-bore controlling: ${tb.controlling}`);
    }
    tb.rows.forEach((r: any, i: number) => {
      close(r.cumMinIdM, g.results.throughBore.rows[i].cumMinIdM, 1e-9, `cum min id ${i}`);
    });
    for (const c of g.results.spaceOut) {
      const r = sealSpaceOut({
        pbrLengthM: c.pbrLengthM, insertLengthM: c.insertLengthM,
        expectedDLM: c.expectedDLM, marginM: c.marginM,
      });
      close(r.remainingM, c.result.remainingM, 1e-12 + 1e-9, `space-out ${c.name}`);
      if (r.status !== c.result.status) throw new Error(`space-out status ${c.name}: ${r.status}`);
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
    ['L10', 'API RP 10B-2/10D worked example'],
    ['L11', 'Nelson & Guillot, Well Cementing worked example'],
    ['L12', 'Zoback, Reservoir Geomechanics worked example'],
    ['L13', 'API 5C3 / vendor data book published ratings table'],
    ['L14', 'vendor completion equipment catalog dimensions'],
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
