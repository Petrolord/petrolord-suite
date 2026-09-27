// EOQ (Harris-Wilson) and quantity-discount EOQ (SC3).
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import { fillFromItem, fmtNum, fmtPct } from '@/utils/supplychain/materialsAdapters';
import {
  Basis, ItemFill, Note, NumField, Panel, ResultGate, RoundingField, SelectField, Stat,
} from './common';

const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

const EoqInputs = () => {
  const { inputs, items, setSection } = useMaterialsSpares();
  const s = inputs.eoq;
  const set = (patch) => setSection('eoq', patch);
  return (
    <Panel title="EOQ inputs (a year)" testId="eoq-inputs">
      <ItemFill items={items} value={s.itemId} onFill={(it) => set(fillFromItem('eoq', it))} testId="eoq-item" note="Copies the item's annual usage into annual demand and its unit cost." />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Annual demand (units a year)" testId="eoq-demand" value={s.annualDemand} onChange={(v) => set({ annualDemand: v })} />
        <NumField label="Cost of placing one order" testId="eoq-ordercost" value={s.orderCost} onChange={(v) => set({ orderCost: v })} />
      </div>
      <SelectField
        label="Holding cost stated as"
        testId="eoq-holding-mode"
        value={s.holdingMode}
        onChange={(v) => set({ holdingMode: v })}
        options={[
          { value: 'rate', label: 'A rate a year times the unit cost' },
          { value: 'direct', label: 'A cost per unit per year' },
        ]}
      />
      {s.holdingMode === 'rate' ? (
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Holding rate (fraction a year)" testId="eoq-holdingrate" value={s.holdingRate} onChange={(v) => set({ holdingRate: v })} />
          <NumField label="Unit cost" testId="eoq-unitcost" value={s.unitCost} onChange={(v) => set({ unitCost: v })} />
        </div>
      ) : null}
      {s.holdingMode === 'direct' ? (
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Holding cost per unit per year" testId="eoq-holdingcost" value={s.holdingCostPerUnitYear} onChange={(v) => set({ holdingCostPerUnitYear: v })} />
          <NumField label="Unit cost (optional, for the purchase cost line)" testId="eoq-unitcost" value={s.unitCost} onChange={(v) => set({ unitCost: v })} placeholder="optional" />
        </div>
      ) : null}
      <RoundingField label="Rounding rule for the quantity ordered" testId="eoq-rounding" value={s.rounding} onChange={(rounding) => set({ rounding })} />
    </Panel>
  );
};

const EoqResults = () => {
  const { results } = useMaterialsSpares();
  return (
    <ResultGate result={results.eoq} testId="eoq">
      {(r) => {
        const data = [
          { name: 'Ordering', value: r.orderingCost },
          { name: 'Holding', value: r.holdingCost },
          { name: 'Relevant total', value: r.relevantCost },
        ];
        return (
          <Panel title="Economic order quantity" testId="eoq-results">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="EOQ" value={fmtNum(r.eoq, 2)} testId="eoq-eoq" />
              <Stat label="Quantity ordered" value={fmtNum(r.quantity, 2)} testId="eoq-quantity" />
              <Stat label="Orders a year" value={fmtNum(r.ordersPerYear, 2)} testId="eoq-orders" />
              <Stat label="Relevant cost a year" value={fmtNum(r.relevantCost, 2)} testId="eoq-cost" />
              <Stat label="Relevant cost at the EOQ" value={fmtNum(r.relevantCostAtEoq, 2)} testId="eoq-cost-at-eoq" />
              <Stat label="Rounding penalty" value={fmtPct(r.roundingPenaltyPct, 3)} testId="eoq-penalty" />
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-700">
              <ChartFrame height={200} exportFilename="eoq-costs">
                <BarChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="name" tick={tick} />
                  <YAxis tick={tick} tickFormatter={(v) => fmtNum(v, 0)} width={80} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtNum(v, 2)} />
                  <Bar dataKey="value" name="Cost a year at the quantity ordered" isAnimationActive={false}>
                    {data.map((d, i) => <Cell key={d.name} fill={['#2563eb', '#d97706', '#059669'][i]} />)}
                  </Bar>
                </BarChart>
              </ChartFrame>
            </div>
            <Basis reason={r.reason} basis={r.basis} testId="eoq-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const DiscountInputs = () => {
  const { inputs, items, setSection } = useMaterialsSpares();
  const s = inputs.discount;
  const set = (patch) => setSection('discount', patch);
  const setBreak = (i, patch) => set({ breaks: s.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <Panel title="Quantity discount inputs (a year)" testId="discount-inputs">
      <ItemFill items={items} value={s.itemId} onFill={(it) => set(fillFromItem('discount', it))} testId="discount-item" note="Copies the item's annual usage into annual demand." />
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Annual demand" testId="discount-demand" value={s.annualDemand} onChange={(v) => set({ annualDemand: v })} />
        <NumField label="Cost of one order" testId="discount-ordercost" value={s.orderCost} onChange={(v) => set({ orderCost: v })} />
        <NumField label="Holding rate (fraction a year)" testId="discount-holdingrate" value={s.holdingRate} onChange={(v) => set({ holdingRate: v })} />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-300">Price bands (the first from quantity 0, quantities rising, prices falling)</p>
        {s.breaks.map((b, i) => (
          <div key={i} className="mb-1 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <NumField label={i === 0 ? 'From quantity' : ''} testId={`break-q-${i}`} value={b.minQuantity} onChange={(v) => setBreak(i, { minQuantity: v })} />
            <NumField label={i === 0 ? 'Unit price' : ''} testId={`break-p-${i}`} value={b.unitPrice} onChange={(v) => setBreak(i, { unitPrice: v })} />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => set({ breaks: s.breaks.filter((_, j) => j !== i) })} aria-label={`Remove band ${i + 1}`}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="text-sky-300" onClick={() => set({ breaks: [...s.breaks, { minQuantity: '', unitPrice: '' }] })} data-testid="add-break">
          <Plus className="mr-1 h-3 w-3" /> Band
        </Button>
      </div>
      <SelectField
        label="Discount type"
        testId="discount-type"
        value={s.discountType}
        onChange={(v) => set({ discountType: v })}
        options={[
          { value: 'all-units', label: 'All units: the band price applies to the whole lot' },
          { value: 'incremental', label: 'Incremental: each unit is priced by its own band' },
        ]}
      />
      <RoundingField label="Rounding rule for each candidate" testId="discount-rounding" value={s.rounding} onChange={(rounding) => set({ rounding })} />
    </Panel>
  );
};

const DiscountResults = () => {
  const { results } = useMaterialsSpares();
  return (
    <ResultGate result={results.discount} testId="discount">
      {(r) => {
        const data = r.candidates.filter((c) => c.feasible).map((c) => ({ name: `Band ${c.band} (${fmtNum(c.quantity, 0)})`, total: c.totalCost, best: c.quantity === r.quantity && c.costedBand === r.band }));
        return (
          <Panel title="Quantity discount" testId="discount-results">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Order quantity" value={fmtNum(r.quantity, 2)} testId="discount-quantity" />
              <Stat label="Total cost a year" value={fmtNum(r.totalCost, 2)} testId="discount-total" />
              <Stat label="Saving against no discount" value={fmtNum(r.savingsAgainstNoDiscount, 2)} testId="discount-saving" />
            </div>
            {data.length ? (
              <div className="overflow-hidden rounded-lg border border-slate-700">
                <ChartFrame height={200} exportFilename="discount-candidates">
                  <BarChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="name" tick={tick} />
                    <YAxis tick={tick} tickFormatter={(v) => fmtNum(v, 0)} width={90} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtNum(v, 2)} />
                    <Legend {...LEGEND_PROPS} />
                    <Bar dataKey="total" name="Total cost a year (lowest in green)" isAnimationActive={false}>
                      {data.map((d) => <Cell key={d.name} fill={d.best ? '#059669' : '#2563eb'} />)}
                    </Bar>
                  </BarChart>
                </ChartFrame>
              </div>
            ) : null}
            <table className="w-full text-xs">
              <thead className="text-left text-slate-400"><tr><th className="p-1">Band</th><th className="p-1 text-right">Price</th><th className="p-1 text-right">EOQ</th><th className="p-1 text-right">Candidate</th><th className="p-1 text-right">Total cost</th><th className="p-1">Reason</th></tr></thead>
              <tbody>
                {r.candidates.map((c) => (
                  <tr key={c.band} className="border-t border-slate-800 text-slate-200" data-testid={`discount-row-${c.band}`}>
                    <td className="p-1">{c.band}</td>
                    <td className="p-1 text-right font-mono">{fmtNum(c.unitPrice, 2)}</td>
                    <td className="p-1 text-right font-mono">{fmtNum(c.eoq, 2)}</td>
                    <td className="p-1 text-right font-mono">{c.feasible ? fmtNum(c.quantity, 2) : 'none'}</td>
                    <td className="p-1 text-right font-mono">{c.feasible ? fmtNum(c.totalCost, 2) : 'none'}</td>
                    <td className="p-1 text-slate-400">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Basis reason={r.reason} basis={r.basis} testId="discount-basis" />
          </Panel>
        );
      }}
    </ResultGate>
  );
};

const EoqView = () => (
  <div className="space-y-4">
    <Note>
      Holding a unit for a year costs the holding rate times its price. Money is in the register&apos;s currency throughout; every
      cost, rate and rounding rule is yours to state.
    </Note>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <EoqInputs />
      <EoqResults />
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <DiscountInputs />
      <DiscountResults />
    </div>
  </div>
);

export default EoqView;
