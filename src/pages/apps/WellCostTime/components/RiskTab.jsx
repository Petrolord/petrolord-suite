// Risk tab: the Monte Carlo uncertainty editor (dists sampled by the
// canonical suite module), seeded run controls and the P10/P50/P90,
// histogram, S-curve and tornado results. The probabilistic total is
// the BASE cost: the risk model replaces the contingency provision.

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Play } from 'lucide-react';
import { uncertaintyLabel } from '../services/wctRun';
import { CostHistogramChart, SCurveChart, TornadoChart } from '../charts/WctCharts';

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
const musd = (v) => (Number.isFinite(v) ? (v / 1e6).toFixed(2) : '--');

const ACT_FIELDS = {
  drill: ['ropMPerHr'],
  trip: ['tripSpeedMPerHr'],
  casing: ['runSpeedMPerHr', 'flatHr'],
  flat: ['durationHr'],
};
const DIST_TYPES = ['triangular', 'uniform', 'normal', 'lognormal'];

function fieldsFor(target, row) {
  if (!row) return [];
  if (target === 'activity') return ACT_FIELDS[row.kind] || [];
  return row.basis === 'lump' ? ['value'] : ['rate'];
}

function defaultDist(base) {
  const b = Number.isFinite(base) && base > 0 ? base : 1;
  return { type: 'triangular', min: +(b * 0.7).toPrecision(4), mode: b, max: +(b * 1.4).toPrecision(4) };
}

const DIST_PARAMS = {
  triangular: ['min', 'mode', 'max'],
  uniform: ['min', 'max'],
  normal: ['mean', 'stdDev'],
  lognormal: ['mean', 'stdDev'],
};

export default function RiskTab({ caseDraft, onCaseChange, res, mc, onRunMc, runningMc }) {
  const risk = caseDraft.risk || {};
  const uncertainties = risk.uncertainties || [];
  const acts = caseDraft.program.activities || [];
  const items = caseDraft.costs.items || [];

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Uncertainties (sampled by the canonical Monte Carlo module)" testId="wct-uncertainties-card">
          <div className="flex flex-col gap-1.5">
            {uncertainties.map((u, i) => {
              const list = u.target === 'activity' ? acts : items;
              const row = list.find((r) => r.id === u.id);
              const fields = fieldsFor(u.target, row);
              return (
                <div key={`${u.target}-${u.id}-${u.field}-${i}`} className="rounded border border-slate-800/70 p-1.5" data-testid={`wct-unc-${i}`}>
                  <div className="flex items-center gap-1.5">
                    <select className="h-7 rounded border border-slate-700 bg-slate-900 px-1 text-[10px]" value={u.target}
                      onChange={(e) => onCaseChange((d) => {
                        const nu = d.risk.uncertainties[i];
                        nu.target = e.target.value;
                        const nl = nu.target === 'activity' ? d.program.activities : d.costs.items;
                        nu.id = nl[0]?.id;
                        nu.field = fieldsFor(nu.target, nl[0])[0];
                      })}>
                      <option value="activity">activity</option>
                      <option value="item">cost item</option>
                    </select>
                    <select className="h-7 min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-1 text-[10px]" value={u.id}
                      onChange={(e) => onCaseChange((d) => {
                        const nu = d.risk.uncertainties[i];
                        nu.id = e.target.value;
                        const nl = nu.target === 'activity' ? d.program.activities : d.costs.items;
                        nu.field = fieldsFor(nu.target, nl.find((r) => r.id === nu.id))[0];
                      })}>
                      {list.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <select className="h-7 rounded border border-slate-700 bg-slate-900 px-1 text-[10px]" value={u.field}
                      onChange={(e) => onCaseChange((d) => { d.risk.uncertainties[i].field = e.target.value; })}>
                      {fields.map((f) => <option key={f}>{f}</option>)}
                    </select>
                    <select className="h-7 rounded border border-slate-700 bg-slate-900 px-1 text-[10px]" value={u.dist?.type}
                      onChange={(e) => onCaseChange((d) => {
                        const nu = d.risk.uncertainties[i];
                        const t = e.target.value;
                        const base = row?.[u.field] ?? 1;
                        nu.dist = t === 'normal' || t === 'lognormal'
                          ? { type: t, mean: base, stdDev: +(base * 0.15).toPrecision(4) }
                          : (t === 'uniform'
                            ? { type: t, min: +(base * 0.7).toPrecision(4), max: +(base * 1.4).toPrecision(4) }
                            : defaultDist(base));
                      })}>
                      {DIST_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <button type="button" className="text-slate-500 hover:text-red-400"
                      onClick={() => onCaseChange((d) => { d.risk.uncertainties.splice(i, 1); })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {(DIST_PARAMS[u.dist?.type] || []).map((p) => (
                      <label key={p} className="text-[10px] text-slate-500">
                        {p}
                        <Input className="h-6 w-24 text-right text-xs" type="number" value={u.dist?.[p] ?? 0}
                          data-testid={`wct-unc-${i}-${p}`}
                          onChange={(e) => onCaseChange((d) => { d.risk.uncertainties[i].dist[p] = num(e.target.value); })} />
                      </label>
                    ))}
                    <span className="ml-auto text-[10px] text-slate-500">{row ? row.label : 'missing row'}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" data-testid="wct-add-uncertainty"
            className="mt-2 flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
            onClick={() => onCaseChange((d) => {
              const a = d.program.activities.find((x) => x.kind === 'drill') || d.program.activities[0];
              const field = fieldsFor('activity', a)[0];
              if (!d.risk.uncertainties) d.risk.uncertainties = [];
              d.risk.uncertainties.push({ target: 'activity', id: a.id, field, dist: defaultDist(a?.[field]) });
            })}>
            <Plus className="h-3 w-3" /> Add uncertainty
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <label className="flex items-center gap-1">
              iterations
              <Input className="h-7 w-20 text-right text-xs" type="number" min={100}
                value={risk.iterations ?? 2000} data-testid="wct-iterations"
                onChange={(e) => onCaseChange((d) => { d.risk.iterations = Math.max(100, Math.floor(num(e.target.value))); })} />
            </label>
            <label className="flex items-center gap-1">
              seed
              <Input className="h-7 w-20 text-right text-xs" type="number"
                value={risk.seed ?? ''} data-testid="wct-seed"
                onChange={(e) => onCaseChange((d) => {
                  const v = parseInt(e.target.value, 10);
                  d.risk.seed = Number.isFinite(v) ? v : null;
                })} />
            </label>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={runningMc || !uncertainties.length || !res}
              onClick={onRunMc} data-testid="wct-run-mc">
              <Play className="mr-1 h-3 w-3" /> {runningMc ? 'Running...' : 'Run Monte Carlo'}
            </Button>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            The probabilistic total is the base cost; the risk model replaces the deterministic
            contingency line rather than stacking on top of it.
          </div>
        </Card>

        {mc && (
          <Card title="Probabilistic estimate" testId="wct-mc-card">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {['p10', 'p50', 'p90'].map((p) => (
                <div key={p}>
                  <div className="text-[10px] uppercase text-slate-500">{p} cost</div>
                  <div className="font-mono text-lime-300" data-testid={`wct-mc-cost-${p}`}>{musd(mc.cost[p])} MM</div>
                  <div className="font-mono text-slate-300" data-testid={`wct-mc-days-${p}`}>{mc.days[p].toFixed(1)} d</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-slate-500" data-testid="wct-mc-meta">
              {mc.valid} valid of {mc.iterations} realizations{mc.failed ? ` (${mc.failed} skipped as invalid)` : ''};
              P10 is the low outcome, P90 the high (AFE convention).
            </div>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {mc ? (
          <>
            <div className="h-56 min-h-0"><CostHistogramChart mc={mc} /></div>
            <div className="h-56 min-h-0"><SCurveChart mc={mc} /></div>
            <div className="h-56 min-h-0">
              <TornadoChart mc={mc} labelOf={(k) => uncertaintyLabel(caseDraft, k)} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="wct-mc-empty">
            Add uncertainties and run the Monte Carlo to see the distribution.
          </div>
        )}
      </div>
    </div>
  );
}
