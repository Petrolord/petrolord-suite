// Allocated volumes per well over the period (Allocation tab). The
// table is the deliverable an allocation run produces: what each well
// is credited with, what it was theoretically capable of, and the
// factor between them.
import React from 'react';
import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const AllocationResultsPanel = () => {
  const { allocation, currentField, fieldTotals } = useAllocation();

  if (!currentField) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm">
          Select a field in the left rail to run an allocation.
        </CardContent>
      </Card>
    );
  }

  if (!allocation.days.length) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm px-8">
          {fieldTotals.length === 0
            ? 'No metered totals for this field yet. Allocation starts from the facility meter, which you import on the Data tab.'
            : 'No metered dates fall inside the selected period. Widen the dates in the left rail.'}
        </CardContent>
      </Card>
    );
  }

  const { totals, wells } = allocation;
  const share = (v) => (totals.allocated.oil > 0 ? (v / totals.allocated.oil) * 100 : null);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" /> Allocated volumes
          <span className="text-xs font-normal text-slate-500">
            {allocation.days.length.toLocaleString()} date{allocation.days.length === 1 ? '' : 's'},
            {' '}{allocation.days[0].date} to {allocation.days[allocation.days.length - 1].date}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3 font-semibold">Well</th>
                <th className="py-2 pr-3 font-semibold text-right">Days</th>
                <th className="py-2 pr-3 font-semibold text-right">Theoretical oil (stb)</th>
                <th className="py-2 pr-3 font-semibold text-right">Allocated oil (stb)</th>
                <th className="py-2 pr-3 font-semibold text-right">Share (%)</th>
                <th className="py-2 pr-3 font-semibold text-right">Water (stb)</th>
                <th className="py-2 font-semibold text-right">Gas (Mscf)</th>
              </tr>
            </thead>
            <tbody>
              {wells.map((w) => (
                <tr key={w.wellId} className="border-b border-slate-800/60">
                  <td className="py-2 pr-3 text-slate-200">{w.wellName}</td>
                  <td className="py-2 pr-3 text-right text-slate-400">{w.days}</td>
                  <td className="py-2 pr-3 text-right text-slate-400">{fmt(w.theoretical.oil)}</td>
                  <td className="py-2 pr-3 text-right text-emerald-400">{fmt(w.allocated.oil)}</td>
                  <td className="py-2 pr-3 text-right text-slate-400">
                    {share(w.allocated.oil) == null ? '--' : fmt(share(w.allocated.oil), 1)}
                  </td>
                  <td className="py-2 pr-3 text-right text-sky-400">{fmt(w.allocated.water)}</td>
                  <td className="py-2 text-right text-amber-400">{fmt(w.allocated.gas)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-3 text-slate-200">Allocated total</td>
                <td className="py-2 pr-3 text-right text-slate-300">{totals.days}</td>
                <td className="py-2 pr-3 text-right text-slate-300">{fmt(totals.theoretical.oil)}</td>
                <td className="py-2 pr-3 text-right text-slate-300">{fmt(totals.allocated.oil)}</td>
                <td className="py-2 pr-3 text-right text-slate-500">100.0</td>
                <td className="py-2 pr-3 text-right text-slate-300">{fmt(totals.allocated.water)}</td>
                <td className="py-2 text-right text-slate-300">{fmt(totals.allocated.gas)}</td>
              </tr>
              <tr className="text-slate-500">
                <td className="py-2 pr-3">Metered total</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-right">{fmt(totals.measured.oil)}</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-right">{fmt(totals.measured.water)}</td>
                <td className="py-2 text-right">{fmt(totals.measured.gas)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Allocated equals metered on every date a well could carry the volume. Where the two rows
          differ, some measured volume had no well able to take it; the diagnostics below name the
          dates.
        </p>
      </CardContent>
    </Card>
  );
};

export default AllocationResultsPanel;
