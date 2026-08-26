// Hydraulics tab: flow + nozzles config, KPI band, per-element loss table,
// ECD chart with optional PP/FP overlay, run history + exports.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Save, Download, FileText, Trash2 } from 'lucide-react';
import { EcdChart } from '../charts/HydCharts';
import {
  pressureOut, pressureLabel, flowOut, flowIn, flowLabel,
  emwOut, emwLabel, depthOut, depthLabel,
} from '../services/hydRun';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

function Kpi({ label, value, unit, testId, warn }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${warn ? 'border-red-700 bg-red-950/40' : 'border-slate-800 bg-slate-900/60'}`}>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-semibold ${warn ? 'text-red-300' : 'text-slate-100'}`} data-testid={testId}>
        {value}<span className="ml-1 text-[10px] font-normal text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

export default function HydraulicsTab({
  caseDraft, onCaseChange, depthUnit, hyd, mudWindow, onRun, running, error,
  onSaveRun, savingRun, runs, onDeleteRun, onExportCsv, onExportPdf,
}) {
  const flow = caseDraft.flow || {};
  const ft = depthUnit === 'ft';
  const setFlow = (patch) => onCaseChange({ flow: { ...flow, ...patch } });
  const nozzles = flow.nozzlesMm || [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Flow rate ({flowLabel(depthUnit)})
          <Input type="number" step="any" className={`${cell} w-28 text-right`}
            value={+flowOut(flow.flowRateM3s || 0, depthUnit).toFixed(0)}
            onChange={(e) => setFlow({ flowRateM3s: flowIn(num(e.target.value), depthUnit) })}
            data-testid="hyd-flowrate" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Nozzles (mm, comma separated)
          <Input className={`${cell} w-44`} value={nozzles.join(', ')}
            onChange={(e) => setFlow({
              nozzlesMm: e.target.value.split(',').map((s) => num(s)).filter((x) => x > 0),
            })} data-testid="hyd-nozzles" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Surface loss ({pressureLabel(depthUnit)})
          <Input type="number" step="any" className={`${cell} w-24 text-right`}
            value={+pressureOut(flow.surfaceLossPa || 0, depthUnit).toFixed(0)}
            onChange={(e) => setFlow({ surfaceLossPa: num(e.target.value) * (ft ? 6894.757 : 1000) })} />
        </label>
        <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onRun} disabled={running} data-testid="hyd-run">
          <Play className="mr-1 h-3.5 w-3.5" /> {running ? 'Running…' : 'Run hydraulics'}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onSaveRun} disabled={!hyd || savingRun} data-testid="hyd-save-run">
          <Save className="mr-1 h-3.5 w-3.5" /> Save run
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onExportCsv} disabled={!hyd}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onExportPdf} disabled={!hyd}>
          <FileText className="mr-1 h-3.5 w-3.5" /> PDF
        </Button>
        {error && <span className="text-xs text-red-400" data-testid="hyd-error">{error}</span>}
      </div>

      {hyd && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Kpi label="Pump pressure" testId="hyd-pump" unit={pressureLabel(depthUnit)}
            value={pressureOut(hyd.summary.pumpPressurePa, depthUnit).toFixed(0)} />
          <Kpi label="Bit pressure drop" testId="hyd-bitdp" unit={pressureLabel(depthUnit)}
            value={pressureOut(hyd.summary.bitDpPa, depthUnit).toFixed(0)} />
          <Kpi label="Bit power share" unit="%"
            value={hyd.summary.pumpPressurePa > 0 ? ((100 * hyd.summary.bitDpPa) / hyd.summary.pumpPressurePa).toFixed(0) : '--'} />
          <Kpi label="ECD at TD" testId="hyd-ecd" unit={emwLabel(depthUnit)}
            value={emwOut(hyd.summary.ecdAtTdKgM3, depthUnit).toFixed(3)} />
          <Kpi label="Min annular velocity" unit="m/s"
            value={hyd.summary.minAnnularVelocityMs.toFixed(2)} />
        </div>
      )}

      {hyd && hyd.summary.warnings.length > 0 && (
        <div className="rounded-md border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-300">
          {[...new Set(hyd.summary.warnings)].map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      {hyd && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2" style={{ minHeight: 420 }}>
          <EcdChart hyd={hyd} mudWindow={mudWindow} depthUnit={depthUnit}
            staticDensityKgM3={caseDraft.mud?.densityKgM3 || 0} />
          <div className="overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Pressure losses by element</h3>
            <table className="w-full text-xs text-slate-300" data-testid="hyd-loss-table">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500">
                  <th className="p-1 text-left">Path</th>
                  <th className="p-1 text-right">From ({depthLabel(depthUnit)})</th>
                  <th className="p-1 text-right">To ({depthLabel(depthUnit)})</th>
                  <th className="p-1 text-right">v (m/s)</th>
                  <th className="p-1 text-left">Regime</th>
                  <th className="p-1 text-right">dP ({pressureLabel(depthUnit)})</th>
                </tr>
              </thead>
              <tbody>
                {hyd.elements.map((el, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-1">{el.path}</td>
                    <td className="p-1 text-right">{depthOut(el.fromMd, depthUnit).toFixed(0)}</td>
                    <td className="p-1 text-right">{depthOut(el.toMd, depthUnit).toFixed(0)}</td>
                    <td className="p-1 text-right">{el.velocityMs.toFixed(2)}</td>
                    <td className="p-1">{el.regime}</td>
                    <td className="p-1 text-right">{pressureOut(el.dpPa, depthUnit).toFixed(1)}</td>
                  </tr>
                ))}
                {hyd.bit && (
                  <tr className="border-t border-slate-700 font-semibold">
                    <td className="p-1">bit</td>
                    <td className="p-1 text-right" colSpan={3}>jet {hyd.bit.jetVelocityMs.toFixed(1)} m/s</td>
                    <td className="p-1">nozzle</td>
                    <td className="p-1 text-right">{pressureOut(hyd.bit.dpPa, depthUnit).toFixed(1)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Run history</h3>
        {(!runs || runs.length === 0) && <div className="text-xs text-slate-500">No saved runs yet.</div>}
        {(runs || []).map((r) => (
          <div key={r.id} className="flex items-center justify-between border-t border-slate-800 py-1.5 text-xs text-slate-300 first:border-t-0">
            <span>
              {new Date(r.created_at).toLocaleString()} — pump {pressureOut(r.summary?.pumpPressurePa || 0, depthUnit).toFixed(0)} {pressureLabel(depthUnit)},
              ECD {emwOut(r.summary?.ecdAtTdKgM3 || 0, depthUnit).toFixed(3)} {emwLabel(depthUnit)}
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => onDeleteRun(r.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
