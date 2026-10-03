// What this run sends to a prospect valuation (Risked Reserves Valuation
// U2-001): its NPV per barrel, the split a field-size valuation reads, and a
// link that opens Risked Reserves Valuation with this run offered to the
// selected prospect. Read-only: every figure is one of the run's own KPIs
// through the `epe-unit-value-1` contract (./epeUnitValue.js).

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buildLabel } from '@/lib/platformBuild';
import { buildEpeUnitValue, epePriceDeckLine, epeDiscountLine } from './epeUnitValue';

export const RRV_ROUTE = '/dashboard/apps/reservoir/risked-reserves-valuation';
const n = (v, d = 2) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * @param {{run: ?object, results: ?object, config?: ?object}} props an epe_runs row (with epe_cases), its epe_results row, its run configuration
 */
export default function EpeUnitValueCard({ run, results, config = null }) {
  const sent = useMemo(() => (run && results
    ? buildEpeUnitValue({ run, caseName: run.epe_cases?.case_name ?? null, kpis: results.kpis, config, resultsAt: results.created_at ?? null, build: buildLabel() })
    : null), [run, results, config]);
  if (!sent) return null;
  const c = sent.contract;
  return (
    <div className="rounded-lg border border-pl-border bg-pl-surface p-4" data-testid="epe-unit-value" data-ok={sent.ok ? 'true' : 'false'}>
      <h3 className="text-sm font-semibold text-pl-text">Value per barrel for a prospect valuation</h3>
      {!sent.ok ? (
        <p className="mt-1 text-xs text-pl-muted" data-testid="epe-unit-value-reason">This run cannot be sent to Risked Reserves Valuation. {sent.reason}</p>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
            <div><dt className="text-pl-muted">NPV per barrel, full cycle</dt><dd className="font-pl-mono tabular-nums text-pl-text" data-testid="epe-unit-value-npv-per-boe">{n(c.npvPerBoe)} USD/boe</dd></div>
            <div><dt className="text-pl-muted">{c.split ? 'NPV before capex, per barrel' : 'Value per barrel sent'}</dt><dd className="font-pl-mono tabular-nums text-pl-text" data-testid="epe-unit-value-u">{n(c.unitValue)} USD/boe</dd></div>
            <div><dt className="text-pl-muted">Present value of capex</dt><dd className="font-pl-mono tabular-nums text-pl-text" data-testid="epe-unit-value-d">{c.split ? `${n(c.pvCapexMM, 1)} USD MM` : 'not recorded with this run'}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-pl-muted">
            NPV {n(c.npvMM, 1)} USD MM over {n(c.totalMMboe, 2)} MMboe at {epeDiscountLine(c)}; price deck {epePriceDeckLine(c)}. A prospect valuation reads value = value per barrel x volume, less the capex, so at this run&apos;s own volume it gives this run&apos;s NPV. The run, its price deck, discount rate, date and engine build travel with the value.
          </p>
          <Link to={`${RRV_ROUTE}?epeRun=${encodeURIComponent(run.id)}`} data-testid="epe-unit-value-send"
            className="mt-2 inline-flex items-center gap-1 rounded border border-pl-border px-2.5 py-1 text-xs text-pl-text hover:bg-pl-sunken">
            Use in Risked Reserves Valuation <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </>
      )}
    </div>
  );
}
