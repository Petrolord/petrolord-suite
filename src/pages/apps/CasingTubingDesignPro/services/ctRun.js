// Casing & Tubing Design Studio pure run service (D6/U1): assembles engine
// inputs from a saved case doc + the definitive trajectory and returns the
// full results object. NO React, NO supabase, NO '@/' aliases — imported by
// jest and the Playwright e2e spec to recompute UI expectations.
//
// Units: SI end to end (m, Pa, N, kg/m³, °C). Catalog identity keeps the
// field-unit names (odIn, weightLbFt) — dimensions resolve to SI through the
// validated engine catalog. Depths in the case doc are MD metres along the
// wellbore; load-case physics runs in TVD via the exact minimum-curvature
// tvdAt.

import {
  barlowBurstPa, api5c3CollapsePa, pipeBodyYieldN, jointStrengthN,
  loadCaseProfiles, evaluateString, tubingLoads, erosionalVelocityMs,
  LOAD_CASE_KINDS,
} from '../engine/tubularDesign';
import {
  CASING_CATALOG, TUBING_CATALOG, CASING_GRADES, casingGradeYieldPa,
  CONNECTION_EFFICIENCIES,
} from '../engine/tubulars';
import { tvdAt } from '../engine/wellControl';

const G = 9.80665;
export const PSI_PER_PA = 1 / 6894.757293168;
export const FT_PER_M = 3.280839895;
export const ENGINE_VERSION = 'drilling-ct6';

export { LOAD_CASE_KINDS };
export const TUBING_CASE_KINDS = ['production', 'injection', 'stimulation', 'shutIn'];

// ---- catalog ---------------------------------------------------------------

export function findCatalogRow(kind, odIn, weightLbFt) {
  const table = kind === 'tubing' ? TUBING_CATALOG : CASING_CATALOG;
  return table.find(
    (r) => Math.abs(r.odIn - odIn) < 1e-6 && Math.abs(r.weightLbFt - weightLbFt) < 1e-6,
  ) || null;
}

export function connectionEfficiency(name) {
  const c = CONNECTION_EFFICIENCIES.find((x) => x.name === name);
  return c ? c.efficiency : 1;
}

// Computed ratings for a catalog row + grade (the CatalogBrowser columns).
export function catalogRatings(row, gradeName, connName = 'BTC') {
  const yieldPa = casingGradeYieldPa(gradeName);
  if (!row || !yieldPa) return null;
  const col = api5c3CollapsePa({ odM: row.odM, wallM: row.wallM, yieldPa });
  return {
    burstPa: barlowBurstPa({ odM: row.odM, wallM: row.wallM, yieldPa }),
    collapsePa: col.collapsePa,
    collapseRegime: col.regime,
    bodyYieldN: pipeBodyYieldN({ odM: row.odM, idM: row.idM, yieldPa }),
    jointStrengthN: jointStrengthN({
      odM: row.odM, idM: row.idM, yieldPa,
      connectionEfficiency: connectionEfficiency(connName),
    }),
  };
}

// The full browsable catalog with engine-computed ratings.
export function browsableCatalog(gradeNames = ['K-55', 'L-80', 'N-80', 'P-110', 'Q-125']) {
  const out = [];
  for (const row of CASING_CATALOG) {
    for (const g of gradeNames) {
      out.push({ ...row, grade: g, ...catalogRatings(row, g) });
    }
  }
  for (const row of TUBING_CATALOG) {
    for (const g of ['J-55', 'L-80', 'P-110']) {
      out.push({ ...row, grade: g, ...catalogRatings(row, g) });
    }
  }
  return out;
}

export { CASING_GRADES, CONNECTION_EFFICIENCIES, CASING_CATALOG, TUBING_CATALOG };

// ---- case doc defaults -----------------------------------------------------

let seq = 0;
const uid = (p) => { seq += 1; return `${p}-${seq}-${Math.abs(Math.trunc(Math.sin(seq) * 1e9))}`; };

export function defaultEnvironment() {
  return {
    mudKgM3: 1440,
    seawaterKgM3: 1030,
    cementKgM3: 1900,
    gasGradPaPerM: 2300,
    packerFluidKgM3: 1150,
    tempSurfC: 20,
    tempGradCPerM: 0.03,
    mixtureKgM3: 700,
    bendingDlsDegPer30m: 0,
    ppfg: { source: 'manual', geoWellId: null, ppEmwAtShoeKgM3: 1200, fracEmwAtShoeKgM3: 1800 },
  };
}

export function defaultCasingLoadCases() {
  return [
    { id: uid('lc'), name: 'Gas Kick (Burst)', kind: 'gasKickBurst', target: 'casing', params: {} },
    { id: uid('lc'), name: 'Pressure Test', kind: 'pressureTestBurst', target: 'casing', params: { testPressurePa: 35e6 } },
    { id: uid('lc'), name: 'Full Evacuation', kind: 'fullEvacuationCollapse', target: 'casing', params: {} },
    { id: uid('lc'), name: 'Cementing', kind: 'cementingCollapse', target: 'casing', params: {} },
    { id: uid('lc'), name: 'Running (Overpull)', kind: 'runningAxial', target: 'casing', params: { overpullN: 4.45e5 } },
  ];
}

export function defaultTubingLoadCases() {
  return [
    { id: uid('lc'), name: 'Production', kind: 'production', target: 'tubing', params: { surfacePressurePa: 10e6, internalKgM3: 700 } },
    { id: uid('lc'), name: 'Injection', kind: 'injection', target: 'tubing', params: { surfacePressurePa: 20e6, internalKgM3: 1000, deltaOpC: -30 } },
    { id: uid('lc'), name: 'Stimulation', kind: 'stimulation', target: 'tubing', params: { surfacePressurePa: 45e6, internalKgM3: 1050, deltaOpC: -50 } },
  ];
}

export function defaultCaseDoc({ shoeMdM = 3000 } = {}) {
  return {
    strings: {
      casingStrings: [{
        id: uid('cs'),
        name: 'Production Casing',
        sections: [{
          id: uid('sec'), name: 'Prod-1', topMdM: 0, bottomMdM: shoeMdM,
          odIn: 9.625, weightLbFt: 47, grade: 'L-80', connection: 'BTC', kind: 'casing',
        }],
      }],
      tubingStrings: [{
        id: uid('ts'),
        name: 'Production Tubing',
        sections: [{
          id: uid('sec'), name: 'Tbg-1', topMdM: 0, bottomMdM: Math.max(shoeMdM - 100, 100),
          odIn: 3.5, weightLbFt: 9.3, grade: 'L-80', connection: 'EUE', kind: 'tubing',
        }],
      }],
    },
    environment: defaultEnvironment(),
    loadCases: [...defaultCasingLoadCases(), ...defaultTubingLoadCases()],
    packer: {
      hasPacker: true, depthMdM: Math.max(shoeMdM - 150, 100),
      sealBoreIn: 4.0, ratingN: 6.7e5, strokeM: 1.5, type: 'Permanent',
    },
    safetyFactors: { burst: 1.1, collapse: 1.0, tension: 1.6, triaxial: 1.25 },
  };
}

// Build the oracle-golden case doc from the tubular_cases.json content —
// pure so both the in-memory backend (JSON import) and the Playwright spec
// (fs read, no import attributes in Node ESM) share one construction.
export function buildGoldenCaseDoc(golden) {
  const ENV = golden.env;
  return {
    strings: {
      casingStrings: [{
        id: 'cs-1',
        name: 'Production Casing',
        sections: golden.sectionsMd.map((s, i) => ({
          id: `sec-${i + 1}`,
          name: i === 0 ? 'Upper' : 'Lower',
          topMdM: s.topMdM,
          bottomMdM: s.bottomMdM,
          odIn: s.odIn,
          weightLbFt: s.weightLbFt,
          grade: s.grade,
          connection: s.connection,
          kind: 'casing',
        })),
      }],
      tubingStrings: [{
        id: 'ts-1',
        name: 'Production Tubing',
        sections: [{
          id: 'tsec-1', name: 'Tbg-1', topMdM: 0, bottomMdM: 2500,
          odIn: 3.5, weightLbFt: 9.3, grade: 'L-80', connection: 'EUE', kind: 'tubing',
        }],
        components: [],
      }],
    },
    environment: {
      ...defaultEnvironment(),
      mudKgM3: ENV.mudKgM3,
      seawaterKgM3: ENV.seawaterKgM3,
      cementKgM3: ENV.cementKgM3,
      gasGradPaPerM: ENV.gasGradPaPerM,
      packerFluidKgM3: ENV.packerFluidKgM3,
      bendingDlsDegPer30m: golden.bendingDlsDegPer30m,
      ppfg: {
        source: 'published', geoWellId: 'gw-1',
        ppEmwAtShoeKgM3: 1200, fracEmwAtShoeKgM3: ENV.fracEmwAtShoeKgM3,
      },
    },
    loadCases: [
      { id: 'lc-kick', name: 'Gas Kick (Burst)', kind: 'gasKickBurst', target: 'casing', params: {} },
      { id: 'lc-test', name: 'Pressure Test', kind: 'pressureTestBurst', target: 'casing', params: { testPressurePa: ENV.testPressurePa } },
      { id: 'lc-evac', name: 'Full Evacuation', kind: 'fullEvacuationCollapse', target: 'casing', params: {} },
      { id: 'lc-pevac', name: 'Partial Evacuation', kind: 'partialEvacuationCollapse', target: 'casing', params: { evacuationFraction: ENV.evacuationFraction } },
      { id: 'lc-cmt', name: 'Cementing', kind: 'cementingCollapse', target: 'casing', params: {} },
      { id: 'lc-run', name: 'Running (Overpull)', kind: 'runningAxial', target: 'casing', params: { overpullN: ENV.overpullN } },
      { id: 'lc-cust', name: 'Custom Gradients', kind: 'customGradient', target: 'casing', params: { internalKgM3: ENV.internalKgM3, externalKgM3: ENV.externalKgM3, surfacePressurePa: ENV.surfacePressurePa } },
      { id: 'lc-prod', name: 'Production', kind: 'production', target: 'tubing', params: { surfacePressurePa: 10e6, internalKgM3: 700 } },
      { id: 'lc-inj', name: 'Injection', kind: 'injection', target: 'tubing', params: { surfacePressurePa: 20e6, internalKgM3: 1000, deltaOpC: -30 } },
      { id: 'lc-stim', name: 'Stimulation', kind: 'stimulation', target: 'tubing', params: { surfacePressurePa: 45e6, internalKgM3: 1050, deltaOpC: -50 } },
    ],
    packer: {
      hasPacker: true, depthMdM: 2500, sealBoreIn: 4.0,
      ratingN: 6.7e5, strokeM: 1.5, type: 'Permanent',
    },
    safetyFactors: { ...golden.designFactors },
  };
}

// ---- section resolution ----------------------------------------------------

// Resolve a section's catalog identity to SI dims + strengths. Throws with an
// actionable message when the (OD, weight) pair is not a catalog row.
export function resolveSection(sec) {
  const row = findCatalogRow(sec.kind || 'casing', sec.odIn, sec.weightLbFt);
  if (!row) {
    throw new Error(`No API 5CT catalog row for ${sec.odIn}" ${sec.weightLbFt}# — pick from the catalog.`);
  }
  const yieldPa = casingGradeYieldPa(sec.grade);
  if (!yieldPa) throw new Error(`Unknown grade '${sec.grade}'.`);
  return {
    ...sec,
    odM: row.odM,
    wallM: row.wallM,
    idM: row.idM,
    weightKgM: row.weightKgM,
    yieldPa,
    connectionEfficiency: connectionEfficiency(sec.connection),
  };
}

// ---- casing evaluation -----------------------------------------------------

function envForCase(environment, lc) {
  const ppfg = environment.ppfg || {};
  return {
    ...environment,
    fracEmwAtShoeKgM3: ppfg.fracEmwAtShoeKgM3 ?? null,
    ...lc.params,
  };
}

export function runCasingString({ str, loadCases, environment, safetyFactors, stations }) {
  const resolved = str.sections.map((s) => resolveSection({ ...s, kind: 'casing' }));
  const shoeMdM = Math.max(...resolved.map((s) => s.bottomMdM));
  const tdMdM = stations[stations.length - 1].md;
  if (shoeMdM > tdMdM + 1e-6) {
    throw new Error(`Casing shoe at ${Math.round(shoeMdM)} m MD is beyond the definitive trajectory (TD ${Math.round(tdMdM)} m).`);
  }
  const shoeTvdM = tvdAt(stations, shoeMdM);
  const totalLen = resolved.reduce((a, s) => a + (s.bottomMdM - s.topMdM), 0);
  const weightKgM = totalLen > 0
    ? resolved.reduce((a, s) => a + s.weightKgM * (s.bottomMdM - s.topMdM), 0) / totalLen
    : resolved[0].weightKgM;
  const engineSections = resolved.map((s) => ({
    id: s.id,
    topTvdM: tvdAt(stations, s.topMdM) ?? 0,
    bottomTvdM: tvdAt(stations, s.bottomMdM) ?? shoeTvdM,
    odM: s.odM,
    wallM: s.wallM,
    yieldPa: s.yieldPa,
    connectionEfficiency: s.connectionEfficiency,
  }));
  const cases = loadCases.filter((lc) => lc.target !== 'tubing').map((lc) => {
    const profile = loadCaseProfiles({
      kind: lc.kind,
      shoeTvdM,
      env: envForCase(environment, lc),
      string: { weightKgM },
    });
    const evalRes = evaluateString({
      sections: engineSections,
      profile,
      safetyFactors,
      bendingDlsDegPer30m: environment.bendingDlsDegPer30m || 0,
    });
    const sections = evalRes.sections.map((r, i) => ({
      ...r,
      name: resolved[i].name,
      grade: resolved[i].grade,
      odIn: resolved[i].odIn,
      weightLbFt: resolved[i].weightLbFt,
      topMdM: resolved[i].topMdM,
      bottomMdM: resolved[i].bottomMdM,
    }));
    const status = sections.some((s) => s.status === 'FAIL') ? 'FAIL'
      : sections.some((s) => s.status === 'WARNING') ? 'WARNING' : 'PASS';
    return {
      loadCaseId: lc.id, name: lc.name, kind: lc.kind, profile, sections, status,
    };
  });
  return {
    stringId: str.id, stringName: str.name, shoeMdM, shoeTvdM, weightKgM, cases,
    buoyedWeightN: totalLen * weightKgM * G * (1 - environment.mudKgM3 / 7850),
  };
}

// ---- tubing evaluation -----------------------------------------------------

// Map a canonical tubing operating case to Lubinski packer-datum pressure
// CHANGES vs the landed condition (packer fluid balanced inside and out).
export function tubingCaseDeltas({ lc, environment, packerTvdM }) {
  const pf = environment.packerFluidKgM3 ?? environment.mudKgM3;
  const pInit = pf * G * packerTvdM;
  const p = lc.params || {};
  const rhoI = p.internalKgM3 ?? pf;
  const surfI = p.surfacePressurePa ?? 0;
  const piFinal = surfI + rhoI * G * packerTvdM;
  const surfA = p.annulusSurfacePressurePa ?? 0;
  const rhoA = p.annulusKgM3 ?? pf;
  const poFinal = surfA + rhoA * G * packerTvdM;
  return { dPiPa: piFinal - pInit, dPoPa: poFinal - pInit };
}

export function runTubing({ caseDoc, stations }) {
  const { strings, environment, packer, loadCases, safetyFactors } = caseDoc;
  const tubingStr = strings.tubingStrings[0];
  if (!tubingStr || !tubingStr.sections.length || !packer?.hasPacker) return null;
  const resolved = tubingStr.sections.map((s) => resolveSection({ ...s, kind: 'tubing' }));
  const tdMdM = stations[stations.length - 1].md;
  if (packer.depthMdM > tdMdM + 1e-6) {
    throw new Error(`Packer at ${Math.round(packer.depthMdM)} m MD is beyond the definitive trajectory (TD ${Math.round(tdMdM)} m).`);
  }
  const packerTvdM = tvdAt(stations, packer.depthMdM);
  // Deepest tubing section carries the packer datum.
  const bottom = resolved.reduce((a, b) => (b.bottomMdM > a.bottomMdM ? b : a));
  // Casing ID at the packer: the section of the deepest-shoe casing string
  // that spans the packer MD (radial clearance for buckling).
  let casingIdM = null;
  const casingStrings = strings.casingStrings || [];
  if (casingStrings.length) {
    const deepest = casingStrings
      .map((s) => ({ s, shoe: Math.max(...s.sections.map((x) => x.bottomMdM)) }))
      .sort((a, b) => b.shoe - a.shoe)[0].s;
    const at = deepest.sections.find(
      (x) => packer.depthMdM >= x.topMdM - 1e-9 && packer.depthMdM <= x.bottomMdM + 1e-9,
    );
    if (at) {
      const row = findCatalogRow('casing', at.odIn, at.weightLbFt);
      if (row) casingIdM = row.idM;
    }
  }
  const lengthM = packer.depthMdM;
  const cases = loadCases.filter((lc) => lc.target === 'tubing').map((lc) => {
    const { dPiPa, dPoPa } = tubingCaseDeltas({ lc, environment, packerTvdM });
    const p = lc.params || {};
    const heating = lc.kind === 'production';
    const loads = tubingLoads({
      tubing: {
        odM: bottom.odM, idM: bottom.idM, lengthM, weightKgM: bottom.weightKgM,
        yieldPa: bottom.yieldPa,
      },
      packer: {
        sealBoreM: (packer.sealBoreIn ?? 4.0) * 0.0254,
        hasPacker: true,
        ratingN: packer.ratingN ?? 4.45e5,
        strokeM: packer.strokeM ?? 0,
      },
      loadCase: { dPiPa, dPoPa, externalKgM3: environment.packerFluidKgM3 ?? environment.mudKgM3 },
      tempProfile: {
        surfC: environment.tempSurfC,
        gradCPerM: environment.tempGradCPerM,
        deltaOpC: p.deltaOpC ?? (heating ? undefined : 0),
      },
      casingIdM,
    });
    // Status semantics (documented in the help guide): a seal-stroke
    // exceedance or a packer-rating violation FAILs the case; buckling
    // onset (either mode) flags a WARNING for the completion engineer —
    // helical tubing buckling is often tolerable when stresses stay
    // elastic, which is beyond this v1 (no corkscrewing check).
    const sfOk = loads.packer.sf == null || loads.packer.sf >= 1.0;
    const status = (!sfOk || loads.packer.strokeOk === false) ? 'FAIL'
      : loads.buckling.state !== 'none' ? 'WARNING' : 'PASS';
    return { loadCaseId: lc.id, name: lc.name, kind: lc.kind, dPiPa, dPoPa, loads, status };
  });
  const erosional = {
    veMs: erosionalVelocityMs({ mixtureKgM3: environment.mixtureKgM3 ?? 700 }),
    mixtureKgM3: environment.mixtureKgM3 ?? 700,
    cFactor: 100,
    idM: bottom.idM,
  };
  return {
    stringId: tubingStr.id, stringName: tubingStr.name, packerTvdM, casingIdM,
    lengthM, cases, erosional,
    tubing: { odIn: bottom.odIn, weightLbFt: bottom.weightLbFt, grade: bottom.grade },
  };
}

// ---- top level -------------------------------------------------------------

const minBy = (items, f) => items.reduce(
  (best, x) => (f(x) != null && (best == null || f(x) < f(best)) ? x : best), null,
);

export function runAll({ caseDoc, stations }) {
  const { strings, environment, loadCases, safetyFactors } = caseDoc;
  const casing = (strings.casingStrings || []).map((str) => runCasingString({
    str, loadCases, environment, safetyFactors, stations,
  }));
  const tubing = runTubing({ caseDoc, stations });

  // KPIs: governing minima over every string x case x section.
  const flat = [];
  for (const cs of casing) {
    for (const c of cs.cases) {
      for (const s of c.sections) {
        flat.push({ stringName: cs.stringName, caseName: c.name, ...s });
      }
    }
  }
  const kpi = (key, atKey) => {
    const worst = minBy(flat.filter((f) => Number.isFinite(f[key])), (f) => f[key]);
    return worst ? {
      value: worst[key], stringName: worst.stringName, caseName: worst.caseName,
      tvdM: atKey ? worst[atKey] : null, section: worst.name,
    } : null;
  };
  const warnings = [];
  for (const f of flat) {
    if (f.status === 'FAIL') {
      warnings.push({
        severity: 'high',
        message: `${f.stringName} / ${f.name}: FAIL under ${f.caseName}`
          + ` (burst ${fmtSF(f.burstSF)}, collapse ${fmtSF(f.collapseSF)},`
          + ` tension ${fmtSF(f.tensionSF)}, triaxial ${fmtSF(f.triaxSF)})`,
      });
    }
  }
  if (tubing) {
    for (const c of tubing.cases) {
      if (c.status === 'FAIL') {
        warnings.push({
          severity: 'high',
          message: `${tubing.stringName}: FAIL under ${c.name}`
            + ` (buckling ${c.loads.buckling.state}, packer SF ${fmtSF(c.loads.packer.sf)})`,
        });
      }
    }
  }
  const statusOf = (xs) => (xs.some((x) => x === 'FAIL') ? 'FAIL'
    : xs.some((x) => x === 'WARNING') ? 'WARNING' : 'PASS');
  const overall = statusOf([
    ...casing.flatMap((cs) => cs.cases.map((c) => c.status)),
    ...(tubing ? tubing.cases.map((c) => c.status) : []),
  ]);
  return {
    engineVersion: ENGINE_VERSION,
    casing,
    tubing,
    kpis: {
      minBurst: kpi('burstSF', 'burstAtTvdM'),
      minCollapse: kpi('collapseSF', 'collapseAtTvdM'),
      minTension: kpi('tensionSF'),
      minTriaxial: kpi('triaxSF'),
      totalCasingBuoyedN: casing.reduce((a, c) => a + c.buoyedWeightN, 0),
      packerMinSF: tubing ? Math.min(...tubing.cases.map((c) => c.loads.packer.sf ?? Infinity)) : null,
      overall,
    },
    warnings,
  };
}

// ---- display helpers -------------------------------------------------------

export function fmtSF(v) {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return v >= 99 ? '>99' : v.toFixed(2);
}

export function paToMPa(v) { return v / 1e6; }
export function paToPsi(v) { return v * PSI_PER_PA; }
export function nToKN(v) { return v / 1e3; }

export function depthDisp(m, unit) {
  if (m == null) return null;
  return unit === 'ft' ? m * FT_PER_M : m;
}
export function depthStore(v, unit) {
  if (v == null || Number.isNaN(v)) return null;
  return unit === 'ft' ? v / FT_PER_M : v;
}
export function depthLabel(unit) { return unit === 'ft' ? 'ft' : 'm'; }

// EMW helper for the PPFG hint (Pa at TVD -> kg/m³).
export function emwKgM3(pPa, tvdM) {
  if (!(tvdM > 0)) return null;
  return pPa / (G * tvdM);
}
