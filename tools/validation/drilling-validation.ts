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
//   A26 Karakas-Tariq tables + closed forms + sieve statistics + Saucier
//      sizing vs the oracle (Drilling D8; perfsand_cases.json)
//   A27 gun clearance / advisor / screen logic + sanding CDP closed form
//      vs the oracle
//   A28 plane-strain/PKN/KGD widths + Nolte material balance + schedule
//      closed forms vs the oracle (Drilling D9; stim_cases.json)
//   A29 Cinco-Ley productivity + proppant pack interp + acidizing closed
//      forms vs the oracle
//   A30 barrier categorization truth table + element MAASP / RP 90 MAWOP
//      closed forms vs the oracle (Drilling D10; wellintegrity_cases.json)
//   A31 balanced plug closed forms + D-010 rule checks + program
//      compliance vs the oracle
//   A32 activity schedule / time-depth curve / AFE rollup / cost-time
//      accrual identity / ADE cost-per-metre / benchmark suggestion vs
//      the oracle (Drilling D11; wellcost_cases.json)
//   A33 Monte Carlo cost path through the CANONICAL suite sampler
//      (src/lib/monteCarlo.js, seeded): reproduces the oracle's
//      analytic mean/variance of the linear triangular fixture within
//      CLT tolerance
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
  const {
    karakasTariq, productivityRatio,
  } = await import('../../packages/engines/engines/drilling/perforation.js');
  const {
    sieveStats, saucierGravel, screenSelection, sandControlAdvisor,
    sandingOnset, cdpAlongInterval,
  } = await import('../../packages/engines/engines/drilling/sandControl.js');
  const {
    planeStrainModulus, fracGeometry, pumpTime, pumpSchedule, proppedFrac,
    fracProductivity, noltekL,
  } = await import('../../packages/engines/engines/drilling/fracDesign.js');
  const {
    hawkinsSkin, sandstoneAcid, carbonateAcid, maxMatrixRate,
  } = await import('../../packages/engines/engines/drilling/acidizing.js');
  const {
    PROPPANT_CATALOG, packPermeabilityM2,
  } = await import('../../packages/engines/engines/drilling/data/proppants.js');
  const {
    envelopeStatus, wellCategory, verifyBarriers, maaspRows, mawop,
  } = await import('../../packages/engines/engines/drilling/wellIntegrity.js');
  const {
    balancedPlug, plugRuleCheck, annularBarrierCheck, abandonmentProgram,
  } = await import('../../packages/engines/engines/drilling/plugAbandonment.js');
  const {
    activityDuration, evaluateProgram, afeCosts, costTimeCurve: wcCostTimeCurve,
    costPerMeter,
  } = await import('../../packages/engines/engines/drilling/wellCost.js');
  const { benchmarkSuggestion } = await import(
    '../../packages/engines/engines/drilling/data/costBenchmarks.js');
  const { createCorrelatedSampler } = await import('../../src/lib/monteCarlo.js');

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

  gate('A26', 'Karakas-Tariq tables + closed forms + sieve + Saucier vs oracle', () => {
    const g = goldens('perfsand_cases.json');
    const IN = 0.0254;
    // Hand-computed 90 deg case (the oracle self-assert twin).
    const hand = karakasTariq({
      lpM: 12 * IN, rpM: 0.25 * IN, spfPerM: 4 * 3.280839895,
      phasingDeg: 90, rwM: 4.25 * IN,
    });
    close(hand.sH, -1.0210, 2e-3, 'K-T s_h hand case');
    close(hand.sV, 0.4960, 2e-3, 'K-T s_v hand case');
    close(hand.sWb, 0.0095, 5e-4, 'K-T s_wb hand case');
    // 0 deg limit: rw' = lp/4 exactly.
    const zero = karakasTariq({
      lpM: 12 * IN, rpM: 0.25 * IN, spfPerM: 4 * 3.280839895,
      phasingDeg: 0, rwM: 4.25 * IN,
    });
    close(zero.rwPrimeM, (12 * IN) / 4, 1e-12, 'K-T 0 deg rw-prime');
    // Golden gun cases + productivity ratios.
    for (const c of g.guns) {
      const kt = karakasTariq({
        lpM: c.inputs.lpM, rpM: c.inputs.rpM, spfPerM: c.inputs.spfPerM,
        phasingDeg: c.inputs.phasingDeg, rwM: c.inputs.rwM,
        khOverKv: c.inputs.khOverKv, rcM: c.inputs.rcM, kOverKc: c.inputs.kOverKc,
      });
      for (const k of ['sH', 'sV', 'sWb', 'sCz', 'total'] as const) {
        close(kt[k], c.expected.skin[k], 1e-9 + 1e-8 * Math.abs(c.expected.skin[k]), `K-T ${k} ${c.inputs.key}`);
      }
      const pr = productivityRatio({ reM: g.params.reM, rwM: c.inputs.rwM, sTotal: kt.total });
      close(pr.ratio, c.expected.pr.ratio, 1e-8, `PR ${c.inputs.key}`);
    }
    // Sieve statistics + Saucier + screen gauge on the golden sieve.
    const stats = sieveStats(g.sieve.points);
    for (const k of ['d10M', 'd40M', 'd50M', 'd90M', 'd95M'] as const) {
      close(stats[k], g.sieve.expected[k], 1e-9 + 1e-8 * g.sieve.expected[k], `sieve ${k}`);
    }
    close(stats.uniformity, g.sieve.expected.uniformity, 1e-8, 'uniformity');
    close(stats.finesPct, g.sieve.expected.finesPct, 1e-8, 'fines');
    const sauc = saucierGravel({ d50M: stats.d50M });
    close(sauc.bandMinM, g.gravel.expected.bandMinM, 1e-9, 'Saucier band min');
    if (sauc.matches.map((m: any) => m.mesh).join() !== g.gravel.expected.matches.join()) {
      throw new Error(`Saucier match: ${sauc.matches.map((m: any) => m.mesh)}`);
    }
  });

  gate('A27', 'gun clearance / advisor / screen logic + sanding CDP vs oracle', () => {
    const g = goldens('perfsand_cases.json');
    // Screen gauge below the smallest gravel grain (published spot: 20/40
    // -> 16 thou) + advisor ladder on the golden sieve.
    const stats = sieveStats(g.sieve.points);
    const sauc = saucierGravel({ d50M: stats.d50M });
    const gauge = screenSelection({ mode: 'gravel-pack', gravel: sauc.matches[0] });
    close(gauge.gaugeM / 25.4e-6, g.gravel.screenGaugeThou, 1e-9, 'screen gauge thou');
    if (!(gauge.gaugeM < sauc.matches[0].minM)) throw new Error('gauge not below smallest grain');
    const adv = sandControlAdvisor(stats);
    if (adv.indication !== g.gravel.advisorIndication) {
      throw new Error(`advisor: ${adv.indication} vs ${g.gravel.advisorIndication}`);
    }
    // Sanding closed form + CDP sweep, both geometries.
    const fx = g.sanding.fixture;
    const onset = sandingOnset({
      s1Pa: fx.inputs.s1Pa, s2Pa: fx.inputs.s2Pa,
      ucsPa: fx.inputs.ucsPa, boostFactor: fx.inputs.boostFactor,
    });
    close(onset.pwfCritPa, (3 * fx.inputs.s1Pa - fx.inputs.s2Pa - fx.inputs.ucsPa) / 2, 1e-6, 'CDP closed form');
    const curves = {
      tvdM: g.profile.tvdM, svPa: g.profile.svPa, shmaxPa: g.profile.shmaxPa,
      shminPa: g.profile.shminPa, ppPa: g.profile.ppPa, ucsPa: g.profile.ucsPa,
    };
    for (const geometry of ['perf-tunnel', 'openhole'] as const) {
      const res = cdpAlongInterval({
        stations: g.stations, curves,
        topMdM: g.params.interval.topMdM, bottomMdM: g.params.interval.bottomMdM,
        geometry, boostFactor: g.params.boostFactor, stepMdM: g.params.stepMdM,
      });
      const exp = g.sanding.cdp[geometry];
      if (res.rows.length !== exp.rows.length) throw new Error(`CDP rows ${geometry}`);
      res.rows.forEach((r: any, i: number) => {
        close(r.pwfCritPa, exp.rows[i].pwfCritPa, 1e-6 * Math.abs(exp.rows[i].pwfCritPa), `pwfCrit ${geometry} ${i}`);
        close(r.cdpPa, exp.rows[i].cdpPa, 1e-5 * Math.abs(exp.rows[i].cdpPa) + 1, `cdp ${geometry} ${i}`);
      });
      close(res.governing.mdM, exp.governing.mdM, 1e-9, `governing md ${geometry}`);
    }
    // Weaker rock lowers the margin.
    const weak = sandingOnset({ s1Pa: 60e6, s2Pa: 45e6, ucsPa: 20e6 });
    const strong = sandingOnset({ s1Pa: 60e6, s2Pa: 45e6, ucsPa: 60e6 });
    if (!(weak.pwfCritPa > strong.pwfCritPa)) throw new Error('CDP not monotone in UCS');
  });

  gate('A28', 'plane-strain/PKN/KGD widths + Nolte balance + schedule vs oracle', () => {
    const g = goldens('stim_cases.json');
    const p = g.params;
    const ep = planeStrainModulus({ ePa: p.ePa, nu: p.nu });
    close(ep, p.ePrimePa, 1e-9 * p.ePrimePa, 'plane strain modulus');
    // Hand case (the oracle self-assert twin).
    const hand = fracGeometry({
      model: 'pkn', qiM3s: 0.053, muPaS: 0.2, xfM: 150, hfM: 30,
      ePrimePa: planeStrainModulus({ ePa: 2.5e10, nu: 0.28 }),
    });
    close(hand.wMaxM, 6.392e-3, 5e-6, 'PKN width hand case');
    for (const model of ['pkn', 'kgd'] as const) {
      const geo = fracGeometry({
        model, qiM3s: p.qiM3s, muPaS: p.muPaS, xfM: p.xfM, hfM: p.hfM,
        ePrimePa: ep, closurePa: p.closurePa,
      });
      const e = g.geometry[model];
      close(geo.wMaxM, e.wMaxM, 1e-9 + 1e-8 * e.wMaxM, `${model} wMax`);
      close(geo.pNetPa, e.pNetPa, 1e-7 * e.pNetPa, `${model} pNet`);
      close(geo.bhtpPa, e.bhtpPa, 1e-8 * e.bhtpPa, `${model} BHTP`);
    }
    const wAvg = fracGeometry({
      model: 'pkn', qiM3s: p.qiM3s, muPaS: p.muPaS, xfM: p.xfM, hfM: p.hfM, ePrimePa: ep,
    }).wAvgM;
    // CL = 0 limit exact.
    const b0 = pumpTime({ qiM3s: p.qiM3s, hfM: p.hfM, xfM: p.xfM, wAvgM: wAvg, clMSqrtS: 0 });
    if (b0.etaFrac !== 1) throw new Error('CL=0 efficiency not 1');
    // Balance vs the oracle's bisection + residual identity.
    const b = pumpTime({ qiM3s: p.qiM3s, hfM: p.hfM, xfM: p.xfM, wAvgM: wAvg, clMSqrtS: p.clMSqrtS });
    close(b.tiS, g.balance.tiS, 1e-6 * g.balance.tiS, 'pump time');
    close(b.etaFrac, g.balance.etaFrac, 1e-6, 'efficiency');
    const residual = p.qiM3s * b.tiS - b.vfM3
      - noltekL(b.etaFrac) * p.clMSqrtS * 4 * p.xfM * p.hfM * Math.sqrt(b.tiS);
    close(residual, 0, 1e-6, 'balance residual');
    const sch = pumpSchedule({
      tiS: b.tiS, etaFrac: b.etaFrac, qiM3s: p.qiM3s, cEojKgM3: p.cEojKgM3, nSteps: p.nSteps,
    });
    close(sch.padFrac, g.schedule.padFrac, 1e-6, 'pad fraction');
    close(sch.massKg, g.schedule.massKg, 1e-6 * g.schedule.massKg, 'proppant mass');
    sch.steps.forEach((s: any, i: number) => {
      close(s.cKgM3, g.schedule.steps[i].cKgM3, 1e-6 * p.cEojKgM3, `step conc ${i}`);
    });
  });

  gate('A29', 'Cinco-Ley productivity + proppant interp + acidizing vs oracle', () => {
    const g = goldens('stim_cases.json');
    const p = g.params;
    const DARCY = 9.869233e-13;
    const MDM2 = 9.869233e-16;
    const row = PROPPANT_CATALOG.find((r: any) => r.name === p.proppant.name);
    const perm = packPermeabilityM2(row, p.closurePa);
    if (perm.clamped) throw new Error('golden closure clamped in the proppant table');
    close(perm.kM2 / DARCY, g.proppantPack.kfDarcy, 1e-7 * g.proppantPack.kfDarcy, 'pack permeability');
    const prop = proppedFrac({
      massKg: g.schedule.massKg, xfM: p.xfM, hfM: p.hfM,
      rhoKgM3: row.rhoKgM3, packPorosity: row.packPorosity,
      kfM2: perm.kM2, damageFactor: p.damageFactor,
    });
    close(prop.wpM, g.proppantPack.wpM, 1e-9 + 1e-6 * g.proppantPack.wpM, 'propped width');
    const prod = fracProductivity({
      kfwM3: prop.kfwM3, kM2: p.kMd * MDM2, xfM: p.xfM, rwM: p.rwM,
    });
    close(prod.cfd, g.productivity.cfd, 1e-6, 'C_fD');
    close(prod.sF, g.productivity.sF, 1e-6 * Math.abs(g.productivity.sF), 'pseudo-skin');
    close(prod.rwPrimeM, g.productivity.rwPrimeM, 1e-6 * g.productivity.rwPrimeM, 'effective rw');
    // Hand value at the optimum + the infinite-conductivity limit.
    const at = (cfd: number) => fracProductivity({
      kfwM3: cfd * MDM2 * p.xfM, kM2: MDM2, xfM: p.xfM, rwM: p.rwM,
    });
    close(at(1.6).f, 1.3841, 1e-3, 'Cinco-Ley f(1.6)');
    close(at(1000).f, Math.log(2), 0.05 * Math.log(2), 'infinite-conductivity limit');
    // Acidizing closed forms + golden block.
    close(hawkinsSkin({ kOverKs: 5, rsM: 0.5, rwM: 0.1 }), 4 * Math.log(5), 1e-12, 'Hawkins');
    const a = p.acid;
    const sand = sandstoneAcid({
      rwM: p.rwM, raM: a.raM, hM: a.hM, porosity: a.porosity,
      pvFactor: p.pvFactor, kOverKs: a.kOverKs, rsM: a.rsM,
    });
    close(sand.volumeM3, g.acidizing.sandstone.volumeM3, 1e-9 * g.acidizing.sandstone.volumeM3, 'acid volume');
    close(sand.sAfter, g.acidizing.sandstone.sAfter, 1e-9 + 1e-9, 'skin after');
    const carb = carbonateAcid({
      rwM: p.rwM, hM: a.hM, porosity: a.porosity, volumeM3: a.volumeM3, pvBt: p.pvBt,
    });
    close(carb.skin, g.acidizing.carbonate.skin, 1e-8, 'carbonate skin');
    if (!(carb.skin < 0)) throw new Error('carbonate skin not negative');
    const q = maxMatrixRate({
      kM2: p.kMd * MDM2, hM: a.hM, pFracPa: p.closurePa, pResPa: p.pResPa,
      muPaS: 1e-3, reM: p.reM, rwM: p.rwM, sSkin: sand.sBefore,
    });
    close(q.qM3s, g.acidizing.qMaxM3s, 1e-9 + 1e-6 * g.acidizing.qMaxM3s, 'matrix ceiling');
  });

  gate('A30', 'barrier truth table + MAASP / RP 90 MAWOP vs oracle', () => {
    const g = goldens('wellintegrity_cases.json');
    const GRAV = 9.80665;
    // Full 16-row categorization truth table.
    for (const row of g.categoryTable) {
      const got = wellCategory({ primary: row.primary, secondary: row.secondary });
      if (got.category !== row.category) {
        throw new Error(`category ${row.primary}/${row.secondary}: ${got.category} vs ${row.category}`);
      }
    }
    // Envelope roll-up + the golden barrier fixture.
    if (envelopeStatus([{ status: 'verified' }, { status: 'not-verified' }]) !== 'degraded') {
      throw new Error('not-verified must degrade');
    }
    const out = verifyBarriers({ elements: g.barrier.elements });
    if (out.primary.status !== g.barrier.primaryStatus
      || out.secondary.status !== g.barrier.secondaryStatus
      || out.category !== g.barrier.category) {
      throw new Error(`barrier fixture: ${out.primary.status}/${out.secondary.status}/${out.category}`);
    }
    // MAASP closed form (hand fixture at the trajectory TVD).
    const f = g.params.maaspFixture;
    const rho = g.params.annulusFluidDensityKgM3;
    const single = maaspRows({
      annulusFluidDensityKgM3: rho,
      elements: [{ name: 'x', limitPa: f.limitPa, factor: f.factor, tvdM: f.tvdM, backupDensityKgM3: f.backupDensityKgM3 }],
    });
    const hand = f.factor * f.limitPa - (rho - f.backupDensityKgM3) * GRAV * f.tvdM;
    close(single.rows[0].allowSurfacePa, hand, 1e-12, 'MAASP closed form');
    close(single.rows[0].allowSurfacePa, g.annulus.maaspFixtureAllowPa, 1e-9 * Math.abs(g.annulus.maaspFixtureAllowPa), 'MAASP vs oracle');
    // MAWOP rows + governing on the slant well.
    const cands = g.params.mawopCandidates.map((c: any, i: number) => ({
      name: c.name, role: c.role, limitPa: c.limitPa,
      tvdM: g.annulus.mawop.rows[i].tvdM, backupDensityKgM3: c.backupDensityKgM3,
    }));
    const mw = mawop({ annulusFluidDensityKgM3: rho, candidates: cands });
    if (mw.governing !== g.annulus.mawop.governing) throw new Error(`governing ${mw.governing}`);
    close(mw.mawopPa, g.annulus.mawop.mawopPa, 1e-9 * g.annulus.mawop.mawopPa, 'MAWOP');
    mw.rows.forEach((r: any, i: number) => {
      close(r.allowSurfacePa, g.annulus.mawop.rows[i].allowSurfacePa,
        1e-9 * Math.abs(g.annulus.mawop.rows[i].allowSurfacePa) + 1e-6, `MAWOP row ${i}`);
    });
  });

  gate('A31', 'balanced plug + D-010 rules + program compliance vs oracle', () => {
    const g = goldens('wellintegrity_cases.json');
    // Hand fixture: plugged top 1820 m exactly; balance identities.
    const bp = balancedPlug(g.params.plugFixture);
    close(bp.pluggedTopMdM, 1820, 1e-12, 'plugged top hand case');
    close(bp.slurryM3, g.plug.slurryM3, 1e-9 * g.plug.slurryM3, 'slurry volume');
    close(bp.balancedHeightM, g.plug.balancedHeightM, 1e-9 * g.plug.balancedHeightM, 'balanced height');
    close(bp.displacementM3, g.plug.displacementM3, 1e-9 * g.plug.displacementM3 + 1e-9, 'displacement');
    close(bp.spacerBehindM3 / bp.cInM2, g.params.plugFixture.spacerAheadM3 / bp.cAnnM2, 1e-12, 'spacer balance');
    const bp0 = balancedPlug({ ...g.params.plugFixture, excessFrac: 0 });
    close(bp0.pluggedTopMdM, g.params.plugFixture.plugTopMdM, 1e-12, 'zero-excess identity');
    // Rule checks.
    if (!plugRuleCheck({ plug: { topMdM: 2380, bottomMdM: 2520, foundation: 'mechanical' }, sourceTopMdM: 2500 }).pass) {
      throw new Error('foundation plug should pass');
    }
    if (plugRuleCheck({ plug: { topMdM: 2470, bottomMdM: 2580, foundation: 'none' }, sourceTopMdM: 2500 }).pass) {
      throw new Error('30 m above the source must fail');
    }
    if (!annularBarrierCheck({ topMdM: 0, bottomMdM: 40, verifiedByLog: true }).pass
      || annularBarrierCheck({ topMdM: 0, bottomMdM: 40, verifiedByLog: false }).pass) {
      throw new Error('annular cement 30/100 rule');
    }
    // Program fixture: zone verdicts, qualifying lists, takeoff.
    const prog = abandonmentProgram({ zones: g.program.zones, plugs: g.program.plugs });
    prog.zoneCompliance.forEach((z: any, i: number) => {
      const e = g.program.zoneCompliance[i];
      if (z.pass !== e.passZone) throw new Error(`zone ${z.zone} verdict`);
      if (JSON.stringify(z.primaryQualifying) !== JSON.stringify(e.primaryQualifying)
        || JSON.stringify(z.secondaryQualifying) !== JSON.stringify(e.secondaryQualifying)) {
        throw new Error(`zone ${z.zone} qualifying lists`);
      }
    });
    if (prog.pass !== g.program.programPass) throw new Error('program verdict');
    close(prog.takeoff.slurryM3, g.program.p1Placement.slurryM3, 1e-9 * g.program.p1Placement.slurryM3, 'takeoff');
  });

  gate('A32', 'schedule / AFE / accrual identity / cost-per-m / benchmark vs oracle', () => {
    const g = goldens('wellcost_cases.json');
    const doc = g.caseDoc;
    // Per-kind duration closed forms on the hand well's activities.
    close(activityDuration({ kind: 'drill', fromMdM: 500, toMdM: 2000, ropMPerHr: 15 }), 100, 1e-12, 'drill duration');
    close(activityDuration({ kind: 'trip', mdM: 2000, tripSpeedMPerHr: 500 }), 8, 1e-12, 'trip duration');
    close(activityDuration({ kind: 'casing', mdM: 2000, runSpeedMPerHr: 400, flatHr: 19 }), 24, 1e-12, 'casing duration');
    // Whole-program schedule vs the oracle (NPT stretch, exact hours).
    const prog = evaluateProgram(doc.program);
    close(prog.totals.productiveHr, g.totals.productiveHr, 1e-12, 'productive hours');
    close(prog.totals.totalHr, g.totals.totalHr, 1e-12, 'total hours');
    close(prog.totals.totalDays, 18, 1e-12, 'total days hand value');
    close(prog.totals.drilledM, g.totals.drilledM, 1e-12, 'drilled metres');
    prog.curve.forEach((p: any, i: number) => {
      close(p.tHr, g.curve[i].tHr, 1e-12, `curve t ${i}`);
      close(p.mdM, g.curve[i].mdM, 1e-12, `curve md ${i}`);
    });
    // AFE rollup vs the oracle (exact arithmetic).
    const afe = afeCosts({
      items: doc.costs.items, totalDays: prog.totals.totalDays,
      drilledM: prog.totals.drilledM, contingencyFrac: doc.costs.contingencyFrac,
    });
    afe.byItem.forEach((r: any, i: number) => {
      close(r.amountUsd, g.afe.byItem[i].amountUsd, 1e-12, `item ${r.id}`);
    });
    close(afe.tangibleUsd, g.afe.tangibleUsd, 1e-12, 'tangible');
    close(afe.baseUsd, g.afe.baseUsd, 1e-12, 'base');
    close(afe.totalUsd, g.afe.totalUsd, 1e-12, 'AFE total');
    // Cost-time accrual: golden points, the 2,260,000 checkpoint, and
    // the endpoint identity (final accrual == base subtotal).
    const cc = wcCostTimeCurve({ program: prog, items: doc.costs.items });
    cc.forEach((p: any, i: number) => {
      close(p.usd, g.costCurve[i].usd, 1e-12, `accrual ${i}`);
    });
    const cp = cc.find((p: any) => p.tHr === g.costCurveCheckpoint.tHr);
    close(cp.usd, g.costCurveCheckpoint.usd, 1e-12, 'accrual checkpoint');
    close(cc[cc.length - 1].usd, afe.baseUsd, 1e-12, 'endpoint identity');
    // ADE ch.1 cost per metre + the benchmark suggestion fixture.
    close(costPerMeter(g.costPerMeter.inputs), g.costPerMeter.usdPerM, 1e-12, 'cost per metre');
    const bm = benchmarkSuggestion(g.benchmark.inputs);
    for (const [k, v] of Object.entries(g.benchmark.suggestion)) {
      if ((bm as any)[k] !== v) throw new Error(`benchmark suggestion ${k}: ${(bm as any)[k]} vs ${v}`);
    }
  });

  gate('A33', 'canonical-sampler Monte Carlo vs oracle analytic identities', () => {
    const g = goldens('wellcost_cases.json');
    const an = g.mc.analytic;
    // Seeded PRNG (mulberry32) so the statistical assertion is
    // deterministic; the sampling math is the canonical module's.
    let a = 7 >>> 0;
    const rng = () => {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const key = (u: any) => `${u.target}:${u.id}:${u.field}`;
    const inputs: any = {};
    for (const u of g.mc.uncertainties) inputs[key(u)] = u.dist;
    const { sample } = createCorrelatedSampler({
      inputs, paramOrder: g.mc.uncertainties.map(key), rng,
    });
    const N = 20000;
    const costs: number[] = [];
    for (let i = 0; i < N; i++) {
      const { values } = sample();
      const acts = g.mc.program.activities.map((row: any) => ({ ...row }));
      const items = g.mc.costs.items.map((row: any) => ({ ...row }));
      for (const u of g.mc.uncertainties) {
        const list = u.target === 'activity' ? acts : items;
        const row = list.find((r: any) => r.id === u.id);
        row[u.field] = values[key(u)];
      }
      const prog = evaluateProgram({ activities: acts, nptFrac: 0 });
      const afe = afeCosts({
        items, totalDays: prog.totals.totalDays,
        drilledM: prog.totals.drilledM, contingencyFrac: 0,
      });
      costs.push(afe.baseUsd);
    }
    const mean = costs.reduce((s, v) => s + v, 0) / N;
    const varSum = costs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (N - 1);
    close(mean, an.meanUsd, 5 * (an.sdUsd / Math.sqrt(N)), 'MC mean (5 standard errors)');
    close(varSum, an.varUsd, 0.05 * an.varUsd, 'MC variance (5%)');
    const sorted = [...costs].sort((x, y) => x - y);
    const p10 = sorted[Math.floor(0.1 * N)];
    const p50 = sorted[Math.floor(0.5 * N)];
    const p90 = sorted[Math.floor(0.9 * N)];
    if (!(p10 < p50 && p50 < p90)) throw new Error('percentile ordering');
    if (!(p10 > sorted[0] && p90 < sorted[N - 1])) throw new Error('percentile bounds');
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
    ['L15', 'Karakas-Tariq SPE 18247 / Economides PPS worked example + vendor gun data'],
    ['L16', 'sand control selection + underbalance published criteria (Tiffin SPE 39437; King/Behrmann)'],
    ['L17', 'Economides PPS / Valko-Economides frac worked examples'],
    ['L18', 'proppant vendor conductivity data (API RP 19D cells)'],
    ['L19', 'NORSOK D-010 well barrier / plug requirement tables'],
    ['L20', 'API RP 90 annular casing pressure worked example'],
    ['L21', 'ADE ch.1 (Bourgoyne et al.) drilling cost analysis worked example'],
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
