// Recording actuals against the plan, and the variance that falls out (DS3).
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useRefineryPlanning } from '@/contexts/RefineryPlanningContext';

const fmt = (v, dp = 0) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) : 'n/a');
const money = (v) => (Number.isFinite(v) ? `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'n/a');

const ActualsPanel = () => {
  const {
    inputs, plannedByMaterial, addActual, removeActual, reconciliation,
  } = useRefineryPlanning();
  const [draft, setDraft] = useState({ materialId: '', type: 'receipt', quantity: '', cost: '', date: '' });

  const submit = () => {
    if (!draft.materialId || !draft.quantity) return;
    addActual({ ...draft });
    setDraft({ materialId: '', type: 'receipt', quantity: '', cost: '', date: '' });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-white mb-1">Record what happened</h3>
        <p className="text-[11px] text-slate-500 mb-3">
          An actual is the same shape as a plan event, which is the whole point: the variance below
          is a subtraction rather than a reconciliation exercise.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="md:col-span-2">
            <Label className="text-[10px] text-slate-400">Material</Label>
            <Select value={draft.materialId} onValueChange={(v) => setDraft((d) => ({ ...d, materialId: v }))}>
              <SelectTrigger className="h-7 bg-slate-950 border-slate-700 text-xs">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                {[...new Set(plannedByMaterial.map((p) => p.materialId))].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-slate-400">Type</Label>
            <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}>
              <SelectTrigger className="h-7 bg-slate-950 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="unit_run">Unit run</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-slate-400">Volume (bbl)</Label>
            <Input type="number" value={draft.quantity}
              onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
              className="h-7 bg-slate-950 border-slate-700 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] text-slate-400">Value ($)</Label>
            <Input type="number" value={draft.cost}
              onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
              className="h-7 bg-slate-950 border-slate-700 text-xs" />
          </div>
          <Button onClick={submit} size="sm" className="h-7 bg-blue-600 hover:bg-blue-700">
            <PlusCircle size={14} className="mr-1" /> Record
          </Button>
        </div>

        {inputs.actuals.length > 0 && (
          <table className="w-full text-sm mt-3">
            <tbody>
              {inputs.actuals.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-1.5 text-white">{a.materialId}</td>
                  <td className="py-1.5 text-slate-400 text-xs">{a.type}</td>
                  <td className="py-1.5 text-right font-mono text-slate-300">{fmt(Number(a.quantity))}</td>
                  <td className="py-1.5 text-right font-mono text-slate-400">{a.cost === '' ? 'not costed' : money(Number(a.cost))}</td>
                  <td className="py-1.5 text-right w-8">
                    <Button variant="ghost" size="icon" onClick={() => removeActual(a.id)}
                      className="h-6 w-6 text-slate-500 hover:text-red-400">
                      <Trash2 size={13} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Plan margin</p>
          <p className="text-lg font-bold text-white mt-1">{money(reconciliation.planMargin)}</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Actual margin</p>
          <p className="text-lg font-bold text-white mt-1">{money(reconciliation.actualMargin)}</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Margin variance</p>
          <p className={`text-lg font-bold mt-1 ${reconciliation.marginVariance >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {money(reconciliation.marginVariance)}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Where the gap came from</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Volume variance is the difference in quantity at the planned unit value; price variance is
          the difference in unit value on the quantity actually moved. They sum to the total exactly,
          which is what makes the split worth reporting: a decomposition with a residual is a
          reconciliation, not an attribution.
        </p>
        {reconciliation.lines.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing to compare yet. Record an actual above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="p-2 text-slate-400 font-medium">Material</th>
                  <th className="p-2 text-slate-400 font-medium">Event</th>
                  <th className="p-2 text-slate-400 font-medium text-right">Plan</th>
                  <th className="p-2 text-slate-400 font-medium text-right">Actual</th>
                  <th className="p-2 text-slate-400 font-medium text-right">Volume var.</th>
                  <th className="p-2 text-slate-400 font-medium text-right">Price var.</th>
                  <th className="p-2 text-slate-400 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.lines.map((l) => (
                  <tr key={`${l.materialId}-${l.type}`} className="border-b border-slate-800/60">
                    <td className="p-2 text-white">{l.materialId}</td>
                    <td className="p-2 text-slate-400 text-xs">{l.type}</td>
                    <td className="p-2 text-right font-mono text-slate-400">{fmt(l.planQuantity)}</td>
                    <td className="p-2 text-right font-mono text-slate-300">{fmt(l.actualQuantity)}</td>
                    <td className="p-2 text-right font-mono text-slate-300">{money(l.volumeVariance)}</td>
                    <td className="p-2 text-right font-mono text-slate-300">{money(l.priceVariance)}</td>
                    <td className={`p-2 text-right font-mono font-semibold ${l.totalVariance >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {money(l.totalVariance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {reconciliation.unmatched.length > 0 && (
          <p className="text-[11px] text-amber-300 mt-2">
            {reconciliation.unmatched.length} movement(s) appear in one ledger and not the other, so
            they are listed as unmatched rather than folded into a price effect. An unplanned cargo
            is not the price of anything.
          </p>
        )}
      </div>

      {reconciliation.unitPerformance.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Units against plan</h3>
          <table className="w-full text-sm">
            <tbody>
              {reconciliation.unitPerformance.map((u) => (
                <tr key={u.unitId} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-1.5 text-slate-300">{u.unitId}</td>
                  <td className="py-1.5 text-right font-mono text-slate-400">{fmt(u.planned)} planned</td>
                  <td className="py-1.5 text-right font-mono text-white">{fmt(u.actual)} actual</td>
                  <td className="py-1.5 text-right font-mono text-slate-400">
                    {u.utilisationOfPlan === null ? '-' : `${(u.utilisationOfPlan * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">
            A unit below plan is usually downtime, but the app does not guess which: it reports the
            gap and leaves the attribution to you.
          </p>
        </div>
      )}
    </div>
  );
};

export default ActualsPanel;
