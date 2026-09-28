// AFE Cost tab: item editor (per-day / per-meter / lump with tangible /
// intangible categories), contingency line, the rollup, the cumulative
// cost accrual chart and the ADE ch.1 cost-per-depth calculator.

import React from 'react';
import { Input } from '@/components/ui/input';
import {
  NumericTable, NumTh, NumRow, RowLabel, NumCell,
} from '@/components/ui/numeric-table';
import { Trash2, Plus } from 'lucide-react';
import { costPerMeter, COST_BASES, COST_CATEGORIES } from '../services/wctRun';
import { CostTimeChart } from '../charts/WctCharts';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';

const Card = ({ title, children, testId }) => (
  <div className="rounded border border-pl-border bg-pl-surface" data-testid={testId}>
    <div className="border-b border-pl-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-pl-muted">{title}</div>
    <div className="p-2">{children}</div>
  </div>
);

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const usd = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '--');

let seq = 0;
const nid = () => { seq += 1; return `newc-${Date.now()}-${seq}`; };

const CPM_DEFAULT = {
  bitCostUsd: 50000, rigRateUsdPerHr: 6000, drillingHr: 100,
  connectionHr: 4, tripHr: 16, intervalM: 1000,
};

export default function CostTab({ caseDraft, onCaseChange, res }) {
  // W3 (D3): Full precision prints the rollup to the cent, cost per metre at
  // 6 decimals and adds the cumulative cost at each activity end.
  const { full, show } = useFullPrecision();
  const items = caseDraft.costs.items || [];
  const costs = res?.costs || null;
  const acts = caseDraft.program.activities || [];
  const cpmIn = { ...CPM_DEFAULT, ...(caseDraft.params?.cpm || {}) };
  let cpm = null;
  try { cpm = costPerMeter(cpmIn); } catch { cpm = null; }

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="AFE items" testId="wct-items-card">
          <div className="flex flex-col gap-1">
            {items.map((it, i) => (
              // WCT-T1-001: lump rows carry a linked-activity picker too; at
              // 1366 the name box shrank to nothing ("Wellhead" unreadable),
              // so the name keeps a minimum width and the row wraps instead
              <div key={it.id} className="flex flex-wrap items-center gap-1.5" data-testid={`wct-item-${it.id}`}>
                <Input className="h-7 min-w-[120px] flex-1 text-xs" value={it.label || ''}
                  onChange={(e) => onCaseChange((d) => { d.costs.items[i].label = e.target.value; })} />
                <select className="h-7 rounded border border-pl-border-strong bg-pl-surface px-1 text-pl-text text-[10px]" value={it.category}
                  onChange={(e) => onCaseChange((d) => { d.costs.items[i].category = e.target.value; })}>
                  {COST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="h-7 rounded border border-pl-border-strong bg-pl-surface px-1 text-pl-text text-[10px]" value={it.basis}
                  data-testid={`wct-item-${it.id}-basis`}
                  onChange={(e) => onCaseChange((d) => {
                    const row = d.costs.items[i];
                    row.basis = e.target.value;
                    if (row.basis === 'lump') { row.value = row.value ?? 100000; delete row.rate; } else { row.rate = row.rate ?? 1000; delete row.value; delete row.atActivityId; }
                  })}>
                  {COST_BASES.map((b) => <option key={b}>{b}</option>)}
                </select>
                <Input className="h-7 w-24 text-right text-xs" type="number"
                  title={it.basis === 'lump' ? 'USD' : (it.basis === 'per-day' ? 'USD/day' : 'USD/m')}
                  data-testid={`wct-item-${it.id}-amount`}
                  value={it.basis === 'lump' ? (it.value ?? 0) : (it.rate ?? 0)}
                  onChange={(e) => onCaseChange((d) => {
                    const row = d.costs.items[i];
                    if (row.basis === 'lump') row.value = num(e.target.value); else row.rate = num(e.target.value);
                  })} />
                {it.basis === 'lump' && (
                  <select className="h-7 w-28 rounded border border-pl-border-strong bg-pl-surface px-1 text-pl-text text-[10px]"
                    value={it.atActivityId ?? ''} title="accrues at the end of"
                    onChange={(e) => onCaseChange((d) => {
                      const row = d.costs.items[i];
                      if (e.target.value) row.atActivityId = e.target.value; else delete row.atActivityId;
                    })}>
                    <option value="">at spud</option>
                    {acts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                )}
                <span className="w-20 text-right font-pl-mono text-[10px] text-pl-muted" data-testid={`wct-item-${it.id}-total`}>
                  {usd(costs?.byItem?.find((r) => r.id === it.id)?.amountUsd)}
                </span>
                <button type="button" className="text-pl-muted hover:text-pl-danger-text"
                  onClick={() => onCaseChange((d) => { d.costs.items.splice(i, 1); })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" data-testid="wct-add-item"
            className="mt-2 flex items-center gap-1 rounded bg-pl-sunken px-2 py-1 text-xs text-pl-text hover:text-pl-text"
            onClick={() => onCaseChange((d) => {
              d.costs.items.push({ id: nid(), label: 'New item', category: 'intangible', basis: 'lump', value: 100000 });
            })}>
            <Plus className="h-3 w-3" /> Add item
          </button>
          <div className="mt-2 flex items-center gap-2 text-xs text-pl-muted">
            Contingency (fraction of base)
            <Input className="h-7 w-20 text-right text-xs" type="number" step={0.01} min={0}
              value={caseDraft.costs.contingencyFrac ?? 0} data-testid="wct-contingency"
              onChange={(e) => onCaseChange((d) => { d.costs.contingencyFrac = Math.max(0, num(e.target.value)); })} />
          </div>
        </Card>

        <Card title="Cost per metre (bit economics, ADE form)" testId="wct-cpm-card">
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries({
              bitCostUsd: 'bit USD', rigRateUsdPerHr: 'rig USD/h', drillingHr: 'drill h',
              connectionHr: 'conn h', tripHr: 'trip h', intervalM: 'interval m',
            }).map(([f, lab]) => (
              <label key={f} className="text-[10px] text-pl-muted">
                {lab}
                <Input className="h-7 text-right text-xs" type="number" value={cpmIn[f]}
                  data-testid={`wct-cpm-${f}`}
                  onChange={(e) => onCaseChange((d) => {
                    if (!d.params) d.params = {};
                    d.params.cpm = { ...cpmIn, [f]: num(e.target.value) };
                  })} />
              </label>
            ))}
          </div>
          <div className="mt-2 text-xs text-pl-text">
            Interval drilling cost
            <span className="float-right font-pl-mono text-pl-primary-text" data-testid="wct-cpm-result">
              {cpm == null ? '--' : `${show(cpm.toFixed(2), cpm)} USD/m`}
            </span>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {costs && (
          <NumericTable title="AFE rollup" data-testid="wct-rollup-card">
            <thead>
              <tr>
                <NumTh sticky>Line</NumTh>
                <NumTh numeric>Amount</NumTh>
              </tr>
            </thead>
            <tbody>
              {[
                ['Tangible', costs.tangibleUsd, 'wct-tangible'],
                ['Intangible', costs.intangibleUsd, 'wct-intangible'],
                ['Base subtotal', costs.baseUsd, 'wct-base'],
                [`Contingency (${((caseDraft.costs.contingencyFrac ?? 0) * 100).toFixed(0)}%)`, costs.contingencyUsd, 'wct-contingency-usd'],
              ].map(([lab, v, tid]) => (
                <NumRow key={tid}>
                  <RowLabel>{lab}</RowLabel>
                  <NumCell value={v} data-testid={tid}>{show(usd(v), v, 2)} USD</NumCell>
                </NumRow>
              ))}
              <NumRow>
                <RowLabel total>AFE total</RowLabel>
                <NumCell total value={costs.totalUsd} data-testid="wct-total-usd">{show(usd(costs.totalUsd), costs.totalUsd, 2)} USD</NumCell>
              </NumRow>
            </tbody>
          </NumericTable>
        )}
        <div className="h-72 min-h-0">
          <CostTimeChart points={res?.costCurve} />
        </div>
        {full && res?.costCurve?.length > 1 && (
          <div data-testid="wct-curve-table">
            <NumericTable title="Cumulative cost at the end of each activity">
              <thead>
                <tr>
                  <NumTh sticky>Activity</NumTh>
                  <NumTh numeric>Elapsed h</NumTh>
                  <NumTh numeric>Cumulative USD</NumTh>
                </tr>
              </thead>
              <tbody>
                {res.program.rows.map((r, i) => (
                  <NumRow key={r.id} data-testid={`wct-curve-${r.id}`}>
                    <RowLabel>{r.label || r.id}</RowLabel>
                    <NumCell value={res.costCurve[i + 1]?.tHr}>{formatFull(res.costCurve[i + 1]?.tHr, 6)}</NumCell>
                    <NumCell value={res.costCurve[i + 1]?.usd}>{formatFull(res.costCurve[i + 1]?.usd, 2)}</NumCell>
                  </NumRow>
                ))}
              </tbody>
            </NumericTable>
            <p className="mt-1 text-[10px] text-pl-muted">
              Elapsed time is the productive clock stretched by the NPT allowance. The cumulative cost has no contingency line.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
