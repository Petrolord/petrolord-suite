// Hole Cleaning tab: per-section transport table, cuttings inputs, minimum
// flow rate readout.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Droplets } from 'lucide-react';
import { flowOut, flowLabel, depthOut, depthLabel } from '../services/hydRun';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

export default function HoleCleaningTab({
  caseDraft, onCaseChange, depthUnit, cleaning, minQ, onRun, running, error,
}) {
  const cuttings = caseDraft.cuttings || {};
  const setC = (patch) => onCaseChange({ cuttings: { ...cuttings, ...patch } });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          ROP (m/hr)
          <Input type="number" step="any" className={`${cell} w-24 text-right`}
            value={+((cuttings.ropMs ?? 0.005) * 3600).toFixed(1)}
            onChange={(e) => setC({ ropMs: num(e.target.value) / 3600 })} data-testid="hyd-rop" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Cutting size (mm)
          <Input type="number" step="any" className={`${cell} w-24 text-right`}
            value={+((cuttings.dParticleM ?? 0.006) * 1000).toFixed(1)}
            onChange={(e) => setC({ dParticleM: num(e.target.value) / 1000 })} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Cutting density (kg/m3)
          <Input type="number" step="any" className={`${cell} w-28 text-right`}
            value={cuttings.rhoSolidKgM3 ?? 2600}
            onChange={(e) => setC({ rhoSolidKgM3: num(e.target.value) })} />
        </label>
        <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onRun} disabled={running} data-testid="hyd-clean-run">
          <Droplets className="mr-1 h-3.5 w-3.5" /> {running ? 'Running…' : 'Check hole cleaning'}
        </Button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {cleaning && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 text-xs">
            <div className={`rounded-md border px-3 py-2 ${cleaning.summary.minTransportRatio < 0.5 ? 'border-red-700 bg-red-950/40' : 'border-slate-800 bg-slate-900/60'}`}>
              <div className="text-[9px] uppercase text-slate-500">Min transport ratio</div>
              <div className="text-sm font-semibold text-slate-100" data-testid="hyd-min-tr">
                {cleaning.summary.minTransportRatio.toFixed(3)}
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[9px] uppercase text-slate-500">Max cuttings concentration</div>
              <div className="text-sm font-semibold text-slate-100">
                {cleaning.summary.maxCuttingsConcPct.toFixed(2)} %
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[9px] uppercase text-slate-500">Min flow for TR 0.5</div>
              <div className="text-sm font-semibold text-slate-100" data-testid="hyd-min-q">
                {minQ != null ? `${flowOut(minQ, depthUnit).toFixed(0)} ${flowLabel(depthUnit)}` : 'not reached in range'}
              </div>
            </div>
          </div>

          {cleaning.summary.warnings.length > 0 && (
            <div className="rounded-md border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-300">
              {cleaning.summary.warnings.map((w) => <div key={w}>• {w}</div>)}
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <table className="w-full text-xs text-slate-300" data-testid="hyd-clean-table">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500">
                  <th className="p-1 text-right">From ({depthLabel(depthUnit)})</th>
                  <th className="p-1 text-right">To ({depthLabel(depthUnit)})</th>
                  <th className="p-1 text-right">Inc (deg)</th>
                  <th className="p-1 text-right">Annular v (m/s)</th>
                  <th className="p-1 text-right">Slip v (m/s)</th>
                  <th className="p-1 text-right">Transport ratio</th>
                  <th className="p-1 text-right">Cuttings (%)</th>
                </tr>
              </thead>
              <tbody>
                {cleaning.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-800 ${r.transportRatio < 0.5 ? 'text-red-300' : ''}`}>
                    <td className="p-1 text-right">{depthOut(r.fromMd, depthUnit).toFixed(0)}</td>
                    <td className="p-1 text-right">{depthOut(r.toMd, depthUnit).toFixed(0)}</td>
                    <td className="p-1 text-right">{r.incDeg.toFixed(0)}</td>
                    <td className="p-1 text-right">{r.annularVelocityMs.toFixed(2)}</td>
                    <td className="p-1 text-right">{r.slipMs.toFixed(3)}</td>
                    <td className="p-1 text-right">{r.transportRatio.toFixed(3)}</td>
                    <td className="p-1 text-right">{r.cuttingsConcPct != null ? r.cuttingsConcPct.toFixed(2) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
