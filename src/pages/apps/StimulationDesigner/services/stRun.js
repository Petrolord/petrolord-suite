// Stimulation Designer pure run service (D9/ST1): assembles engine
// inputs from a saved case doc and returns the full results object.
// NO React, NO supabase, NO '@/' aliases — imported by jest and the
// Playwright e2e spec to recompute UI expectations.
//
// Units: SI in storage (m, Pa, m3/s, kg). Closure stress = published
// gm-1.0.0 SHMIN and reservoir pressure = pp-1.0.0 PP, both interpolated
// at the treatment mid-point TVD; manual overrides carry an explicit
// source tag. Folds of increase reuse the SAME radial-flow identity as
// the D8 designer (perforation.productivityRatio).

import {
  planeStrainModulus, fracGeometry, pumpTime, pumpSchedule, proppedFrac,
  fracProductivity, FRAC_MODELS, CFD_OPTIMUM,
} from '../engine/fracDesign';
import {
  hawkinsSkin, sandstoneAcid, carbonateAcid, maxMatrixRate,
} from '../engine/acidizing';
import { PROPPANT_CATALOG, packPermeabilityM2 } from '../engine/proppants';
import { productivityRatio } from '../../PerforationSandControl/engine/perforation';
import { tvdAt } from '../../WellControlStudio/engine/wellControl';
import { depthDisp, depthStore, depthLabel, FT_PER_M } from '../../CasingTubingDesignPro/services/ctRun';

const MD_M2 = 9.869233e-16;
const DARCY_M2 = 9.869233e-13;
export const ENGINE_VERSION = 'drilling-st9';
export {
  depthDisp, depthStore, depthLabel, FT_PER_M,
  PROPPANT_CATALOG, FRAC_MODELS, CFD_OPTIMUM, DARCY_M2,
};

// ---- case doc --------------------------------------------------------------

export function defaultCaseDoc({ tdMdM = 3000 } = {}) {
  return {
    name: 'Stimulation 1',
    interval: { topMdM: Math.max(tdMdM - 550, 100), bottomMdM: Math.max(tdMdM - 450, 200) },
    frac: {
      model: 'pkn',
      xfM: 150,
      hfM: 30,
      ePa: 2.5e10,
      nu: 0.25,
      muPaS: 0.2,
      qiM3s: 0.053,
      clMSqrtS: 1e-4,
      cEojKgM3: 800,
      nSteps: 8,
      proppantName: PROPPANT_CATALOG[0].name,
      damageFactor: 0.5,
    },
    acid: {
      mode: 'sandstone',
      kOverKs: 5,
      rsM: 0.9,
      raM: 0.6,
      porosity: 0.18,
      pvFactor: 1.5,
      volumeM3: 8,
      pvBt: 1,
    },
    params: {
      reservoir: { kMd: 1, reM: 300, rwM: 0.108 },
      closureOverridePa: null,
      pResOverridePa: null,
    },
    notes: '',
  };
}

// Build the oracle-golden case doc from stim_cases.json — pure so the
// in-memory backend (JSON import) and the Playwright spec (fs read)
// share one construction.
export function buildGoldenCaseDoc(golden) {
  const p = golden.params;
  return {
    name: 'Golden Stimulation',
    interval: { ...p.interval },
    frac: {
      model: 'pkn',
      xfM: p.xfM,
      hfM: p.hfM,
      ePa: p.ePa,
      nu: p.nu,
      muPaS: p.muPaS,
      qiM3s: p.qiM3s,
      clMSqrtS: p.clMSqrtS,
      cEojKgM3: p.cEojKgM3,
      nSteps: p.nSteps,
      proppantName: p.proppant.name,
      damageFactor: p.damageFactor,
    },
    acid: {
      mode: 'sandstone',
      kOverKs: p.acid.kOverKs,
      rsM: p.acid.rsM,
      raM: p.acid.raM,
      porosity: p.acid.porosity,
      pvFactor: p.pvFactor,
      volumeM3: p.acid.volumeM3,
      pvBt: p.pvBt,
    },
    params: {
      reservoir: { kMd: p.kMd, reM: p.reM, rwM: p.rwM },
      closureOverridePa: null,
      pResOverridePa: null,
    },
    notes: '',
  };
}

// ---- rock context ----------------------------------------------------------

const interpAtTvd = (grid, arr, tvd) => {
  if (tvd <= grid[0]) return arr[0];
  const last = grid.length - 1;
  if (tvd >= grid[last]) return arr[last];
  let i = 1;
  while (grid[i] < tvd) i += 1;
  const f = (tvd - grid[i - 1]) / (grid[i] - grid[i - 1]);
  return arr[i - 1] + f * (arr[i] - arr[i - 1]);
};

/** Closure (SHMIN) + reservoir pressure (PP) at the treatment mid-point. */
export function rockContext({ caseDoc, stations, curves }) {
  const midMdM = 0.5 * (caseDoc.interval.topMdM + caseDoc.interval.bottomMdM);
  const overrideClosure = caseDoc.params.closureOverridePa;
  const overridePRes = caseDoc.params.pResOverridePa;
  if (overrideClosure != null && overridePRes != null) {
    return {
      midMdM, midTvdM: null, closurePa: overrideClosure, pResPa: overridePRes, source: 'manual',
    };
  }
  if (!stations?.length || !curves?.tvdM?.length) {
    return { midMdM, midTvdM: null, closurePa: overrideClosure, pResPa: overridePRes, source: 'missing' };
  }
  const midTvdM = tvdAt(stations, midMdM);
  return {
    midMdM,
    midTvdM,
    closurePa: overrideClosure ?? interpAtTvd(curves.tvdM, curves.shminPa, midTvdM),
    pResPa: overridePRes ?? interpAtTvd(curves.tvdM, curves.ppPa, midTvdM),
    source: 'published',
  };
}

// ---- the full run ----------------------------------------------------------

export function runAll({ caseDoc, stations = null, curves = null }) {
  const rock = rockContext({ caseDoc, stations, curves });
  const f = caseDoc.frac;
  const r = caseDoc.params.reservoir;
  const warnings = [];

  const ePrimePa = planeStrainModulus({ ePa: f.ePa, nu: f.nu });
  const geometry = fracGeometry({
    model: f.model, qiM3s: f.qiM3s, muPaS: f.muPaS, xfM: f.xfM, hfM: f.hfM,
    ePrimePa, closurePa: rock.closurePa,
  });
  // The schedule is designed on the PKN average width when PKN is the
  // model; KGD uses its own average (documented: the balance rides the
  // selected model's width).
  const balance = pumpTime({
    qiM3s: f.qiM3s, hfM: f.hfM, xfM: f.xfM, wAvgM: geometry.wAvgM, clMSqrtS: f.clMSqrtS,
  });
  const schedule = pumpSchedule({
    tiS: balance.tiS, etaFrac: balance.etaFrac, qiM3s: f.qiM3s,
    cEojKgM3: f.cEojKgM3, nSteps: f.nSteps,
  });

  const proppantRow = PROPPANT_CATALOG.find((row) => row.name === f.proppantName);
  if (!proppantRow) throw new Error(`Unknown proppant "${f.proppantName}" — pick from the catalog.`);
  let pack = null;
  let productivity = null;
  if (rock.closurePa != null) {
    const perm = packPermeabilityM2(proppantRow, rock.closurePa);
    if (perm.clamped) warnings.push('Closure stress outside the proppant conductivity table; clamped at the table edge.');
    const prop = proppedFrac({
      massKg: schedule.massKg, xfM: f.xfM, hfM: f.hfM,
      rhoKgM3: proppantRow.rhoKgM3, packPorosity: proppantRow.packPorosity,
      kfM2: perm.kM2, damageFactor: f.damageFactor,
    });
    pack = { ...prop, kfM2: perm.kM2, clamped: perm.clamped, proppant: proppantRow };
    const prod = fracProductivity({
      kfwM3: prop.kfwM3, kM2: r.kMd * MD_M2, xfM: f.xfM, rwM: r.rwM,
    });
    warnings.push(...prod.warnings);
    const pr = productivityRatio({ reM: r.reM, rwM: r.rwM, sTotal: prod.sF });
    productivity = { ...prod, pr };
  }

  const a = caseDoc.acid;
  const hAcidM = caseDoc.interval.bottomMdM - caseDoc.interval.topMdM;
  const sandstone = sandstoneAcid({
    rwM: r.rwM, raM: a.raM, hM: hAcidM, porosity: a.porosity,
    pvFactor: a.pvFactor, kOverKs: a.kOverKs, rsM: a.rsM,
  });
  const carbonate = carbonateAcid({
    rwM: r.rwM, hM: hAcidM, porosity: a.porosity, volumeM3: a.volumeM3, pvBt: a.pvBt,
  });
  const matrixRate = rock.closurePa != null && rock.pResPa != null && rock.closurePa > rock.pResPa
    ? maxMatrixRate({
      kM2: r.kMd * MD_M2, hM: hAcidM, pFracPa: rock.closurePa, pResPa: rock.pResPa,
      muPaS: 1e-3, reM: r.reM, rwM: r.rwM, sSkin: sandstone.sBefore,
    })
    : null;
  const acid = { sandstone, carbonate, matrixRate, hAcidM };

  const kpis = kpisOf({ rock, geometry, balance, schedule, pack, productivity, warnings });
  return { rock, ePrimePa, geometry, balance, schedule, pack, productivity, acid, warnings, kpis };
}

function kpisOf({ rock, geometry, balance, schedule, pack, productivity, warnings }) {
  const status = rock.source === 'missing' || warnings.length > 0 ? 'WARN' : 'PASS';
  return {
    closurePa: rock.closurePa,
    wMaxM: geometry.wMaxM,
    pNetPa: geometry.pNetPa,
    etaFrac: balance.etaFrac,
    massKg: schedule.massKg,
    cfd: productivity?.cfd ?? null,
    sF: productivity?.sF ?? null,
    foi: productivity?.pr?.ratio ?? null,
    wpM: pack?.wpM ?? null,
    status,
  };
}

// ---- chart helpers ---------------------------------------------------------

// PKN/KGD width profile along the wing for the chart: elliptical (KGD
// constant-height slit) shape functions on the tip-to-well coordinate.
export function widthProfileRows({ geometry, xfM, n = 40 }) {
  const rows = [];
  for (let i = 0; i <= n; i += 1) {
    const x = (i / n) * xfM;
    const xi = x / xfM;
    const shape = geometry.model === 'pkn' ? (1 - xi) ** 0.25 : Math.sqrt(1 - xi * xi);
    rows.push({ xM: x, wMm: geometry.wMaxM * shape * 1000 });
  }
  return rows;
}

export function scheduleChartRows(schedule) {
  const rows = [{ tMin: 0, cKgM3: 0 }, { tMin: schedule.tPadS / 60, cKgM3: 0 }];
  for (const s of schedule.steps) {
    rows.push({ tMin: s.tStartS / 60, cKgM3: s.cKgM3 });
    rows.push({ tMin: s.tEndS / 60, cKgM3: s.cKgM3 });
  }
  return rows;
}
