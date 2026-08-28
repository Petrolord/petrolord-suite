// Monthly allocation factors and the two write-backs (Factors tab).
// Both writes are deliberate: saving factors records the run in
// po_allocation_factors, booking the allocation overwrites the ledger's
// (well, date) rows with allocated volumes stamped source 'allocation'.
import React, { useMemo } from 'react';
import { Save, BookMarked, Sigma } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const fmt = (v, digits = 3) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const FactorsPanel = () => {
  const {
    factors, savedFactors, allocation, canEditField, currentField,
    saveFactors, bookAllocation,
  } = useAllocation();

  const savedByKey = useMemo(
    () => new Map(savedFactors.map((f) => [`${f.well_id}|${String(f.period_month).slice(0, 10)}`, f])),
    [savedFactors],
  );

  if (!currentField) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm">
          Select a field in the left rail.
        </CardContent>
      </Card>
    );
  }

  const dayCount = allocation.days.length;

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sigma className="w-4 h-4 text-emerald-400" /> Monthly factors
            <span className="text-xs font-normal text-slate-500">
              {factors.length} well-month{factors.length === 1 ? '' : 's'} from {dayCount.toLocaleString()} allocated date{dayCount === 1 ? '' : 's'}
            </span>
          </CardTitle>
          {canEditField && factors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={saveFactors}>
                <Save className="w-4 h-4 mr-1" /> Save factors
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  const rows = allocation.days.reduce((n, d) => n + d.entries.length, 0);
                  if (window.confirm(
                    `Write ${rows.toLocaleString()} allocated well-days into the daily ledger?\n\n`
                    + 'This overwrites the production rows for those wells and dates with the '
                    + 'allocated volumes, stamped as allocation. Imported measurements for the '
                    + 'same well-dates are replaced.',
                  )) bookAllocation();
                }}
              >
                <BookMarked className="w-4 h-4 mr-1" /> Book to ledger
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {factors.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing allocated in this period yet. Import metered totals and make sure the wells
              carry a valid test.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[30rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="py-2 pr-3 font-semibold">Month</th>
                    <th className="py-2 pr-3 font-semibold">Well</th>
                    <th className="py-2 pr-3 font-semibold text-right">Oil factor</th>
                    <th className="py-2 pr-3 font-semibold text-right">Water factor</th>
                    <th className="py-2 pr-3 font-semibold text-right">Gas factor</th>
                    <th className="py-2 pr-3 font-semibold text-right">Allocated oil (stb)</th>
                    <th className="py-2 font-semibold">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {factors.map((f) => {
                    const saved = savedByKey.get(`${f.wellId}|${f.periodMonth}`);
                    const changed = saved && Math.abs((saved.oil_factor ?? 1) - f.factors.oil) > 0.0005;
                    return (
                      <tr key={`${f.wellId}-${f.periodMonth}`} className="border-b border-slate-800/60">
                        <td className="py-2 pr-3 text-slate-300">{f.periodMonth.slice(0, 7)}</td>
                        <td className="py-2 pr-3 text-slate-200">{f.wellName}</td>
                        <td className="py-2 pr-3 text-right text-emerald-400">{fmt(f.factors.oil)}</td>
                        <td className="py-2 pr-3 text-right text-sky-400">{fmt(f.factors.water)}</td>
                        <td className="py-2 pr-3 text-right text-amber-400">{fmt(f.factors.gas)}</td>
                        <td className="py-2 pr-3 text-right text-slate-300">
                          {Math.round(f.allocated.oil).toLocaleString()}
                        </td>
                        <td className="py-2 text-xs">
                          {!saved ? <span className="text-slate-600">not saved</span>
                            : changed ? <span className="text-amber-400">differs ({fmt(saved.oil_factor)})</span>
                              : <span className="text-emerald-400">in sync</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            A well's monthly factor is its allocated volume over its theoretical volume for that
            month, so it carries the mix of days the well was actually on. Saving writes one row per
            well per month to the spine, where the next run and every downstream app can read it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default FactorsPanel;
