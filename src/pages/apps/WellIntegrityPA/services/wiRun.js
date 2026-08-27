// Well Integrity & P&A pure run service (D10/WI1): assembles engine
// inputs from a saved case doc and returns the full results object.
// NO React, NO supabase, NO '@/' aliases — imported by jest and the
// Playwright e2e spec to recompute UI expectations.
//
// Units: SI in storage (m, Pa, kg/m3, m3). Annulus element depths are
// entered as MD and converted to TVD on the definitive trajectory with
// the exact partial minimum-curvature tvdAt (D3); with no trajectory the
// TVD falls back to MD with an explicit warning.

import {
  verifyBarriers, mawop, maaspRows, ELEMENT_KINDS, ELEMENT_STATUSES,
  RP90_MAWOP_FACTORS,
} from '../engine/wellIntegrity';
import {
  balancedPlug, plugRuleCheck, annularBarrierCheck, abandonmentProgram,
  D010_DEFAULT_RULES,
} from '../engine/plugAbandonment';
import { tvdAt } from '../../WellControlStudio/engine/wellControl';
import { depthDisp, depthStore, depthLabel, FT_PER_M } from '../../CasingTubingDesignPro/services/ctRun';

export const ENGINE_VERSION = 'drilling-wi10';
export {
  depthDisp, depthStore, depthLabel, FT_PER_M,
  ELEMENT_KINDS, ELEMENT_STATUSES, RP90_MAWOP_FACTORS, D010_DEFAULT_RULES,
  balancedPlug, plugRuleCheck, annularBarrierCheck,
};

export const MAWOP_ROLES = [
  { role: 'outer-casing-burst', label: 'Outer casing burst (50%)' },
  { role: 'inner-casing-burst', label: 'Inner casing burst (80%)' },
  { role: 'inner-tubing-collapse', label: 'Inner tubing collapse (75%)' },
  { role: 'shoe-formation', label: 'Casing shoe formation strength' },
  { role: 'rating', label: 'Rated equipment (wellhead, tree)' },
];

// ---- case doc --------------------------------------------------------------

let seq = 0;
const eid = () => { seq += 1; return `el-${seq}`; };

export function defaultCaseDoc({ tdMdM = 3000 } = {}) {
  const resTop = Math.max(tdMdM - 500, 200);
  return {
    name: 'Integrity 1',
    barrier: {
      flowPotential: true,
      elements: [
        { id: eid(), name: 'Casing cement (production)', kind: 'casing-cement', envelope: 'primary', status: 'verified' },
        { id: eid(), name: 'Production casing below packer', kind: 'casing', envelope: 'primary', status: 'verified' },
        { id: eid(), name: 'Production packer', kind: 'production-packer', envelope: 'primary', status: 'verified' },
        { id: eid(), name: 'Completion string', kind: 'completion-string', envelope: 'primary', status: 'verified' },
        { id: eid(), name: 'DHSV', kind: 'dhsv', envelope: 'primary', status: 'verified' },
        { id: eid(), name: 'Casing cement (intermediate)', kind: 'casing-cement', envelope: 'secondary', status: 'verified' },
        { id: eid(), name: 'Production casing', kind: 'casing', envelope: 'secondary', status: 'verified' },
        { id: eid(), name: 'Wellhead', kind: 'wellhead', envelope: 'secondary', status: 'verified' },
        { id: eid(), name: 'Tubing hanger', kind: 'tubing-hanger', envelope: 'secondary', status: 'verified' },
        { id: eid(), name: 'Christmas tree', kind: 'xmas-tree', envelope: 'secondary', status: 'verified' },
      ],
    },
    annulus: {
      annuli: [{
        name: 'A',
        fluidDensityKgM3: 1030,
        elements: [
          { id: eid(), name: 'Production casing burst', role: 'outer-casing-burst', limitPa: 40e6, mdM: Math.min(1600, tdMdM * 0.55), backupDensityKgM3: 1030 },
          { id: eid(), name: 'Tubing collapse', role: 'inner-tubing-collapse', limitPa: 25e6, mdM: Math.min(1000, tdMdM * 0.35), backupDensityKgM3: 500 },
          { id: eid(), name: 'Wellhead rating', role: 'rating', limitPa: 34.5e6, mdM: 0, backupDensityKgM3: 0 },
        ],
      }],
    },
    pa: {
      zones: [
        { name: 'Reservoir', topMdM: resTop, bottomMdM: resTop + 100, flowPotential: true },
      ],
      plugs: [
        {
          name: 'Primary barrier plug', topMdM: Math.max(resTop - 120, 50), bottomMdM: resTop + 20,
          foundation: 'mechanical', isSurfacePlug: false,
          geometry: { holeIdM: 0.216, stingerOdM: 0.127, stingerIdM: 0.1086, excessFrac: 0.2, spacerAheadM3: 1 },
        },
        {
          name: 'Secondary barrier plug', topMdM: Math.max(resTop - 270, 50), bottomMdM: Math.max(resTop - 150, 150),
          foundation: 'none', isSurfacePlug: false,
          geometry: { holeIdM: 0.216, stingerOdM: 0.127, stingerIdM: 0.1086, excessFrac: 0.2, spacerAheadM3: 1 },
        },
        {
          name: 'Surface plug', topMdM: 0, bottomMdM: 60,
          foundation: 'none', isSurfacePlug: true, geometry: null,
        },
      ],
    },
    params: {},
    notes: '',
  };
}

// Build the oracle-golden case doc from wellintegrity_cases.json — pure
// so the in-memory backend (JSON import) and the Playwright spec (fs
// read) share one construction.
export function buildGoldenCaseDoc(golden) {
  const p = golden.params;
  return {
    name: 'Golden Integrity',
    barrier: {
      flowPotential: true,
      elements: golden.barrier.elements.map((e, i) => ({ id: `g-${i}`, ...e })),
    },
    annulus: {
      annuli: [{
        name: 'A',
        fluidDensityKgM3: p.annulusFluidDensityKgM3,
        elements: p.mawopCandidates.map((c, i) => ({
          id: `a-${i}`, name: c.name, role: c.role, limitPa: c.limitPa,
          mdM: c.mdM, backupDensityKgM3: c.backupDensityKgM3,
        })),
      }],
    },
    pa: {
      zones: golden.program.zones.map((z) => ({ ...z })),
      plugs: golden.program.plugs.map((pl) => ({ ...pl })),
    },
    params: {},
    notes: '',
  };
}

// ---- the full run ----------------------------------------------------------

export function runAll({ caseDoc, stations = null }) {
  const warnings = [];

  const barriers = verifyBarriers({
    elements: caseDoc.barrier.elements,
    flowPotential: caseDoc.barrier.flowPotential !== false,
  });

  const annuli = (caseDoc.annulus.annuli || []).map((a) => {
    if (!a.elements?.length) {
      return { name: a.name, fluidDensityKgM3: a.fluidDensityKgM3, result: null };
    }
    const candidates = a.elements.map((el) => ({
      name: el.name,
      role: el.role,
      limitPa: el.limitPa,
      tvdM: stations?.length ? tvdAt(stations, el.mdM) : el.mdM,
      backupDensityKgM3: el.backupDensityKgM3,
    }));
    return {
      name: a.name,
      fluidDensityKgM3: a.fluidDensityKgM3,
      result: mawop({ annulusFluidDensityKgM3: a.fluidDensityKgM3, candidates }),
    };
  });
  if (!stations?.length && (caseDoc.annulus.annuli || []).some((a) => a.elements?.length)) {
    warnings.push('No definitive trajectory: annulus element TVDs taken as MD.');
  }

  const program = abandonmentProgram({
    zones: caseDoc.pa.zones || [],
    plugs: caseDoc.pa.plugs || [],
  });

  const kpis = kpisOf({ barriers, annuli, program, warnings });
  return { barriers, annuli, program, warnings, kpis };
}

function kpisOf({ barriers, annuli, program, warnings }) {
  const aAnnulus = annuli.find((a) => a.result) || null;
  let status = 'PASS';
  if (barriers.category === 'red') status = 'FAIL';
  else if (barriers.category !== 'green' || !program.pass || warnings.length > 0
    || annuli.some((a) => a.result?.negative)) status = 'WARN';
  return {
    category: barriers.category,
    mawopPa: aAnnulus?.result?.mawopPa ?? null,
    governing: aAnnulus?.result?.governing ?? null,
    programPass: program.pass,
    slurryM3: program.takeoff.slurryM3,
    status,
  };
}

// ---- chart helpers ---------------------------------------------------------

// Allowable surface pressure per limiting element for the annulus chart.
export function annulusChartRows(annulusResult) {
  if (!annulusResult?.result) return [];
  return annulusResult.result.rows.map((r) => ({
    name: r.name,
    allowMPa: r.allowSurfacePa / 1e6,
    governing: r.name === annulusResult.result.governing,
  }));
}
