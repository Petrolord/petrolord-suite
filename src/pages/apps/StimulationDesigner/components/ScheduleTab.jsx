// Pump Schedule tab: Nolte material balance (pump time, efficiency,
// pad), the stepped proppant ramp, and the proppant pick with propped
// width. Every number is the engine's — recomputed by the e2e spec
// through stRun.

import React from 'react';
import { Input } from '@/components/ui/input';
import { PROPPANT_CATALOG, DARCY_M2 } from '../services/stRun';
import { ScheduleChart } from '../charts/StCharts';

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

const Field = ({ label, value, onChange, step = 1, testId }) => (
  <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
    <span>{label}</span>
    <Input className="h-7 w-28 text-right text-xs" type="number" step={step} value={value}
      data-testid={testId} onChange={(e) => onChange(num(e.target.value))} />
  </label>
);

export default function ScheduleTab({ caseDraft, onCaseChange, res }) {
  const f = caseDraft.frac;
  const bal = res?.balance || null;
  const sch = res?.schedule || null;
  const pack = res?.pack || null;

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Leakoff and proppant loading" testId="st-leakoff-card">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field label="Carter CL (m/sqrt-s)" value={f.clMSqrtS} step={0.00005}
              onChange={(v) => onCaseChange((d) => { d.frac.clMSqrtS = v; })} />
            <Field label="EOJ conc (kg/m3)" value={f.cEojKgM3} step={50}
              onChange={(v) => onCaseChange((d) => { d.frac.cEojKgM3 = v; })} />
            <Field label="Blender steps" value={f.nSteps} step={1}
              onChange={(v) => onCaseChange((d) => { d.frac.nSteps = Math.max(1, Math.round(v)); })} />
            <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span>Proppant</span>
              <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs"
                value={f.proppantName} data-testid="st-proppant"
                onChange={(e) => onCaseChange((d) => { d.frac.proppantName = e.target.value; })}>
                {PROPPANT_CATALOG.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </label>
            <Field label="Retained factor" value={f.damageFactor} step={0.05}
              onChange={(v) => onCaseChange((d) => { d.frac.damageFactor = v; })} />
          </div>
        </Card>

        <Card title="Nolte material balance" testId="st-balance-card">
          {!bal ? <div className="text-xs text-slate-500">Fix the case inputs.</div> : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
              <div>Pump time <span className="float-right font-mono" data-testid="st-ti">{(bal.tiS / 60).toFixed(1)} min</span></div>
              <div>Fluid efficiency <span className="float-right font-mono" data-testid="st-eta">{(bal.etaFrac * 100).toFixed(1)}%</span></div>
              <div>Slurry volume <span className="float-right font-mono">{bal.viM3.toFixed(1)} m3</span></div>
              <div>Leaked volume <span className="float-right font-mono">{bal.vlM3.toFixed(1)} m3</span></div>
            </div>
          )}
        </Card>

        <Card title="Pad + ramp (Nolte)" testId="st-pad-card">
          {sch && (
            <div className="text-xs text-slate-300">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>Pad fraction <span className="float-right font-mono" data-testid="st-pad">{(sch.padFrac * 100).toFixed(1)}%</span></div>
                <div>Pad volume <span className="float-right font-mono">{sch.padM3.toFixed(1)} m3</span></div>
                <div>Ramp exponent <span className="float-right font-mono">{sch.eps.toFixed(3)}</span></div>
                <div>Proppant mass <span className="float-right font-mono" data-testid="st-mass">{(sch.massKg / 1000).toFixed(1)} t</span></div>
              </div>
              <table className="mt-2 w-full text-[11px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="px-1 py-1 text-left">Stage</th>
                    <th className="px-1 py-1 text-right">Start (min)</th>
                    <th className="px-1 py-1 text-right">End (min)</th>
                    <th className="px-1 py-1 text-right">Conc (kg/m3)</th>
                  </tr>
                </thead>
                <tbody data-testid="st-schedule-rows">
                  {sch.steps.map((s, i) => (
                    <tr key={i} className="border-t border-slate-800 text-slate-300">
                      <td className="px-1 py-1">{i + 1}</td>
                      <td className="px-1 py-1 text-right font-mono">{(s.tStartS / 60).toFixed(1)}</td>
                      <td className="px-1 py-1 text-right font-mono">{(s.tEndS / 60).toFixed(1)}</td>
                      <td className="px-1 py-1 text-right font-mono">{s.cKgM3.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Propped fracture" testId="st-pack-card">
          {!pack ? (
            <div className="text-xs text-amber-300">Needs the closure stress (publish the curves or set an override).</div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
              <div>Pack permeability <span className="float-right font-mono" data-testid="st-kf">{(pack.kfM2 / DARCY_M2).toFixed(0)} D</span></div>
              <div>Propped width <span className="float-right font-mono" data-testid="st-wp">{(pack.wpM * 1000).toFixed(2)} mm</span></div>
              <div>Areal conc <span className="float-right font-mono">{pack.arealKgM2.toFixed(2)} kg/m2</span></div>
              <div className="text-[10px] text-slate-500">nominal catalog data at closure; vendor cells govern</div>
            </div>
          )}
        </Card>
      </div>

      <div className="min-h-[420px]">
        <ScheduleChart schedule={sch} cEojKgM3={f.cEojKgM3} />
      </div>
    </div>
  );
}
