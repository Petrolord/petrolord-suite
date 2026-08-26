// Well & Volumes tab: pump/SCR config, shoe definition, capacities table.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator } from 'lucide-react';
import {
  volumeOut, volumeLabel, depthOut, depthIn, depthLabel,
  emwOut, emwIn, emwLabel, pressureOut, pressureIn, pressureLabel,
} from '../services/wcRun';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

function Param({ label, value, onChange, testId, width = 'w-28' }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
      {label}
      <Input type="number" step="any" className={`${cell} ${width} text-right`} value={value}
        onChange={(e) => onChange(num(e.target.value))} data-testid={testId} />
    </label>
  );
}

export default function VolumesTab({
  caseDraft, onCaseChange, depthUnit, volumes, onCompute, running, error,
  tdCases, onImportString, shoeFracHint,
}) {
  const pump = caseDraft.pump || {};
  const shoe = caseDraft.shoe || {};
  const scr = pump.scr || [];
  const ft = depthUnit === 'ft';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Drillstring ({(caseDraft.string || []).length} components)
          </h3>
          {tdCases?.length > 0 && (
            <Select onValueChange={(id) => onImportString(id)}>
              <SelectTrigger className={`${cell} w-56`}><SelectValue placeholder="Import string from T&D case" /></SelectTrigger>
              <SelectContent>
                {tdCases.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="text-xs text-slate-400">
          {(caseDraft.string || []).map((c, i) => (
            <span key={i} className="mr-3">{c.label || c.type} ({c.lengthM.toFixed(0)} m)</span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Pump, shoe & mud</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Param label="Pump output (L/stk)" testId="wc-pump-output"
            value={+((pump.outputM3PerStroke || 0) * 1000).toFixed(2)}
            onChange={(v) => onCaseChange({ pump: { ...pump, outputM3PerStroke: v / 1000 } })} />
          <Param label={`SCR pressure (${pressureLabel(depthUnit)})`} testId="wc-scr"
            value={+pressureOut(scr[0]?.pressurePa || 0, depthUnit).toFixed(0)}
            onChange={(v) => onCaseChange({
              pump: { ...pump, scr: [{ spm: scr[0]?.spm ?? 30, pressurePa: pressureIn(v, depthUnit) }], scrIndex: 0 },
            })} />
          <Param label="SCR (spm)" width="w-20"
            value={scr[0]?.spm ?? 30}
            onChange={(v) => onCaseChange({
              pump: { ...pump, scr: [{ spm: v, pressurePa: scr[0]?.pressurePa ?? 0 }], scrIndex: 0 },
            })} />
          <Param label={`Shoe MD (${depthLabel(depthUnit)})`} testId="wc-shoe-md"
            value={+depthOut(shoe.mdM || 0, depthUnit).toFixed(0)}
            onChange={(v) => onCaseChange({ shoe: { ...shoe, mdM: depthIn(v, depthUnit) } })} />
          <Param label={`Shoe frac EMW (${emwLabel(depthUnit)})`} testId="wc-frac-emw"
            value={+emwOut(shoe.fracEmwKgM3 || 0, depthUnit).toFixed(2)}
            onChange={(v) => onCaseChange({ shoe: { ...shoe, fracEmwKgM3: emwIn(v, depthUnit) } })} />
          <Param label={ft ? 'Mud (ppg)' : 'Mud (kg/m3)'} testId="wc-mud"
            value={ft ? +(((caseDraft.mud?.densityKgM3 || 0)) / 119.826).toFixed(2) : (caseDraft.mud?.densityKgM3 || 0)}
            onChange={(v) => onCaseChange({ mud: { densityKgM3: ft ? v * 119.826 : v } })} />
          <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onCompute} disabled={running} data-testid="wc-compute-volumes">
            <Calculator className="mr-1 h-3.5 w-3.5" /> Compute volumes
          </Button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
        {shoeFracHint != null && (
          <div className="mt-2 text-[10px] text-cyan-300">
            Published fracture EMW near the shoe: {emwOut(shoeFracHint, depthUnit).toFixed(2)} {emwLabel(depthUnit)} (from the pore pressure prognosis; your entered value is used).
          </div>
        )}
      </div>

      {volumes && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5 text-xs">
            {[
              ['String volume', `${volumeOut(volumes.stringVolumeM3, depthUnit).toFixed(1)} ${volumeLabel(depthUnit)}`, 'wc-vol-string'],
              ['Annulus volume', `${volumeOut(volumes.annulusVolumeM3, depthUnit).toFixed(1)} ${volumeLabel(depthUnit)}`, 'wc-vol-annulus'],
              ['Hole TVD', `${depthOut(volumes.tvdBhM, depthUnit).toFixed(0)} ${depthLabel(depthUnit)}`, 'wc-tvd-bh'],
              ['Shoe TVD', `${depthOut(volumes.tvdShoeM, depthUnit).toFixed(0)} ${depthLabel(depthUnit)}`, 'wc-tvd-shoe'],
              ['Full cycle strokes', volumes.strokes ? volumes.strokes.fullCycle.toFixed(0) : '--', 'wc-strokes'],
            ].map(([label, value, tid]) => (
              <div key={label} className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
                <div className="text-[9px] uppercase text-slate-500">{label}</div>
                <div className="text-sm font-semibold text-slate-100" data-testid={tid}>{value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <table className="w-full text-xs text-slate-300" data-testid="wc-cap-table">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500">
                  <th className="p-1 text-right">From ({depthLabel(depthUnit)})</th>
                  <th className="p-1 text-right">To ({depthLabel(depthUnit)})</th>
                  <th className="p-1 text-right">Annulus cap (L/m)</th>
                  <th className="p-1 text-right">Volume ({volumeLabel(depthUnit)})</th>
                </tr>
              </thead>
              <tbody>
                {volumes.annulusRows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-1 text-right">{depthOut(r.fromMd, depthUnit).toFixed(0)}</td>
                    <td className="p-1 text-right">{depthOut(r.toMd, depthUnit).toFixed(0)}</td>
                    <td className="p-1 text-right">{(r.capM2 * 1000).toFixed(1)}</td>
                    <td className="p-1 text-right">{volumeOut(r.volM3, depthUnit).toFixed(2)}</td>
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
