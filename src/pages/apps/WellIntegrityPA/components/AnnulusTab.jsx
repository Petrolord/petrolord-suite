// Annulus Pressure tab: per-annulus limiting elements, MAWOP/MAASP
// cards with the governing element, and the allowable-pressure chart.
// Element depths are MD; TVDs come from the definitive trajectory.

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import { MAWOP_ROLES, depthDisp, depthStore, depthLabel } from '../services/wiRun';
import { AnnulusLimitsChart } from '../charts/WiCharts';

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

const MPa = (v) => (v == null ? '--' : (v / 1e6).toFixed(2));
const select = 'h-7 rounded border border-slate-700 bg-slate-800 px-1 text-xs text-slate-200';

export default function AnnulusTab({ caseDraft, onCaseChange, res, depthUnit }) {
  const annuli = caseDraft.annulus.annuli || [];
  const [idx, setIdx] = useState(0);
  const a = annuli[Math.min(idx, annuli.length - 1)] || null;
  const result = res?.annuli?.[Math.min(idx, annuli.length - 1)] || null;
  const unit = depthLabel(depthUnit);

  const setAnn = (mutate) => onCaseChange((d) => { mutate(d.annulus.annuli[Math.min(idx, annuli.length - 1)]); });

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Annulus" testId="wi-annulus-card">
          <div className="flex items-center gap-1">
            {annuli.map((an, i) => (
              <button key={an.name} type="button" data-testid={`wi-annulus-${an.name}`}
                onClick={() => setIdx(i)}
                className={`rounded px-3 py-1 text-xs ${i === idx ? 'bg-lime-500/20 text-lime-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                {an.name}
              </button>
            ))}
            <button type="button" data-testid="wi-add-annulus"
              className="ml-1 flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
              onClick={() => onCaseChange((d) => {
                const names = ['A', 'B', 'C', 'D'];
                const name = names[d.annulus.annuli.length] || `X${d.annulus.annuli.length}`;
                d.annulus.annuli.push({ name, fluidDensityKgM3: 1030, elements: [] });
              })}>
              <Plus className="h-3 w-3" /> Add
            </button>
            {annuli.length > 1 && (
              <button type="button" className="text-slate-500 hover:text-red-400"
                onClick={() => { onCaseChange((d) => { d.annulus.annuli.splice(idx, 1); }); setIdx(0); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {a && (
            <label className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-300">
              <span>Annulus fluid density (kg/m3)</span>
              <Input className="h-7 w-24 text-right text-xs" type="number" step={10}
                value={a.fluidDensityKgM3} data-testid="wi-ann-density"
                onChange={(e) => setAnn((an) => { an.fluidDensityKgM3 = num(e.target.value); })} />
            </label>
          )}
        </Card>

        {a && (
          <Card title={`Limiting elements (depth MD, ${unit}; limits at depth)`} testId="wi-ann-elements-card">
            <div className="flex flex-col gap-1">
              {a.elements.map((e) => (
                <div key={e.id} className="flex items-center gap-1.5">
                  <Input className="h-7 flex-1 text-xs" value={e.name}
                    onChange={(ev) => setAnn((an) => { an.elements.find((x) => x.id === e.id).name = ev.target.value; })} />
                  <select className={select} value={e.role}
                    onChange={(ev) => setAnn((an) => { an.elements.find((x) => x.id === e.id).role = ev.target.value; })}>
                    {MAWOP_ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                  </select>
                  <Input className="h-7 w-20 text-right text-xs" type="number" step={1} title="limit (MPa)"
                    value={e.limitPa / 1e6}
                    onChange={(ev) => setAnn((an) => { an.elements.find((x) => x.id === e.id).limitPa = num(ev.target.value) * 1e6; })} />
                  <Input className="h-7 w-20 text-right text-xs" type="number" step={10} title={`depth MD (${unit})`}
                    value={Math.round(depthDisp(e.mdM, depthUnit))}
                    onChange={(ev) => setAnn((an) => { an.elements.find((x) => x.id === e.id).mdM = depthStore(num(ev.target.value), depthUnit); })} />
                  <Input className="h-7 w-20 text-right text-xs" type="number" step={10} title="backup fluid (kg/m3)"
                    value={e.backupDensityKgM3}
                    onChange={(ev) => setAnn((an) => { an.elements.find((x) => x.id === e.id).backupDensityKgM3 = num(ev.target.value); })} />
                  <button type="button" className="text-slate-500 hover:text-red-400"
                    onClick={() => setAnn((an) => { an.elements = an.elements.filter((x) => x.id !== e.id); })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">name / role / limit MPa / depth MD / backup fluid kg/m3</div>
            <button type="button" data-testid="wi-add-ann-element"
              className="mt-2 flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
              onClick={() => setAnn((an) => {
                an.elements.push({
                  id: `ae-${Date.now()}`, name: 'New limit', role: 'outer-casing-burst',
                  limitPa: 30e6, mdM: 1000, backupDensityKgM3: 1030,
                });
              })}>
              <Plus className="h-3 w-3" /> Add element
            </button>
          </Card>
        )}

        {result?.result && (
          <Card title="MAWOP (API RP 90 convention factors)" testId="wi-mawop-card">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
              <div>MAWOP <span className="float-right font-mono" data-testid="wi-mawop">{MPa(result.result.mawopPa)} MPa</span></div>
              <div>Governing <span className="float-right font-mono" data-testid="wi-governing">{result.result.governing}</span></div>
            </div>
            {result.result.negative && (
              <div className="mt-1 text-xs text-red-400" data-testid="wi-mawop-negative">
                The governing element allows no sustained surface pressure at this fluid gradient.
              </div>
            )}
            <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
              Convention factors: 50% outer casing burst, 80% inner casing burst, 75% inner tubing
              collapse. The RP 90 document governs; wear and corrosion derating are yours to apply
              on the entered limits.
            </div>
          </Card>
        )}
      </div>

      <div className="min-h-[420px]">
        <AnnulusLimitsChart annulus={result} />
      </div>
    </div>
  );
}
