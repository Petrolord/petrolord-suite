// Recording actuals against the plan, and the variance that falls out (DS3).
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useRefineryPlanning, materialName } from '@/contexts/RefineryPlanningContext';
import {
  NumericTable, NumTh, NumRow, RowLabel, NumCell,
} from '@/components/ui/numeric-table';

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
      <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
        <h3 className="text-sm font-semibold text-pl-text mb-1">Record what happened</h3>
        <p className="text-[11px] text-pl-muted mb-3">
          An actual is the same shape as a plan event, which is the whole point: the variance below
          is a subtraction rather than a reconciliation exercise.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="md:col-span-2">
            <Label className="text-[10px] text-pl-muted">Material</Label>
            <Select value={draft.materialId} onValueChange={(v) => setDraft((d) => ({ ...d, materialId: v }))}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {[...new Set(plannedByMaterial.map((p) => p.materialId))].map((m) => (
                  <SelectItem key={m} value={m}>{materialName(inputs, m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-pl-muted">Type</Label>
            <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="unit_run">Unit run</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-pl-muted">Volume (bbl)</Label>
            <Input type="number" value={draft.quantity}
              onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
              className="h-7 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] text-pl-muted">Value ($)</Label>
            <Input type="number" value={draft.cost}
              onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
              className="h-7 text-xs" />
          </div>
          <Button onClick={submit} size="sm" className="h-7">
            <PlusCircle size={14} className="mr-1" /> Record
          </Button>
        </div>

        {inputs.actuals.length > 0 && (
          <table className="w-full text-sm mt-3">
            <tbody>
              {inputs.actuals.map((a) => (
                <tr key={a.id} className="border-b border-pl-border last:border-0">
                  <td className="py-1.5 text-pl-text">{materialName(inputs, a.materialId)}</td>
                  <td className="py-1.5 text-pl-muted text-xs">{a.type}</td>
                  <td className="py-1.5 text-right font-mono text-pl-text">{fmt(Number(a.quantity))}</td>
                  <td className="py-1.5 text-right font-mono text-pl-muted">{a.cost === '' ? 'not costed' : money(Number(a.cost))}</td>
                  <td className="py-1.5 text-right w-8">
                    <Button variant="ghost" size="icon" onClick={() => removeActual(a.id)}
                      className="h-6 w-6 text-pl-muted hover:text-pl-danger-text">
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
        <div className="rounded border border-pl-border bg-pl-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-pl-muted">Plan margin</p>
          <p className="text-lg font-bold text-pl-text mt-1">{money(reconciliation.planMargin)}</p>
        </div>
        <div className="rounded border border-pl-border bg-pl-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-pl-muted">Actual margin</p>
          {/* Senior test T1: with nothing recorded this read $0 and the
              variance the whole plan margin in red. */}
          <p className="text-lg font-bold text-pl-text mt-1">{inputs.actuals.length ? money(reconciliation.actualMargin) : 'nothing recorded'}</p>
        </div>
        <div className="rounded border border-pl-border bg-pl-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-pl-muted">Margin variance</p>
          {inputs.actuals.length ? (
            <p className={`text-lg font-bold mt-1 ${reconciliation.marginVariance >= 0 ? 'text-pl-success-text' : 'text-pl-danger-text'}`}>
              {money(reconciliation.marginVariance)}
            </p>
          ) : <p className="text-lg font-bold mt-1 text-pl-muted">-</p>}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Where the gap came from</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          Volume variance is the difference in quantity at the planned unit value; price variance is
          the difference in unit value on the quantity actually moved. They sum to the total exactly,
          which is what makes the split worth reporting: a decomposition with a residual only
          reconciles the numbers, and cannot say where the gap came from. A gap is green when it helped the margin and red when
          it hurt it, so spending more on crude shows red and selling more product shows green.
        </p>
        {reconciliation.lines.length === 0 ? (
          <p className="text-sm text-pl-muted">Nothing to compare yet. Record an actual above.</p>
        ) : (
          <NumericTable className="p-0" data-testid="variance-table">
            <thead>
              <tr>
                <NumTh sticky>Material</NumTh>
                <NumTh>Event</NumTh>
                <NumTh numeric>Plan</NumTh>
                <NumTh numeric>Actual</NumTh>
                <NumTh numeric>Volume var.</NumTh>
                <NumTh numeric>Price var.</NumTh>
                <NumTh numeric>Total</NumTh>
              </tr>
            </thead>
            <tbody>
              {reconciliation.lines.map((l) => (
                <NumRow key={`${l.materialId}-${l.type}`}>
                  <RowLabel>{materialName(inputs, l.materialId)}</RowLabel>
                  <td className="border-b border-pl-border px-3 py-2 text-left text-xs text-pl-muted">{l.type}</td>
                  <NumCell signed={false} tone="text-pl-muted">{fmt(l.planQuantity)}</NumCell>
                  <NumCell signed={false}>{fmt(l.actualQuantity)}</NumCell>
                  <NumCell signed={false}>{money(l.volumeVariance)}</NumCell>
                  <NumCell signed={false}>{money(l.priceVariance)}</NumCell>
                  <NumCell
                    signed={false}
                    tone={l.marginEffect >= 0 ? 'text-pl-success-text' : 'text-pl-danger-text'}
                    className="font-semibold"
                  >
                    {money(l.totalVariance)}
                    <span className="block text-[10px] font-pl-sans font-normal text-pl-muted">{l.direction}</span>
                  </NumCell>
                </NumRow>
              ))}
            </tbody>
          </NumericTable>
        )}
        {inputs.actuals.length > 0 && reconciliation.unmatched.length > 0 && (
          <p className="text-[11px] text-pl-warning-text mt-2">
            {reconciliation.unmatched.length} movement(s) appear in one ledger and not the other, so
            they are listed as unmatched rather than folded into a price effect. An unplanned cargo
            is not the price of anything.
          </p>
        )}
      </div>

      {reconciliation.unitPerformance.length > 0 && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <h3 className="text-sm font-semibold text-pl-text mb-2">Units against plan</h3>
          <table className="w-full text-sm">
            <tbody>
              {reconciliation.unitPerformance.map((u) => (
                <tr key={u.unitId} className="border-b border-pl-border last:border-0">
                  <td className="py-1.5 text-pl-text">{u.unitId}</td>
                  <td className="py-1.5 text-right font-mono text-pl-muted">{fmt(u.planned)} planned</td>
                  <td className="py-1.5 text-right font-mono text-pl-text">{fmt(u.actual)} actual</td>
                  <td className="py-1.5 text-right font-mono text-pl-muted">
                    {u.utilisationOfPlan === null ? '-' : `${(u.utilisationOfPlan * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-pl-muted mt-2">
            A unit below plan is usually downtime, but the app does not guess which: it reports the
            gap and leaves the attribution to you.
          </p>
        </div>
      )}
    </div>
  );
};

export default ActualsPanel;
