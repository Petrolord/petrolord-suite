// Time Program tab: the ordered activity editor (drill / trip / casing /
// flat closed forms), NPT allowance, geometry prefill, the indicative
// benchmark suggestion card and the time-depth curve.

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, ArrowDown, ArrowUp } from 'lucide-react';
import {
  depthDisp, depthStore, depthLabel,
  REGION_BENCHMARKS, WELL_TYPE_MODIFIERS, benchmarkSuggestion,
  sectionsFromGeometry, programFromSections,
} from '../services/wctRun';
import { TimeDepthChart } from '../charts/WctCharts';

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

const KIND_FIELDS = {
  drill: [
    { field: 'fromMdM', label: 'from MD', depth: true },
    { field: 'toMdM', label: 'to MD', depth: true },
    { field: 'ropMPerHr', label: 'ROP m/h' },
  ],
  trip: [
    { field: 'mdM', label: 'MD', depth: true },
    { field: 'tripSpeedMPerHr', label: 'speed m/h' },
  ],
  casing: [
    { field: 'mdM', label: 'MD', depth: true },
    { field: 'runSpeedMPerHr', label: 'run m/h' },
    { field: 'flatHr', label: 'flat h' },
  ],
  flat: [
    { field: 'durationHr', label: 'hours' },
  ],
};

let seq = 0;
const nid = () => { seq += 1; return `new-${Date.now()}-${seq}`; };

export default function ProgramTab({ caseDraft, onCaseChange, res, depthUnit, geometry }) {
  const acts = caseDraft.program.activities || [];
  const rows = res?.program?.rows || [];
  const unit = depthLabel(depthUnit);
  const [region, setRegion] = useState('Gulf of Mexico');
  const [wellType, setWellType] = useState('Offshore shelf');

  const td = rows.length ? rows[rows.length - 1].endMdM : 0;
  const suggestion = benchmarkSuggestion({ region, wellType, mdM: td || 3000 });
  const geoSections = sectionsFromGeometry(geometry?.hole_sections);

  const move = (i, di) => onCaseChange((d) => {
    const a = d.program.activities;
    const j = i + di;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
  });

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Activity program (in execution order)" testId="wct-activities-card">
          <div className="flex flex-col gap-1">
            {acts.map((a, i) => (
              <div key={a.id} className="flex items-center gap-1.5" data-testid={`wct-act-${a.id}`}>
                <span className="w-12 text-[10px] uppercase text-slate-500">{a.kind}</span>
                <Input className="h-7 flex-1 text-xs" value={a.label || ''}
                  onChange={(e) => onCaseChange((d) => { d.program.activities[i].label = e.target.value; })} />
                {KIND_FIELDS[a.kind].map((f) => (
                  <Input key={f.field} className="h-7 w-[70px] text-right text-xs" type="number"
                    title={f.depth ? `${f.label} (${unit})` : f.label}
                    data-testid={`wct-act-${a.id}-${f.field}`}
                    value={f.depth
                      ? Math.round(depthDisp(a[f.field] ?? 0, depthUnit))
                      : (a[f.field] ?? 0)}
                    onChange={(e) => onCaseChange((d) => {
                      d.program.activities[i][f.field] = f.depth
                        ? depthStore(num(e.target.value), depthUnit)
                        : num(e.target.value);
                    })} />
                ))}
                <span className="w-14 text-right font-mono text-[10px] text-slate-500" data-testid={`wct-act-${a.id}-dur`}>
                  {rows[i] ? `${rows[i].durationHr.toFixed(1)} h` : '--'}
                </span>
                <button type="button" className="text-slate-500 hover:text-slate-200" onClick={() => move(i, -1)}>
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button type="button" className="text-slate-500 hover:text-slate-200" onClick={() => move(i, 1)}>
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button type="button" className="text-slate-500 hover:text-red-400"
                  onClick={() => onCaseChange((d) => { d.program.activities.splice(i, 1); })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.keys(KIND_FIELDS).map((kind) => (
              <button key={kind} type="button" data-testid={`wct-add-${kind}`}
                className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
                onClick={() => onCaseChange((d) => {
                  const a = d.program.activities;
                  const lastMd = res?.program?.totals?.tdMdM ?? 0;
                  if (kind === 'drill') a.push({ id: nid(), kind, label: 'Drill section', fromMdM: lastMd, toMdM: lastMd + 500, ropMPerHr: 15 });
                  if (kind === 'trip') a.push({ id: nid(), kind, label: 'Round trip', mdM: lastMd, tripSpeedMPerHr: 500 });
                  if (kind === 'casing') a.push({ id: nid(), kind, label: 'Run and cement casing', mdM: lastMd, runSpeedMPerHr: 400, flatHr: 18 });
                  if (kind === 'flat') a.push({ id: nid(), kind, label: 'Flat time', durationHr: 24 });
                })}>
                <Plus className="h-3 w-3" /> {kind}
              </button>
            ))}
            {geoSections.length > 0 && (
              <button type="button" data-testid="wct-prefill-geometry"
                className="ml-auto rounded bg-slate-800 px-2 py-1 text-xs text-cyan-300 hover:bg-slate-700"
                onClick={() => onCaseChange((d) => {
                  d.program.activities = programFromSections(geoSections, { moveHr: 24, completionHr: 48 })
                    .map((a) => ({ ...a, id: nid() }));
                })}>
                Prefill from wellbore geometry ({geoSections.length} sections)
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            NPT allowance (fraction of every duration)
            <Input className="h-7 w-20 text-right text-xs" type="number" step={0.01} min={0}
              value={caseDraft.program.nptFrac ?? 0} data-testid="wct-npt"
              onChange={(e) => onCaseChange((d) => { d.program.nptFrac = Math.max(0, num(e.target.value)); })} />
          </div>
        </Card>

        <Card title="Indicative benchmarks (WellCostIQ salvage, planning prefill only)" testId="wct-benchmark-card">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <select className="h-7 rounded border border-slate-700 bg-slate-900 px-1 text-xs" value={region}
              onChange={(e) => setRegion(e.target.value)} data-testid="wct-bm-region">
              {Object.keys(REGION_BENCHMARKS).map((r) => <option key={r}>{r}</option>)}
            </select>
            <select className="h-7 rounded border border-slate-700 bg-slate-900 px-1 text-xs" value={wellType}
              onChange={(e) => setWellType(e.target.value)} data-testid="wct-bm-welltype">
              {Object.keys(WELL_TYPE_MODIFIERS).map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          {suggestion && (
            <div className="mt-2 text-xs text-slate-400" data-testid="wct-bm-suggestion">
              Rig {suggestion.rigRateUsdPerDay.toLocaleString()} USD/d, spread {suggestion.spreadRateUsdPerDay.toLocaleString()} USD/d,
              about {suggestion.dryHoleDays} dry-hole days (best in class {suggestion.bestInClassDays}).
              <button type="button" data-testid="wct-bm-apply"
                className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-cyan-300 hover:bg-slate-700"
                onClick={() => onCaseChange((d) => {
                  const rig = d.costs.items.find((it) => /rig/i.test(it.label) && it.basis === 'per-day');
                  const spread = d.costs.items.find((it) => /spread|service/i.test(it.label) && it.basis === 'per-day');
                  if (rig) rig.rate = suggestion.rigRateUsdPerDay;
                  if (spread) spread.rate = suggestion.spreadRateUsdPerDay;
                })}>
                Apply rates to the AFE
              </button>
            </div>
          )}
          <div className="mt-1 text-[10px] text-slate-500">
            Order-of-magnitude planning figures only; your entered rates and durations drive the estimate.
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div className="h-72 min-h-0">
          <TimeDepthChart curve={res?.program?.curve} depthUnit={unit} />
        </div>
        {res && (
          <Card title="Schedule" testId="wct-schedule-card">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-[10px] uppercase text-slate-500">productive</div>
                <div className="font-mono text-slate-200" data-testid="wct-productive-hr">{res.program.totals.productiveHr.toFixed(0)} h</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">NPT</div>
                <div className="font-mono text-slate-200">{res.program.totals.nptHr.toFixed(0)} h</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">total</div>
                <div className="font-mono text-lime-300" data-testid="wct-total-days">{res.program.totals.totalDays.toFixed(1)} days</div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
