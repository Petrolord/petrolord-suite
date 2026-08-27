// Completion Design Studio pure run service (D7/CD1): assembles engine
// inputs from a saved case doc and returns the full results object.
// NO React, NO supabase, NO '@/' aliases — imported by jest and the
// Playwright e2e spec to recompute UI expectations.
//
// Units: SI in storage (m, m³, kg/m³, Pa). Component and casing identity
// keeps the familiar field-unit names (odIn, idIn, weightLbFt); dimensions
// resolve to SI here, once. The tubing sizing table is the one deliberate
// oilfield-unit island: it drives the Production nodal VLP engine
// (src/utils/nodal), which is validated in oilfield units end to end.

import {
  apiDriftM, buildStack, casingProgramProfile, runInClearance,
  throughBoreProfile, completionVolumes, sealSpaceOut,
} from '../engine/completionDesign';
import { EQUIPMENT_CATALOG, NIPPLE_BORES_IN } from '../engine/completionEquipment';
import { erosionalVelocityMs } from '../../CasingTubingDesignPro/engine/tubularDesign';
import {
  findCatalogRow, depthDisp, depthStore, depthLabel, FT_PER_M,
} from '../../CasingTubingDesignPro/services/ctRun';
import { buildFluidModel } from '../../../../utils/nodal/pvt';
import { buildTrajectory } from '../../../../utils/nodal/trajectory';
import { linearGeothermal } from '../../../../utils/nodal/temperature';
import { bhpFromWhp } from '../../../../utils/nodal/traverse';
import { TUBING_CATALOG, CASING_CATALOG } from '../../CasingTubingDesignPro/engine/tubulars';

const IN = 0.0254;
export const ENGINE_VERSION = 'drilling-cd7';
export { depthDisp, depthStore, depthLabel, FT_PER_M, EQUIPMENT_CATALOG, NIPPLE_BORES_IN };

let seq = 0;
const uid = (p) => {
  seq += 1;
  return `${p}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
};

// ---- catalog ---------------------------------------------------------------

// A component row for the string builder from an equipment catalog entry.
export function componentFromCatalog(row, overrides = {}) {
  return {
    id: uid('cmp'),
    type: row.type,
    name: row.name,
    lengthM: row.lengthM,
    odIn: row.odIn,
    idIn: row.idIn,
    approx: row.approx === true,
    eccentric: row.eccentric === true,
    notes: row.notes || '',
    ...overrides,
  };
}

export function catalogForTubingSize(odIn) {
  return EQUIPMENT_CATALOG.filter(
    (r) => r.forTubingOdIn == null || Math.abs(r.forTubingOdIn - odIn) < 1e-9,
  );
}

// ---- case doc --------------------------------------------------------------

export function defaultCaseDoc({ tdMdM = 3000 } = {}) {
  const kit = (type) => EQUIPMENT_CATALOG.find(
    (r) => r.type === type && r.forTubingOdIn === 3.5,
  );
  const packer = EQUIPMENT_CATALOG.find(
    (r) => r.type === 'packer' && /9-5\/8/.test(r.name),
  );
  return {
    name: 'Completion 1',
    string: {
      hangerMdM: 0,
      components: [
        componentFromCatalog(kit('tubing'), { lengthM: 150 }),
        componentFromCatalog(kit('sssv')),
        componentFromCatalog(kit('tubing'), { lengthM: Math.max(tdMdM - 400, 100) }),
        componentFromCatalog(packer),
        componentFromCatalog(kit('nipple-xn')),
        componentFromCatalog(kit('weg')),
      ],
    },
    casing_program: {
      source: 'manual',
      strings: [{
        id: uid('str'),
        name: 'Production casing',
        sections: [{ id: uid('sec'), topMdM: 0, bottomMdM: tdMdM, odIn: 9.625, weightLbFt: 47 }],
      }],
    },
    params: {
      tdMdM,
      warnMarginM: 0.003,
      pbr: { enabled: false, lengthM: 6.1, insertLengthM: 3.0, expectedDLM: 0, marginM: 0.5 },
      erosional: { mixtureKgM3: 700, cFactor: 100 },
      sizing: {
        whpPsi: 250, qoStbd: 3000, wct: 0.2, gor: 500, api: 35, gasSg: 0.75,
        whtF: 90, bhtF: 210, correlation: 'beggsBrill',
      },
    },
    notes: '',
  };
}

// Build the oracle-golden case doc from completion_cases.json — pure so the
// in-memory backend (JSON import) and the Playwright spec (fs read) share
// one construction. Golden components/sections are SI; the doc keeps the
// field-unit identities, so dims are mapped back through the API 5CT
// catalog (exact dims round trip by construction).
export function matchCasingByDims(odM, idM) {
  const row = CASING_CATALOG.find(
    (r) => Math.abs(r.odM - odM) < 1e-7 && Math.abs(r.idM - idM) < 1e-7,
  );
  if (!row) throw new Error(`No API 5CT casing row for OD ${odM} / ID ${idM} m.`);
  return row;
}

export function buildGoldenCaseDoc(golden) {
  return {
    name: 'Golden 3-1/2" Completion',
    string: {
      hangerMdM: golden.stack.hangerMdM,
      components: golden.stack.components.map((c, i) => ({
        id: `cmp-g${i + 1}`,
        type: c.type,
        name: c.name,
        lengthM: c.lengthM,
        odIn: c.odM / IN,
        idIn: c.idM / IN,
        approx: true,
      })),
    },
    casing_program: {
      source: 'manual',
      strings: golden.program.strings.map((s, si) => ({
        id: `str-g${si + 1}`,
        name: s.name,
        sections: s.sections.map((sec, i) => {
          const row = matchCasingByDims(sec.odM, sec.idM);
          return {
            id: `sec-g${si + 1}-${i + 1}`,
            topMdM: sec.topMdM,
            bottomMdM: sec.bottomMdM,
            odIn: row.odIn,
            weightLbFt: row.weightLbFt,
          };
        }),
      })),
    },
    params: {
      tdMdM: golden.tdMdM,
      warnMarginM: golden.warnMarginM,
      pbr: {
        enabled: true,
        lengthM: golden.results.spaceOut[0].pbrLengthM,
        insertLengthM: golden.results.spaceOut[0].insertLengthM,
        expectedDLM: golden.results.spaceOut[0].expectedDLM,
        marginM: golden.results.spaceOut[0].marginM,
      },
      erosional: { mixtureKgM3: 700, cFactor: 100 },
      sizing: {
        whpPsi: 250, qoStbd: 3000, wct: 0.2, gor: 500, api: 35, gasSg: 0.75,
        whtF: 90, bhtF: 210, correlation: 'beggsBrill',
      },
    },
    notes: '',
  };
}

// ---- program resolution ----------------------------------------------------

// Manual/snapshot sections carry (odIn, weightLbFt); resolve to SI through
// the validated API 5CT catalog. Throws with an actionable message.
export function resolveProgram(casingProgram) {
  const strings = (casingProgram?.strings || []).map((s) => ({
    name: s.name || 'casing',
    sections: (s.sections || []).map((sec) => {
      const row = findCatalogRow('casing', sec.odIn, sec.weightLbFt);
      if (!row) {
        throw new Error(`No API 5CT catalog row for ${sec.odIn}" ${sec.weightLbFt}# — pick from the catalog.`);
      }
      return { topMdM: sec.topMdM, bottomMdM: sec.bottomMdM, odM: row.odM, idM: row.idM };
    }),
  }));
  return strings.filter((s) => s.sections.length > 0);
}

// Snapshot a D6 wp_ct_cases casing program into the cd case shape.
export function programFromCtCase(ctCase) {
  const strings = (ctCase?.strings?.casingStrings || []).map((cs) => ({
    id: uid('str'),
    name: cs.name || 'Casing',
    sections: (cs.sections || []).map((sec) => ({
      id: uid('sec'),
      topMdM: sec.topMdM,
      bottomMdM: sec.bottomMdM,
      odIn: sec.odIn,
      weightLbFt: sec.weightLbFt,
    })),
  }));
  return { source: 'ct_case', ct_case_id: ctCase?.id ?? null, ct_case_name: ctCase?.name ?? null, strings };
}

// ---- run -------------------------------------------------------------------

const toSiComponents = (components) => components.map((c) => ({
  ...c, odM: c.odIn * IN, idM: c.idIn * IN,
}));

export function packerMdOf(stack) {
  const packers = stack.components.filter((c) => c.type === 'packer');
  return packers.length ? packers[packers.length - 1].bottomMdM : stack.bottomMdM;
}

// Full evaluation of a case doc. Every result the tabs render comes out of
// here so jest and Playwright can recompute the UI numbers.
export function runAll({ caseDoc }) {
  const params = caseDoc.params || {};
  const stack = buildStack({
    hangerMdM: caseDoc.string?.hangerMdM ?? 0,
    components: toSiComponents(caseDoc.string?.components || []),
  });
  const profile = casingProgramProfile(resolveProgram(caseDoc.casing_program));
  const tdMdM = Math.max(params.tdMdM ?? stack.bottomMdM, stack.bottomMdM);
  const packerMdM = packerMdOf(stack);
  const clearance = runInClearance({
    stack, profile, warnMarginM: params.warnMarginM ?? 0.003,
  });
  const throughBore = throughBoreProfile(stack);
  const volumes = completionVolumes({ stack, profile, packerMdM, tdMdM });
  const pbr = params.pbr || {};
  const spaceOut = pbr.enabled ? sealSpaceOut({
    pbrLengthM: pbr.lengthM,
    insertLengthM: pbr.insertLengthM,
    expectedDLM: pbr.expectedDLM ?? 0,
    marginM: pbr.marginM ?? 0.5,
  }) : null;
  const ero = params.erosional || {};
  const erosional = {
    veMs: erosionalVelocityMs({ mixtureKgM3: ero.mixtureKgM3 ?? 700, cFactor: ero.cFactor ?? 100 }),
    mixtureKgM3: ero.mixtureKgM3 ?? 700,
  };
  return {
    stack, profile, tdMdM, packerMdM, clearance, throughBore, volumes, spaceOut, erosional,
    kpis: kpisOf({ stack, clearance, throughBore, volumes, spaceOut }),
  };
}

function kpisOf({ stack, clearance, throughBore, volumes, spaceOut }) {
  const statuses = [
    clearance.worst?.status,
    spaceOut?.status,
  ].filter(Boolean);
  const banner = statuses.includes('FAIL') ? 'FAIL'
    : statuses.includes('UNKNOWN') ? 'UNKNOWN'
      : statuses.includes('WARN') ? 'WARN' : 'PASS';
  return {
    componentCount: stack.components.length,
    stringBottomMdM: stack.bottomMdM,
    minThroughBoreM: throughBore.minIdM,
    throughBoreControlling: throughBore.controlling,
    worstClearanceM: clearance.worst?.clearanceM ?? null,
    worstClearanceName: clearance.worst?.name ?? null,
    stringCapacityM3: volumes.stringCapacityM3,
    banner,
  };
}

// ---- BOM -------------------------------------------------------------------

// Grouped bill of materials: identical (type, name, odIn, idIn) rows merge
// with summed lengths and counts. Tubing rows report run length; jewelry
// reports quantity.
export function bomFromCase(caseDoc) {
  const groups = new Map();
  for (const c of caseDoc.string?.components || []) {
    const key = `${c.type}|${c.name}|${c.odIn}|${c.idIn}`;
    const g = groups.get(key) || {
      type: c.type, name: c.name, odIn: c.odIn, idIn: c.idIn,
      quantity: 0, totalLengthM: 0, approx: c.approx === true,
    };
    g.quantity += 1;
    g.totalLengthM += c.lengthM;
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function bomCsv(caseDoc) {
  const rows = bomFromCase(caseDoc);
  const head = 'Item,Type,Qty,Total length (m),OD (in),ID (in),Dimensions';
  const body = rows.map((r) => [
    `"${r.name}"`, r.type, r.quantity, r.totalLengthM.toFixed(2),
    r.odIn, r.idIn, r.approx ? 'nominal (verify vendor sheet)' : 'catalog',
  ].join(','));
  return [head, ...body].join('\n');
}

// ---- tubing sizing (Production nodal VLP engine) ---------------------------

// One row per candidate tubing size: flowing BHP required at the node for
// the design rate/WHP, the friction share, and in-situ velocity vs the
// API RP 14E erosional limit at the wellhead. Oilfield units inside (the
// nodal engine's native, oracle-gated units); SI display conversion is the
// caller's concern.
export function tubingSizingTable({ sizing, stations, nodeMdM, candidates }) {
  const s = sizing || {};
  const survey = (stations || []).map((st) => ({
    md: st.md * FT_PER_M, inc: st.inc, azi: st.azi,
  }));
  const trajectory = survey.length >= 2
    ? buildTrajectory({ mode: 'deviated', survey })
    : buildTrajectory({ mode: 'vertical', depthFt: (nodeMdM || 3000) * FT_PER_M });
  const fluidModel = buildFluidModel({ api: s.api, gasSg: s.gasSg, gor: s.gor });
  const tAt = linearGeothermal({
    whtF: s.whtF ?? 90, bhtF: s.bhtF ?? 210, tvdMaxFt: trajectory.tvdMax,
  });
  const nodeMdFt = Math.min((nodeMdM || 3000) * FT_PER_M, trajectory.mdMax);
  const rows = (candidates || TUBING_CATALOG).map((t) => {
    const idIn = t.idM ? t.idM / IN : t.idIn;
    const res = bhpFromWhp({
      fluidModel,
      trajectory,
      tAt,
      idIn,
      correlation: s.correlation || 'beggsBrill',
      whp: s.whpPsi ?? 250,
      nodeMd: nodeMdFt,
      stepFt: 100,
      rates: { qo: s.qoStbd ?? 3000, wct: s.wct ?? 0.2, gor: s.gor ?? 500 },
    });
    const fric = res.points.length > 1
      ? res.points.reduce((acc, p, i) => (i === 0 ? 0
        : acc + p.gradFric * (p.md - res.points[i - 1].md)), 0)
      : 0;
    return {
      designation: t.designation || `${t.odIn}" tubing`,
      odIn: t.odIn ?? (t.odM / IN),
      idIn,
      bhpPsi: res.ok ? res.pEnd : null,
      frictionPsi: res.ok ? fric : null,
      ok: res.ok,
      warnings: res.warnings,
    };
  });
  return { rows, nodeMdFt };
}
