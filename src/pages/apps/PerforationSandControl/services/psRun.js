// Perforation & Sand Control pure run service (D8/PS1): assembles engine
// inputs from a saved case doc and returns the full results object.
// NO React, NO supabase, NO '@/' aliases — imported by jest and the
// Playwright e2e spec to recompute UI expectations.
//
// Units: SI in storage (m, Pa). Gun and casing identity keeps the
// familiar field-unit names (odIn, spfPerFt); dimensions resolve to SI
// once, here. Planning assumption, documented in the help guide: the
// perforation tunnel radius is taken as half the API-target entrance
// hole, and tunnel length as the API-target penetration — vendor charge
// data governs a real job (L15).

import {
  karakasTariq, productivityRatio, underbalanceAdvice,
} from '../engine/perforation';
import {
  sieveStats, saucierGravel, screenSelection, sandControlAdvisor,
  cdpAlongInterval,
} from '../engine/sandControl';
import { GUN_CATALOG } from '../engine/perforatingGuns';
import {
  buildStack, casingProgramProfile, governingDriftTo, throughBoreProfile,
} from '../../CompletionDesignStudio/engine/completionDesign';
import {
  resolveProgram, programFromCtCase,
  buildGoldenCaseDoc as buildCdGoldenCaseDoc,
} from '../../CompletionDesignStudio/services/cdRun';
import { depthDisp, depthStore, depthLabel, FT_PER_M } from '../../CasingTubingDesignPro/services/ctRun';

const IN = 0.0254;
export const ENGINE_VERSION = 'drilling-ps8';
export {
  depthDisp, depthStore, depthLabel, FT_PER_M, GUN_CATALOG,
  resolveProgram, programFromCtCase,
};

let seq = 0;
const uid = (p) => {
  seq += 1;
  return `${p}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
};

// ---- case doc --------------------------------------------------------------

export function gunFromCatalog(row, overrides = {}) {
  return {
    id: uid('gun'),
    name: row.name,
    conveyance: row.conveyance,
    odIn: row.odIn,
    spfPerFt: row.spfPerFt,
    phasingDeg: row.phasingDeg,
    entranceHoleIn: row.entranceHoleIn,
    penetrationIn: row.penetrationIn,
    approx: row.approx === true,
    notes: row.notes || '',
    ...overrides,
  };
}

export function defaultCaseDoc({ tdMdM = 3000 } = {}) {
  const gun = GUN_CATALOG.find((g) => g.name.startsWith('4" casing gun')) || GUN_CATALOG[0];
  return {
    name: 'Perforation 1',
    interval: { topMdM: Math.max(tdMdM - 550, 100), bottomMdM: Math.max(tdMdM - 450, 200) },
    sieve: { source: 'manual', points: [] },
    gun: gunFromCatalog(gun),
    params: {
      reservoir: { kMd: 50, khOverKv: 3, reM: 300, rwM: 0.108, fluid: 'oil' },
      crushedZone: { enabled: true, thicknessIn: 0.5, kOverKc: 5 },
      sanding: { geometry: 'perf-tunnel', boostFactor: 1, stepMdM: 10 },
      screen: { mode: 'gravel-pack' },
      warnMarginM: 0.003,
    },
    notes: '',
  };
}

// Build the oracle-golden case doc from perfsand_cases.json plus the D7
// completion golden (casing program + linked completion stack) — pure so
// the in-memory backend (JSON import) and the Playwright spec (fs read)
// share one construction.
export function buildGoldenCaseDoc(golden, completionGolden) {
  const g = golden.guns[0].inputs; // the 2-1/8" through-tubing case
  const catalogGun = GUN_CATALOG.find((r) => r.name.startsWith('2-1/8"'));
  const cd = buildCdGoldenCaseDoc(completionGolden);
  return {
    name: 'Golden Perforation',
    interval: { ...golden.params.interval },
    sieve: { source: 'golden', points: golden.sieve.points.map((p) => ({ ...p })) },
    gun: gunFromCatalog(catalogGun),
    casing_program: cd.casing_program,
    params: {
      reservoir: {
        kMd: golden.params.kMd,
        khOverKv: golden.params.khOverKv,
        reM: golden.params.reM,
        rwM: golden.params.rwM,
        fluid: 'oil',
      },
      crushedZone: {
        enabled: true,
        thicknessIn: (g.rcM - g.rpM) / IN,
        kOverKc: g.kOverKc,
      },
      sanding: {
        geometry: 'perf-tunnel',
        boostFactor: golden.params.boostFactor,
        stepMdM: golden.params.stepMdM,
      },
      screen: { mode: 'gravel-pack' },
      warnMarginM: 0.003,
    },
    notes: '',
  };
}

// ---- pieces ----------------------------------------------------------------

export function perforationResults(caseDoc) {
  const { gun, params } = caseDoc;
  const r = params.reservoir;
  const lpM = gun.penetrationIn * IN;
  const rpM = (gun.entranceHoleIn * IN) / 2;
  const cz = params.crushedZone || {};
  const skin = karakasTariq({
    lpM,
    rpM,
    spfPerM: gun.spfPerFt * FT_PER_M,
    phasingDeg: gun.phasingDeg,
    rwM: r.rwM,
    khOverKv: r.khOverKv,
    rcM: cz.enabled ? rpM + cz.thicknessIn * IN : null,
    kOverKc: cz.enabled ? cz.kOverKc : null,
  });
  const pr = productivityRatio({ reM: r.reM, rwM: r.rwM, sTotal: skin.total });
  const underbalance = underbalanceAdvice({ kMd: r.kMd, fluid: r.fluid });
  return { lpM, rpM, skin, pr, underbalance };
}

// Gun run-in clearance. Through-tubing guns pass the completion
// through-bore (linked D7 case); casing guns run before the completion
// and pass the casing drift down to the interval bottom.
export function gunClearance({ caseDoc, cdCase = null }) {
  const gunOdM = caseDoc.gun.odIn * IN;
  const marginM = caseDoc.params.warnMarginM ?? 0.003;
  if (caseDoc.gun.conveyance === 'through-tubing') {
    if (!cdCase?.string?.components?.length) {
      return { basis: 'completion', missing: true, status: 'WARN', note: 'Link a Completion Design case to check through-tubing access.' };
    }
    const stack = buildStack({
      hangerMdM: cdCase.string.hangerMdM || 0,
      components: cdCase.string.components.map((c) => ({
        ...c, odM: c.odIn * IN, idM: c.idIn * IN,
      })),
    });
    const tb = throughBoreProfile(stack);
    const clearanceM = tb.minIdM - gunOdM;
    return {
      basis: 'completion',
      boreM: tb.minIdM,
      controlling: tb.controlling,
      clearanceM,
      status: clearanceM <= 0 ? 'FAIL' : clearanceM < marginM ? 'WARN' : 'PASS',
    };
  }
  const strings = resolveProgram(caseDoc.casing_program);
  if (!strings.length) {
    return { basis: 'casing', missing: true, status: 'WARN', note: 'Snapshot a casing program to check gun clearance.' };
  }
  const profile = casingProgramProfile(strings);
  const g = governingDriftTo(profile, caseDoc.interval.bottomMdM);
  if (!g) {
    return { basis: 'casing', missing: true, status: 'WARN', note: 'The casing program does not cover the interval bottom.' };
  }
  const clearanceM = g.driftM - gunOdM;
  return {
    basis: 'casing',
    boreM: g.driftM,
    controlling: g.label,
    clearanceM,
    status: clearanceM <= 0 ? 'FAIL' : clearanceM < marginM ? 'WARN' : 'PASS',
  };
}

export function sandResults(caseDoc) {
  const pts = caseDoc.sieve?.points || [];
  if (pts.length < 4) return { stats: null };
  const stats = sieveStats(pts);
  const advisor = sandControlAdvisor(stats);
  const gravel = stats.d50M ? saucierGravel({ d50M: stats.d50M }) : null;
  const gpScreen = gravel && !gravel.noMatch
    ? screenSelection({ mode: 'gravel-pack', gravel: gravel.matches[0] })
    : null;
  const saScreen = stats.d10M ? screenSelection({ mode: 'standalone', stats }) : null;
  return { stats, advisor, gravel, gpScreen, saScreen };
}

export function sandingResults({ caseDoc, stations, curves }) {
  if (!stations?.length || !curves?.tvdM?.length) return null;
  const s = caseDoc.params.sanding || {};
  return cdpAlongInterval({
    stations,
    curves,
    topMdM: caseDoc.interval.topMdM,
    bottomMdM: caseDoc.interval.bottomMdM,
    geometry: s.geometry || 'perf-tunnel',
    boostFactor: s.boostFactor ?? 1,
    stepMdM: s.stepMdM ?? 10,
  });
}

// ---- the full run ----------------------------------------------------------

export function runAll({ caseDoc, stations = null, curves = null, cdCase = null }) {
  const perforation = perforationResults(caseDoc);
  const clearance = gunClearance({ caseDoc, cdCase });
  const sand = sandResults(caseDoc);
  const sanding = sandingResults({ caseDoc, stations, curves });
  const kpis = kpisOf({ perforation, clearance, sand, sanding });
  return { perforation, clearance, sand, sanding, kpis };
}

function kpisOf({ perforation, clearance, sand, sanding }) {
  const statuses = [clearance.status];
  if (sanding && sanding.governing.cdpPa < 0) statuses.push('FAIL');
  const status = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('WARN') ? 'WARN' : 'PASS';
  return {
    totalSkin: perforation.skin.total,
    productivityRatio: perforation.pr.ratio,
    clearanceM: clearance.clearanceM ?? null,
    clearanceStatus: clearance.status,
    gravelMesh: sand?.gravel?.matches?.[0]?.mesh ?? null,
    screenGaugeM: sand?.gpScreen?.gaugeM ?? null,
    minCdpPa: sanding ? sanding.governing.cdpPa : null,
    status,
  };
}

// ---- exports for charts/tables ---------------------------------------------

export function psdChartRows(points) {
  return [...(points || [])]
    .sort((a, b) => b.sizeM - a.sizeM)
    .map((p) => ({ sizeUm: p.sizeM * 1e6, cumRetainedPct: p.cumRetainedPct }));
}

export function cdpChartRows(sanding) {
  if (!sanding) return [];
  return sanding.rows.map((r) => ({
    mdM: r.mdM,
    ppMPa: r.ppPa / 1e6,
    pwfCritMPa: r.pwfCritPa / 1e6,
    cdpMPa: r.cdpPa / 1e6,
  }));
}

// Parse pasted sieve CSV: "size_um, cum_retained_pct" per line (header
// tolerated). Returns { points, errors }.
export function parseSieveCsv(text) {
  const points = [];
  const errors = [];
  const lines = (text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cells = line.split(/[,;\t]/).map((c) => c.trim());
    const um = Number(cells[0]);
    const pct = Number(cells[1]);
    if (!Number.isFinite(um) || !Number.isFinite(pct)) {
      if (i === 0) return; // header
      errors.push(`Line ${i + 1}: "${line}" is not "size_um, cum_retained_pct".`);
      return;
    }
    if (!(um > 0) || pct < 0 || pct > 100) {
      errors.push(`Line ${i + 1}: size must be positive and percent 0-100.`);
      return;
    }
    points.push({ sizeM: um * 1e-6, cumRetainedPct: pct });
  });
  return { points, errors };
}
