// Well Cost & Time as a sender: the `wct-afe-1` contract (EPE video
// programme, 2026-10-14). Petroleum Economics Studio used to take a well's
// capital cost only as a typed CSV, so the AFE in the economics and the AFE
// in the estimate could drift apart without anyone noticing. The pattern is
// `ws-case-1` (src/utils/wellspacing/wsCaseContract.js): read by id by the
// receiver, nothing typed again, a fingerprint for "source changed since".
//
// What is sent is the estimate's LATEST SAVED RUN (wp_wct_runs are
// immutable; a newer saved run of the same case is a new estimate). The
// figure WCT labels "AFE total (deterministic, with contingency)" is the AFE;
// when the run carried a Monte Carlo, its P10/P50/P90 of the base cost (AFE
// convention: P10 low, P90 high; no contingency line, the risk model
// replaces it) travel too, so the receiver can book a risked figure instead
// and say which.
//
// The contract (USD, days):
//   schema, app, table      'wct-afe-1', 'Well Cost & Time', 'wp_wct_runs'
//   caseId, caseName, caseSavedAt, runId, runSavedAt
//   well                    { wellboreId, wellboreName, designId, designName }
//   afe                     { label, totalUsd, baseUsd, contingencyUsd, tangibleUsd, intangibleUsd }
//   risk                    { iterations, valid, p10Usd, p50Usd, p90Usd, meanUsd, convention } | null
//   schedule                { totalDays, drilledM, tdMdM }
//   engineVersion
//   sentBuild               the Suite build that read it (not in the fingerprint)
//   fingerprint             changes when anything the estimate says changes
import { fingerprint } from '@/utils/declineCurve/dcaModel';

export const WCT_AFE_SCHEMA = 'wct-afe-1';
export const WCT_APP = 'Well Cost & Time';
export const WCT_TABLE = 'wp_wct_runs';
export const WCT_AFE_LABEL = 'AFE total (deterministic, with contingency)';
export const WCT_RISK_CONVENTION = 'AFE convention: P10 is the low cost, P90 the high; the base cost without the contingency line';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** FNV-1a over what the estimate says (never over who read it or when). */
export function wctAfeFingerprint(c) {
  return fingerprint({ caseId: c.caseId, well: c.well, afe: c.afe, risk: c.risk, schedule: c.schedule });
}

/**
 * The contract from a saved case row, its run row and the wellbore and
 * design names. A run without an AFE total is refused with the reason.
 * @returns {{ ok: true, contract } | { ok: false, reason }}
 */
export function buildWctAfeContract({ caseRow, runRow, wellbore = null, design = null, build = null }) {
  if (!caseRow) return { ok: false, reason: 'The estimate is no longer there.' };
  if (!runRow) return { ok: false, reason: `The estimate "${caseRow.name || 'Estimate'}" has no saved run. Save a run on its Report tab first.` };
  const afe = runRow.results?.afe || {};
  const total = num(afe.totalUsd);
  if (total === null || total <= 0) return { ok: false, reason: 'The saved run has no AFE total.' };
  const mc = runRow.results?.mc || null;
  const totals = runRow.results?.totals || {};
  const contract = {
    schema: WCT_AFE_SCHEMA,
    app: WCT_APP,
    table: WCT_TABLE,
    caseId: caseRow.id,
    caseName: caseRow.name || 'Estimate',
    caseSavedAt: caseRow.updated_at ?? null,
    runId: runRow.id,
    runSavedAt: runRow.created_at ?? null,
    well: {
      wellboreId: caseRow.wellbore_id ?? null,
      wellboreName: wellbore?.name ?? null,
      designId: runRow.design_id ?? caseRow.design_id ?? null,
      designName: design?.name ?? null,
    },
    afe: {
      label: WCT_AFE_LABEL,
      totalUsd: total,
      baseUsd: num(afe.baseUsd),
      contingencyUsd: num(afe.contingencyUsd),
      tangibleUsd: num(afe.tangibleUsd),
      intangibleUsd: num(afe.intangibleUsd),
    },
    risk: mc && mc.cost ? {
      iterations: num(mc.iterations),
      valid: num(mc.valid),
      p10Usd: num(mc.cost.p10),
      p50Usd: num(mc.cost.p50),
      p90Usd: num(mc.cost.p90),
      meanUsd: num(mc.cost.mean),
      convention: WCT_RISK_CONVENTION,
    } : null,
    schedule: { totalDays: num(totals.totalDays), drilledM: num(totals.drilledM), tdMdM: num(totals.tdMdM) },
    engineVersion: runRow.engine_version ?? null,
    sentBuild: build,
  };
  contract.fingerprint = wctAfeFingerprint(contract);
  return { ok: true, contract };
}

/** The amount a basis books: 'afe' (default), 'p50' or 'p90'. */
export function amountFor(contract, basis = 'afe') {
  if (basis === 'p50') return contract?.risk?.p50Usd ?? null;
  if (basis === 'p90') return contract?.risk?.p90Usd ?? null;
  return contract?.afe?.totalUsd ?? null;
}
export const BASIS_LABEL = Object.freeze({
  afe: 'AFE total (deterministic, with contingency)',
  p50: 'Monte Carlo P50 of the base cost',
  p90: 'Monte Carlo P90 of the base cost (high case)',
});

const usd = (v) => `${Math.round(v).toLocaleString('en-US')} USD`;

/** The received estimate against the source now (null now = gone). */
export function compareWctWithSource(received, now) {
  if (!now) return { state: 'missing', text: 'The source estimate is no longer there (deleted, or no longer shared with you).' };
  if (!now.ok) return { state: 'refused', text: `The source cannot send this estimate now: ${now.reason}` };
  if (now.contract.fingerprint === received.fingerprint) return { state: 'unchanged', text: 'Unchanged since it was received.' };
  const moved = [];
  if (now.contract.afe.totalUsd !== received.afe?.totalUsd) moved.push(`the AFE total, now ${usd(now.contract.afe.totalUsd)}`);
  if (fingerprint(now.contract.risk) !== fingerprint(received.risk ?? null)) moved.push('the risked costs');
  if (fingerprint(now.contract.schedule) !== fingerprint(received.schedule)) moved.push('the schedule');
  if (fingerprint(now.contract.well) !== fingerprint(received.well)) moved.push('the well it is for');
  const run = now.contract.runId !== received.runId ? ' A newer run was saved.' : '';
  return { state: 'changed', text: `The source changed since it was received${moved.length ? ` (${moved.join(', ')})` : ''}.${run}`, now: now.contract };
}
