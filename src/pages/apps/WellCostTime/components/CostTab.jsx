// AFE Cost tab: item editor (per-day / per-meter / lump with tangible /
// intangible categories), contingency line, the rollup, the cumulative
// cost accrual chart and the ADE ch.1 cost-per-depth calculator.

import React from 'react';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import { costPerMeter, COST_BASES, COST_CATEGORIES } from '../services/wctRun';
import { CostTimeChart } from '../charts/WctCharts';

const Card = ({ title, children, testId }) => (
  <div className="rounded border border-slate-800 bg-slate-900/40" data-testid={testId}>
    <div className="border-b border-slate-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
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
              <div key={it.id} className="flex items-center gap-1.5" data-testid={`wct-item-${it.id}`}>
                <Input className="h-7 flex-1 text-xs" value={it.label || ''}
                  onChange={(e) => onCaseChange((d) => { d.costs.items[i].label = e.target.value; })} />
                <select className="h-7 rounded border border-slate-700 bg-slate-900 px-1 text-[10px]" value={it.category}
                  onChange={(e) => onCaseChange((d) => { d.costs.items[i].category = e.target.value; })}>
                  {COST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="h-7 rounded border border-slate-700 bg-slate-900 px-1 text-[10px]" value={it.basis}
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
                  <select className="h-7 w-28 rounded border border-slate-700 bg-slate-900 px-1 text-[10px]"
                    value={it.atActivityId ?? ''} title="accrues at the end of"
                    onChange={(e) => onCaseChange((d) => {
                      const row = d.costs.items[i];
                      if (e.target.value) row.atActivityId = e.target.value; else delete row.atActivityId;
                    })}>
                    <option value="">at spud</option>
                    {acts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                )}
                <span className="w-20 text-right font-mono text-[10px] text-slate-400" data-testid={`wct-item-${it.id}-total`}>
                  {usd(costs?.byItem?.find((r) => r.id === it.id)?.amountUsd)}
                </span>
                <button type="button" className="text-slate-500 hover:text-red-400"
                  onClick={() => onCaseChange((d) => { d.costs.items.splice(i, 1); })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" data-testid="wct-add-item"
            className="mt-2 flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
            onClick={() => onCaseChange((d) => {
              d.costs.items.push({ id: nid(), label: 'New item', category: 'intangible', basis: 'lump', value: 100000 });
            })}>
            <Plus className="h-3 w-3" /> Add item
          </button>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
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
              <label key={f} className="text-[10px] text-slate-500">
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
          <div className="mt-2 text-xs text-slate-300">
            Interval drilling cost
            <span className="float-right font-mono text-lime-300" data-testid="wct-cpm-result">
              {cpm == null ? '--' : `${cpm.toFixed(2)} USD/m`}
            </span>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {costs && (
          <Card title="AFE rollup" testId="wct-rollup-card">
            <div className="text-xs text-slate-300">
              {[
                ['Tangible', costs.tangibleUsd, 'wct-tangible'],
                ['Intangible', costs.intangibleUsd, 'wct-intangible'],
                ['Base subtotal', costs.baseUsd, 'wct-base'],
                [`Contingency (${((caseDraft.costs.contingencyFrac ?? 0) * 100).toFixed(0)}%)`, costs.contingencyUsd, 'wct-contingency-usd'],
              ].map(([lab, v, tid]) => (
                <div key={tid} className="flex justify-between border-b border-slate-800/60 py-1">
                  <span>{lab}</span>
                  <span className="font-mono" data-testid={tid}>{usd(v)} USD</span>
                </div>
              ))}
              <div className="flex justify-between py-1 font-semibold text-lime-300">
                <span>AFE total</span>
                <span className="font-mono" data-testid="wct-total-usd">{usd(costs.totalUsd)} USD</span>
              </div>
            </div>
          </Card>
        )}
        <div className="h-72 min-h-0">
          <CostTimeChart points={res?.costCurve} />
        </div>
      </div>
    </div>
  );
}
