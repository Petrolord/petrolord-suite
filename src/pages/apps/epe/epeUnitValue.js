// Petroleum Economics Studio as a sender: the `epe-unit-value-1` contract
// (Risked Reserves Valuation U2-001, 2026-10-02).
//
// A saved run publishes what an exploration valuation needs from a
// development case: its NPV per barrel and the provenance behind it. NOTHING
// IS RECOMPUTED HERE. Every number is read from the KPIs the cash-flow
// engine wrote with the run (kpis.npv, kpis.total_boe, kpis.pv_capex,
// kpis.discount_rate_applied_pct, ...), converted from USD and boe to $MM
// and MMboe, and divided once. The run's own numbers are not touched.
//
// The contract (all money in USD of the run's PV basis):
//   schema            'epe-unit-value-1'
//   app, table        'Petroleum Economics Studio', 'epe_runs'
//   runId, runName, runSavedAt        the run that was sent (epe_runs)
//   caseId, caseName                  its case (epe_cases)
//   resultsAt                         when its results were written (epe_results)
//   priceDeckName, prices             the run configuration's name and its
//                                     oil ($/bbl), gas ($/Mscf) and
//                                     condensate ($/bbl) prices
//   discountRatePct, pvBasis, discounting   the rate the NPV was taken at,
//                                     real or nominal, end-year or mid-year
//   fiscalRegime, fiscalFramework, workingInterestPct
//   engineVersion                     the cash-flow engine build that ran it
//   sentBuild                         the Suite build that sent the contract
//   npvMM, totalMMboe                 the run's NPV and its volume (gas at
//                                     6 Mscf per boe, the engine's own boe)
//   npvPerBoe                         npv / total_boe: the full-cycle NPV per barrel
//   pvCapexMM                         the present value of the run's capex, or null
//   split                             true when pvCapexMM is known
//   unitValue, devCost                what a field-size valuation reads:
//                                     value(V) = unitValue x V - devCost.
//                                     With the split: the NPV before capex
//                                     per barrel, and the PV of capex. So at
//                                     the run's own size the line gives the
//                                     run's NPV back. Without it: the
//                                     full-cycle NPV per barrel and zero.
//   fingerprint       changes when anything the run says changes; the
//                     sending build is not part of it
// A run that cannot be valued per barrel is refused with a reason.

export const EPE_UNIT_VALUE_SCHEMA = 'epe-unit-value-1';
export const EPE_APP = 'Petroleum Economics Studio';

const fin = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

const stable = (v) => {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};

/** FNV-1a over what the run says (never over who sent it or when it was received). */
export function epeFingerprint(c) {
  const text = stable({
    runId: c.runId, runName: c.runName, caseName: c.caseName, resultsAt: c.resultsAt, priceDeckName: c.priceDeckName, prices: c.prices,
    discountRatePct: c.discountRatePct, pvBasis: c.pvBasis, discounting: c.discounting, fiscalRegime: c.fiscalRegime, fiscalFramework: c.fiscalFramework,
    workingInterestPct: c.workingInterestPct, engineVersion: c.engineVersion, npvMM: c.npvMM, totalMMboe: c.totalMMboe, pvCapexMM: c.pvCapexMM,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * Build the contract from a run as Petroleum Economics Studio saved it.
 * @param {{run: object, caseName?: ?string, kpis: ?object, config?: ?object, resultsAt?: ?string, build?: ?string}} a
 *   `run` an epe_runs row, `kpis` its epe_results.kpis, `config` its epe_run_configs row
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildEpeUnitValue({ run, caseName = null, kpis, config = null, resultsAt = null, build = null }) {
  if (!kpis || typeof kpis !== 'object') return { ok: false, reason: 'This run has no results.' };
  const npv = fin(kpis.npv);
  const boe = fin(kpis.total_boe);
  if (npv === null) return { ok: false, reason: 'This run has no net present value.' };
  if (!(boe > 0)) return { ok: false, reason: 'This run produced no volume, so it has no value per barrel.' };
  const pvCapex = fin(kpis.pv_capex);
  const split = pvCapex !== null && pvCapex > 0;
  const before = split ? npv + pvCapex : npv;
  if (!(before > 0)) return { ok: false, reason: 'This run does not pay even before its development capex, so it gives no value per barrel to carry to a prospect.' };
  const contract = {
    schema: EPE_UNIT_VALUE_SCHEMA,
    app: EPE_APP,
    table: 'epe_runs',
    runId: run.id,
    runName: run.run_name ?? null,
    runSavedAt: run.created_at ?? null,
    caseId: run.case_id ?? null,
    caseName: caseName ?? run.epe_cases?.case_name ?? null,
    resultsAt: resultsAt ?? null,
    priceDeckName: config?.config_name ?? null,
    prices: config ? { oil: fin(config.oil_price_usd_bbl), gas: fin(config.gas_price_usd_mscf), condensate: fin(config.condensate_price_usd_bbl) } : null,
    discountRatePct: fin(kpis.discount_rate_applied_pct),
    pvBasis: kpis.pv_basis ?? null,
    discounting: kpis.discounting_convention ?? null,
    fiscalRegime: kpis.fiscal_regime ?? null,
    fiscalFramework: kpis.fiscal_framework ?? null,
    workingInterestPct: fin(kpis.working_interest_pct),
    engineVersion: kpis.engine_version ?? null,
    sentBuild: build,
    npvMM: npv / 1e6,
    totalMMboe: boe / 1e6,
    npvPerBoe: npv / boe,
    pvCapexMM: split ? pvCapex / 1e6 : null,
    split,
    unitValue: before / boe,
    devCost: split ? pvCapex / 1e6 : 0,
  };
  contract.fingerprint = epeFingerprint(contract);
  return { ok: true, contract };
}

const plain = (v) => String(parseFloat(Number(v).toPrecision(6)));

/** '"Base deck": oil 75 $/bbl, gas 4.5 $/Mscf, condensate 70 $/bbl' */
export function epePriceDeckLine(c) {
  const p = c?.prices;
  const parts = p ? [['oil', p.oil, '$/bbl'], ['gas', p.gas, '$/Mscf'], ['condensate', p.condensate, '$/bbl']].filter(([, v]) => v !== null && v !== undefined).map(([n, v, u]) => `${n} ${plain(v)} ${u}`) : [];
  if (!c?.priceDeckName && !parts.length) return 'not recorded with the run';
  return `${c.priceDeckName ? `"${c.priceDeckName}"` : 'unnamed'}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

/** '10% real, end-year discounting' */
export function epeDiscountLine(c) {
  if (c?.discountRatePct === null || c?.discountRatePct === undefined) return 'not recorded with the run';
  const how = c.discounting === 'mid_year' ? 'mid-year discounting' : c.discounting === 'end_year' ? 'end-year discounting' : null;
  return `${plain(c.discountRatePct)}%${c.pvBasis ? ` ${c.pvBasis}` : ''}${how ? `, ${how}` : ''}`;
}
