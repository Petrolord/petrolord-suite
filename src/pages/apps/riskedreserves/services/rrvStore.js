// Risked Reserves Valuation store (T1 rebuild, 2026-09-26). Prospects come
// from the ReservoirCalc Pro inventory (rcp_prospects: name, Pg from the
// geologist's risking, success-case P90 / P50 / P10) or are typed here.
// The economic inputs (MEFS, value per barrel, development and well cost)
// are this app's own and are remembered per browser; the prospect rows
// themselves stay in ReservoirCalc Pro. Pure mapping plus localStorage.

import { toMMboe } from '@/pages/apps/ReservoirCalcPro/services/prospectVolumes';

export const RRV_KEY = 'rrv.prospects.v1';

export const DEFAULT_ECONOMICS = Object.freeze({ mefs: 10, unitValue: 8, devCost: 100, wellCost: 25 });

/** A ReservoirCalc Pro inventory row as a valuation prospect. */
export function fromRcpProspect(row) {
  const r = row.risked || {};
  const sc = { ...(row.inputs || {}), ...(r.success || r.success_case || r.successCase || {}) };
  // volumes arrive in the unit the row states (MMSTB, Bscf, MMsm3, Bsm3) and
  // are valued as MMboe. Rows saved before units were stated carry either
  // MMSTB or raw STB; anything above 100,000 is read as STB.
  const unit = row.inputs?.unit;
  const rawBig = !unit && [sc.mean, sc.p50, sc.p10].some((v) => Number(v) > 1e5);
  const num = (v) => {
    if (!(Number.isFinite(Number(v)) && v !== null && v !== '')) return '';
    const x = rawBig ? Number(v) / 1e6 : toMMboe(Number(v), unit || 'MMbbl');
    return Number(x.toPrecision(6));
  };
  // Pg as risked in ReservoirCalc Pro; else the product of its factors
  const f = row.pg_factors || {};
  const fromFactors = ['trap', 'reservoir', 'charge', 'seal', 'other']
    .filter((k) => f[k] !== undefined && f[k] !== null)
    .reduce((acc, k) => acc * Math.min(1, Math.max(0, Number(f[k]))), 1);
  return {
    id: `rcp-${row.id}`,
    source: 'rcp',
    rcpId: row.id,
    name: row.name,
    pg: num(r.pg) === '' ? (Object.keys(f).length ? fromFactors : '') : num(r.pg),
    p90: num(sc.p90 ?? r.p90),
    p50: num(sc.p50 ?? r.p50),
    p10: num(sc.p10 ?? r.p10),
    volumeNote: unit && unit !== 'MMbbl' ? `converted from ${unit} at 6 Mscf per boe` : (rawBig ? 'read as STB' : ''),
    ...DEFAULT_ECONOMICS,
  };
}

/** A blank typed prospect. */
export const blankProspect = (n) => ({ id: `own-${Date.now()}-${n}`, source: 'own', name: `Prospect ${n}`, pg: 0.25, p90: 10, p50: 25, p10: 60, ...DEFAULT_ECONOMICS });

/** Why a prospect cannot be valued yet, or null. */
export function inputProblem(p) {
  const n = (v) => Number(v);
  if (!(n(p.pg) >= 0 && n(p.pg) <= 1)) return 'Pg must be between 0 and 1.';
  if (!(n(p.p90) > 0) || !(n(p.p10) > n(p.p90))) return 'Volumes need 0 < P90 < P10 (P90 is the low case).';
  if (p.p50 !== '' && p.p50 != null && !(n(p.p50) >= n(p.p90) && n(p.p50) <= n(p.p10))) return 'P50 must lie between P90 and P10.';
  for (const k of ['mefs', 'unitValue', 'devCost', 'wellCost']) if (!(n(p[k]) >= 0)) return 'MEFS, value per barrel and costs must be zero or more.';
  return null;
}

export function loadProspects() {
  try { const v = JSON.parse(localStorage.getItem(RRV_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveProspects(list) {
  try { localStorage.setItem(RRV_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** The valuation table as CSV. */
export function valuationCsv(rows) {
  const head = ['prospect', 'source', 'pg', 'p90_mmbbl', 'p50_mmbbl', 'p10_mmbbl', 'mefs_mmbbl', 'value_usd_per_bbl', 'dev_cost_musd', 'well_cost_musd',
    'p_commercial_given_success', 'pc', 'success_mean_mmbbl', 'swanson_mean_mmbbl', 'risked_mean_mmbbl', 'emv_musd', 'break_even_pg'];
  const lines = [head.join(',')];
  for (const { p, v } of rows) {
    lines.push([p.name, p.source, p.pg, p.p90, p.p50, p.p10, p.mefs, p.unitValue, p.devCost, p.wellCost,
      v ? v.pCommercialGivenSuccess.toFixed(4) : '', v ? v.pc.toFixed(4) : '', v ? v.successCase.mean.toFixed(3) : '',
      v && v.successCase.swansonMean != null ? v.successCase.swansonMean.toFixed(3) : '', v ? v.riskedMean.toFixed(3) : '',
      v ? v.emv.toFixed(3) : '', v && v.breakEvenPg != null ? v.breakEvenPg.toFixed(4) : ''].map(q).join(','));
  }
  return lines.join('\n');
}
