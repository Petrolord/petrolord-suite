// Kick Tolerance tab: MAASP, KT for the current kick intensity, sweep chart.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldAlert } from 'lucide-react';
import { KickToleranceChart } from '../charts/WcCharts';
import {
  pressureOut, pressureLabel, volumeOut, volumeLabel, emwOut, emwLabel,
} from '../services/wcRun';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

export default function KickToleranceTab({
  caseDraft, onCaseChange, depthUnit, kt, onRun, running, error,
}) {
  const kick = caseDraft.kick || {};
  const ft = depthUnit === 'ft';
  const setKick = (patch) => onCaseChange({ kick: { ...kick, ...patch } });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Kick intensity ({ft ? 'ppg' : 'kg/m3'})
          <Input type="number" step="any" className={`${cell} w-28 text-right`}
            value={ft ? +((kick.kickIntensityKgM3 ?? 60) / 119.826).toFixed(2) : (kick.kickIntensityKgM3 ?? 60)}
            onChange={(e) => setKick({ kickIntensityKgM3: ft ? num(e.target.value) * 119.826 : num(e.target.value) })}
            data-testid="wc-ki" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Influx density (kg/m3)
          <Input type="number" step="any" className={`${cell} w-28 text-right`}
            value={kick.influxDensityKgM3 ?? 240}
            onChange={(e) => setKick({ influxDensityKgM3: num(e.target.value) })} />
        </label>
        <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onRun} disabled={running} data-testid="wc-kt-run">
          <ShieldAlert className="mr-1 h-3.5 w-3.5" /> {running ? 'Computing…' : 'Compute kick tolerance'}
        </Button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {kt && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-xs">
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase text-slate-500">MAASP</div>
            <div className="text-sm font-semibold text-slate-100" data-testid="wc-maasp">
              {pressureOut(kt.result.maaspPa, depthUnit).toFixed(0)} {pressureLabel(depthUnit)}
            </div>
          </div>
          <div className={`rounded-md border px-3 py-2 ${volumeOut(kt.result.kickToleranceM3, depthUnit) < (depthUnit === 'ft' ? 25 : 4) ? 'border-amber-700 bg-amber-950/40' : 'border-slate-800 bg-slate-900/60'}`}>
            <div className="text-[9px] uppercase text-slate-500">Kick tolerance</div>
            <div className="text-sm font-semibold text-slate-100" data-testid="wc-kt">
              {volumeOut(kt.result.kickToleranceM3, depthUnit).toFixed(2)} {volumeLabel(depthUnit)}
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase text-slate-500">Shut-in case</div>
            <div className="text-sm font-semibold text-slate-100">
              {volumeOut(kt.result.cases.shutInM3, depthUnit).toFixed(2)} {volumeLabel(depthUnit)}
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase text-slate-500">Circulated to shoe</div>
            <div className="text-sm font-semibold text-slate-100">
              {volumeOut(kt.result.cases.atShoeM3, depthUnit).toFixed(2)} {volumeLabel(depthUnit)}
            </div>
          </div>
        </div>
      )}

      {kt && (
        <div className="min-h-0 flex-1" style={{ minHeight: 400 }}>
          <KickToleranceChart sweep={kt.sweep} currentDensityKgM3={caseDraft.mud?.densityKgM3} depthUnit={depthUnit} />
        </div>
      )}
      {kt && (
        <div className="text-[10px] text-slate-500">{kt.result.assumptions}</div>
      )}
    </div>
  );
}
