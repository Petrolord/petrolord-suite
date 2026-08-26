// Kill Sheet tab: shut-in inputs, calculated card, method toggle, schedule
// table + chart, PDF export, immutable run history.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Save, FileText, Download, Trash2 } from 'lucide-react';
import { KillScheduleChart } from '../charts/WcCharts';
import {
  pressureOut, pressureIn, pressureLabel, volumeOut, volumeIn, volumeLabel,
  emwOut, emwLabel,
} from '../services/wcRun';
import { exportKillSheetPdf, exportScheduleCsv } from '../services/wcExport';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

function Param({ label, value, onChange, testId }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
      {label}
      <Input type="number" step="any" className={`${cell} w-28 text-right`} value={value}
        onChange={(e) => onChange(num(e.target.value))} data-testid={testId} />
    </label>
  );
}

function Kpi({ label, value, unit, testId, tone }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone === 'warn' ? 'border-amber-700 bg-amber-950/40' : 'border-slate-800 bg-slate-900/60'}`}>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-100" data-testid={testId}>
        {value}<span className="ml-1 text-[10px] font-normal text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

export default function KillSheetTab({
  caseDraft, onCaseChange, depthUnit, ks, kt, volumes, method, onMethodChange,
  onRun, running, error, onSaveRun, savingRun, runs, onDeleteRun, wellboreName,
}) {
  const kick = caseDraft.kick || {};
  const setKick = (patch) => onCaseChange({ kick: { ...kick, ...patch } });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Param label={`SIDPP (${pressureLabel(depthUnit)})`} testId="wc-sidpp"
          value={+pressureOut(kick.sidppPa || 0, depthUnit).toFixed(0)}
          onChange={(v) => setKick({ sidppPa: pressureIn(v, depthUnit) })} />
        <Param label={`SICP (${pressureLabel(depthUnit)})`} testId="wc-sicp"
          value={+pressureOut(kick.sicpPa || 0, depthUnit).toFixed(0)}
          onChange={(v) => setKick({ sicpPa: pressureIn(v, depthUnit) })} />
        <Param label={`Pit gain (${volumeLabel(depthUnit)})`} testId="wc-pitgain"
          value={+volumeOut(kick.pitGainM3 || 0, depthUnit).toFixed(1)}
          onChange={(v) => setKick({ pitGainM3: volumeIn(v, depthUnit) })} />
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Method
          <Select value={method} onValueChange={onMethodChange}>
            <SelectTrigger className={`${cell} w-44`} data-testid="wc-method"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="waitAndWeight">Wait and weight</SelectItem>
              <SelectItem value="drillers">Driller's method</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onRun} disabled={running} data-testid="wc-run">
          <Play className="mr-1 h-3.5 w-3.5" /> {running ? 'Computing…' : 'Compute kill sheet'}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onSaveRun} disabled={!ks || savingRun} data-testid="wc-save-run">
          <Save className="mr-1 h-3.5 w-3.5" /> Save run
        </Button>
        <Button size="sm" variant="outline" className="h-8" disabled={!ks}
          onClick={() => exportScheduleCsv(ks, depthUnit)}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
        <Button size="sm" variant="outline" className="h-8" disabled={!ks || !volumes} data-testid="wc-pdf"
          onClick={() => exportKillSheetPdf({ ks, kt: kt?.result ?? null, caseRow: caseDraft, wellboreName, volumes, depthUnit, method })}>
          <FileText className="mr-1 h-3.5 w-3.5" /> Kill sheet PDF
        </Button>
        {error && <span className="text-xs text-red-400" data-testid="wc-error">{error}</span>}
      </div>

      {ks && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Kpi label="Formation pressure" testId="wc-pf" unit={pressureLabel(depthUnit)}
            value={pressureOut(ks.formationPressurePa, depthUnit).toFixed(0)} />
          <Kpi label="Kill mud weight" testId="wc-kmw" unit={emwLabel(depthUnit)}
            value={emwOut(ks.killMudDensityKgM3, depthUnit).toFixed(3)} />
          <Kpi label="ICP" testId="wc-icp" unit={pressureLabel(depthUnit)}
            value={pressureOut(ks.icpPa, depthUnit).toFixed(0)} />
          <Kpi label="FCP" testId="wc-fcp" unit={pressureLabel(depthUnit)}
            value={pressureOut(ks.fcpPa, depthUnit).toFixed(0)} />
          <Kpi label="Strokes to bit" unit="stk" value={ks.strokesToBit.toFixed(0)} />
          <Kpi label="Influx" testId="wc-influx" unit=""
            value={ks.influx ? `${ks.influx.kind} (${emwOut(ks.influx.densityKgM3, depthUnit).toFixed(2)} ${emwLabel(depthUnit)})` : '--'}
            tone={ks.influx?.kind === 'gas' ? 'warn' : undefined} />
        </div>
      )}

      {ks && ks.warnings.length > 0 && (
        <div className="rounded-md border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-300">
          {ks.warnings.map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      {ks && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2" style={{ minHeight: 400 }}>
          <KillScheduleChart killSheet={ks} method={method} depthUnit={depthUnit} />
          <div className="overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Step-down schedule ({method === 'drillers' ? 'circulation 2' : 'circulation 1'})
            </h3>
            <table className="w-full text-xs text-slate-300" data-testid="wc-schedule-table">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500">
                  <th className="p-1 text-right">Strokes</th>
                  <th className="p-1 text-right">Standpipe ({pressureLabel(depthUnit)})</th>
                </tr>
              </thead>
              <tbody>
                {ks.schedule.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-1 text-right">{r.strokes.toFixed(0)}</td>
                    <td className="p-1 text-right">{pressureOut(r.pressurePa, depthUnit).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-[10px] text-slate-500">{ks.methods[method]?.description}</div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Run history</h3>
        {(!runs || runs.length === 0) && <div className="text-xs text-slate-500">No saved runs yet.</div>}
        {(runs || []).map((r) => (
          <div key={r.id} className="flex items-center justify-between border-t border-slate-800 py-1.5 text-xs text-slate-300 first:border-t-0">
            <span>
              {new Date(r.created_at).toLocaleString()} — KMW {emwOut(r.summary?.killMudDensityKgM3 || 0, depthUnit).toFixed(2)} {emwLabel(depthUnit)},
              ICP {pressureOut(r.summary?.icpPa || 0, depthUnit).toFixed(0)} {pressureLabel(depthUnit)}
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
