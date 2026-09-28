// Kill Sheet tab: shut-in inputs, calculated card, method toggle, schedule
// table + chart, PDF export, immutable run history.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Save, FileText, Download, Trash2, AlertTriangle } from 'lucide-react';
import { KillScheduleChart } from '../charts/WcCharts';
import {
  pressureOut, pressureIn, pressureLabel, volumeOut, volumeIn, volumeLabel,
  emwOut, emwLabel, depthOut, depthLabel,
} from '../services/wcRun';
import { exportKillSheetPdf, exportScheduleCsv } from '../services/wcExport';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 text-xs';

function Param({ label, value, onChange, testId }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-pl-muted">
      {label}
      <Input type="number" step="any" className={`${cell} w-28 text-right`} value={value}
        onChange={(e) => onChange(num(e.target.value))} data-testid={testId} />
    </label>
  );
}

function Kpi({ label, value, unit, testId, tone }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone === 'warn' ? 'border-pl-warning/40 bg-pl-warning-bg' : 'border-pl-border bg-pl-surface'}`}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-pl-muted">{tone === 'warn' && <AlertTriangle className="h-3 w-3 shrink-0 text-pl-warning-text" aria-label="Warning" />}{label}</div>
      <div className="font-pl-mono text-sm font-semibold tabular-nums text-pl-text" data-testid={testId}>
        {value}<span className="ml-1 text-[10px] font-normal text-pl-muted">{unit}</span>
      </div>
    </div>
  );
}

export default function KillSheetTab({
  caseDraft, onCaseChange, depthUnit, ks, kt, volumes, method, onMethodChange, influxGeom,
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
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-pl-muted">
          Method
          <Select value={method} onValueChange={onMethodChange}>
            <SelectTrigger className={`${cell} w-44`} data-testid="wc-method"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="waitAndWeight">Wait and weight</SelectItem>
              <SelectItem value="drillers">Driller's method</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <Button size="sm" className="h-8" onClick={onRun} disabled={running} data-testid="wc-run">
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
        {error && <span className="text-xs text-pl-danger-text" data-testid="wc-error">{error}</span>}
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

      {/* WC-T1-001: the engine takes the influx length along the hole as its
          vertical height; in a deviated bottom section say so, with the
          vertical figures */}
      {ks?.influx && influxGeom && influxGeom.verticalM < influxGeom.alongM * 0.97 && (() => {
        const mud = caseDraft.mud?.densityKgM3;
        const dp = (caseDraft.kick?.sicpPa ?? 0) - (caseDraft.kick?.sidppPa ?? 0);
        const rhoV = mud - dp / (9.80665 * influxGeom.verticalM);
        return (
          <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-2 text-xs text-pl-warning-text" data-testid="wc-influx-deviation">
            The influx column is {depthOut(influxGeom.alongM, depthUnit).toFixed(0)} {depthLabel(depthUnit)} along the hole but
            {' '}{depthOut(influxGeom.verticalM, depthUnit).toFixed(0)} {depthLabel(depthUnit)} vertically. The influx density above uses the
            along-hole length; on the vertical height it is {emwOut(rhoV, depthUnit).toFixed(2)} {emwLabel(depthUnit)}. Read the influx type
            with that in mind.
          </div>
        );
      })()}

      {ks && ks.warnings.length > 0 && (
        <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-2 text-xs text-pl-warning-text">
          {ks.warnings.map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      {ks && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2" style={{ minHeight: 400 }}>
          <KillScheduleChart killSheet={ks} method={method} depthUnit={depthUnit} />
          <div className="overflow-y-auto rounded-lg border border-pl-border bg-pl-surface p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-pl-text">
              Step-down schedule ({method === 'drillers' ? 'circulation 2' : 'circulation 1'})
            </h3>
            <table className="w-full text-xs text-pl-text" data-testid="wc-schedule-table">
              <thead>
                <tr className="text-[10px] uppercase text-pl-muted">
                  <th className="p-1 text-right">Strokes</th>
                  <th className="p-1 text-right">Standpipe ({pressureLabel(depthUnit)})</th>
                </tr>
              </thead>
              <tbody>
                {ks.schedule.map((r, i) => (
                  <tr key={i} className="border-t border-pl-border">
                    <td className="p-1 text-right">{r.strokes.toFixed(0)}</td>
                    <td className="p-1 text-right">{pressureOut(r.pressurePa, depthUnit).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-[10px] text-pl-muted">{ks.methods[method]?.description}</div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-pl-border bg-pl-surface p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-pl-text">Run history</h3>
        {(!runs || runs.length === 0) && <div className="text-xs text-pl-muted">No saved runs yet.</div>}
        {(runs || []).map((r) => (
          <div key={r.id} className="flex items-center justify-between border-t border-pl-border py-1.5 text-xs text-pl-text first:border-t-0">
            <span>
              {new Date(r.created_at).toLocaleString()}: KMW {emwOut(r.summary?.killMudDensityKgM3 || 0, depthUnit).toFixed(2)} {emwLabel(depthUnit)},
              ICP {pressureOut(r.summary?.icpPa || 0, depthUnit).toFixed(0)} {pressureLabel(depthUnit)}
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-pl-muted hover:text-pl-danger-text" onClick={() => onDeleteRun(r.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
