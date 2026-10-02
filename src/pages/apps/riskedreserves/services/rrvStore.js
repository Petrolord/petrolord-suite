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
  // RCP-U1-004: Pg is a probability. It used to go through the volume
  // conversion above, so a gas prospect's Pg 0.30 arrived as 0.05 (divided
  // by 6 Mscf per boe), a metric one as 1.89 (refused) and a legacy STB row
  // as 0.0000003.
  const prob = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(Number(v).toPrecision(6)) : '');
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
    pg: prob(r.pg) === '' ? (Object.keys(f).length ? fromFactors : '') : prob(r.pg),
    p90: num(sc.p90 ?? r.p90),
    p50: num(sc.p50 ?? r.p50),
    p10: num(sc.p10 ?? r.p10),
    volumeNote: [
      unit && unit !== 'MMbbl' && unit !== 'MMboe' ? `converted from ${unit} at 6 Mscf per boe` : (rawBig ? 'read as STB' : ''),
      // RCP-U1-003: rows saved before the basis was recorded carry the
      // in-place volume (STOIIP / GIIP); the valuation needs recoverable
      row.inputs?.basis === 'recoverable' ? ''
        : row.inputs?.basis === 'in-place' ? 'IN-PLACE volumes: enter recoverable volumes before valuing'
          : 'saved before the basis was recorded: these may be in-place volumes, check before valuing',
    ].filter(Boolean).join('; '),
    basis: row.inputs?.basis || null,
    // BF-U2-017: the charge factor's basin model, when one was handed over
    chargeNote: row.inputs?.bfCharge?.model
      ? `charge from the basin model ${row.inputs.bfCharge.model} (${Number(row.inputs.bfCharge.chargeMMboe).toPrecision(3)} MMboe to the trap; suggested ${row.inputs.bfCharge.suggestedFactor ?? 'none'}, used ${row.inputs.bfCharge.appliedFactor ?? f.charge ?? 'none'})`
      : '',
    ...DEFAULT_ECONOMICS,
    // RCP-U2-012: a prospect valued in ReservoirCalc Pro brings its value
    // per barrel and development cost (the Suite's screening NPV)
    ...(Number.isFinite(Number(row.inputs?.economics?.unitValue)) && Number(row.inputs.economics.unitValue) >= 0 && Number(row.inputs.economics.devCost) >= 0
      ? { unitValue: Number(Number(row.inputs.economics.unitValue).toPrecision(6)), devCost: Number(Number(row.inputs.economics.devCost).toPrecision(6)), economicsNote: 'value per barrel and development cost from ReservoirCalc Pro success-case economics',
        // H8: what ReservoirCalc Pro sent, so a later edit here can be told apart
        rcpUnitValue: Number(Number(row.inputs.economics.unitValue).toPrecision(6)) }
      : {}),
  };
}

/**
 * Where a prospect's value per barrel came from, in words (H8). There are
 * three true answers and the Petroleum Economics Studio is none of them:
 * the starting default, a value sent with the prospect by ReservoirCalc Pro,
 * or a value typed on this screen.
 */
export function unitValueSource(p) {
  const value = Number(p?.unitValue);
  if (Number.isFinite(p?.rcpUnitValue)) {
    return value === p.rcpUnitValue
      ? 'from ReservoirCalc Pro success-case economics (the Suite screening NPV), sent with the prospect'
      : `entered on this screen (ReservoirCalc Pro sent ${p.rcpUnitValue} $/bbl)`;
  }
  // a prospect imported before the sent value was kept
  if (p?.economicsNote) return 'sent by ReservoirCalc Pro success-case economics, and it may have been edited on this screen since';
  if (value === DEFAULT_ECONOMICS.unitValue) return `the starting default of ${DEFAULT_ECONOMICS.unitValue} $/bbl, an assumption to replace`;
  return 'entered on this screen';
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
