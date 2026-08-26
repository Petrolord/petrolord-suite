// Mud & Rheology tab: Fann dial inputs, fitted models, rheogram; plus the
// drillstring source (import from a T&D case or edit lengths inline).

import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { RheogramChart } from '../charts/HydCharts';
import { fitModels } from '../engine/rheology';
import { densityIn } from '../services/hydRun';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

function Param({ label, value, onChange, testId }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
      {label}
      <Input type="number" step="any" className={`${cell} w-24 text-right`} value={value}
        onChange={(e) => onChange(num(e.target.value))} data-testid={testId} />
    </label>
  );
}

export default function MudRheologyTab({ caseDraft, onCaseChange, depthUnit, tdCases, onImportString }) {
  const mud = caseDraft.mud || {};
  const fann = mud.fann || {};
  const ft = depthUnit === 'ft';
  const setMud = (patch) => onCaseChange({ mud: { ...mud, ...patch } });
  const setFann = (patch) => setMud({ fann: { ...fann, ...patch } });

  const fits = useMemo(() => {
    try {
      return fitModels(fann);
    } catch {
      return null;
    }
  }, [fann]);
  const chosen = mud.model && mud.model !== 'auto' ? mud.model : 'herschelBulkley';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Mud properties</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Param label={ft ? 'Density (ppg)' : 'Density (kg/m3)'}
            value={ft ? +((mud.densityKgM3 || 0) / 119.826).toFixed(2) : (mud.densityKgM3 || 0)}
            onChange={(v) => setMud({ densityKgM3: ft ? densityIn(v, 'ft') : v })} testId="hyd-density" />
          <Param label="Fann 600" value={fann.theta600 ?? ''} onChange={(v) => setFann({ theta600: v })} testId="hyd-f600" />
          <Param label="Fann 300" value={fann.theta300 ?? ''} onChange={(v) => setFann({ theta300: v })} testId="hyd-f300" />
          <Param label="Fann 6" value={fann.theta6 ?? ''} onChange={(v) => setFann({ theta6: v })} />
          <Param label="Fann 3" value={fann.theta3 ?? ''} onChange={(v) => setFann({ theta3: v })} />
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            Model
            <Select value={mud.model || 'auto'} onValueChange={(m) => setMud({ model: m })}>
              <SelectTrigger className={`${cell} w-44`} data-testid="hyd-model"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Herschel-Bulkley)</SelectItem>
                <SelectItem value="herschelBulkley">Herschel-Bulkley</SelectItem>
                <SelectItem value="powerLaw">Power law</SelectItem>
                <SelectItem value="bingham">Bingham plastic</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        {fits && (
          <table className="mt-3 text-xs text-slate-300" data-testid="hyd-fit-table">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500">
                <th className="p-1 text-left">Model</th>
                <th className="p-1 text-right">PV (cP)</th>
                <th className="p-1 text-right">YP / tau-y (Pa)</th>
                <th className="p-1 text-right">n</th>
                <th className="p-1 text-right">K (Pa-s^n)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-800">
                <td className="p-1">Bingham</td>
                <td className="p-1 text-right">{(fits.bingham.pvPaS * 1000).toFixed(1)}</td>
                <td className="p-1 text-right">{fits.bingham.ypPa.toFixed(2)}</td>
                <td className="p-1 text-right">--</td>
                <td className="p-1 text-right">--</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="p-1">Power law</td>
                <td className="p-1 text-right">--</td>
                <td className="p-1 text-right">--</td>
                <td className="p-1 text-right">{fits.powerLaw.n.toFixed(3)}</td>
                <td className="p-1 text-right">{fits.powerLaw.kPaSn.toFixed(3)}</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="p-1">Herschel-Bulkley</td>
                <td className="p-1 text-right">--</td>
                <td className="p-1 text-right">{fits.herschelBulkley.tauYPa.toFixed(2)}</td>
                <td className="p-1 text-right">{fits.herschelBulkley.n.toFixed(3)}</td>
                <td className="p-1 text-right">{fits.herschelBulkley.kPaSn.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        )}
        {!fits && <div className="mt-2 text-xs text-amber-400">Enter Fann 600 and 300 readings (600 above 300).</div>}
      </div>

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
        <div className="mt-1 text-[10px] text-slate-500">
          The string defines bore and annulus geometry for the loss model. Edit it in Torque & Drag Studio and import here, or keep the default.
        </div>
      </div>

      {fits && (
        <div className="min-h-0 flex-1" style={{ minHeight: 360 }}>
          <RheogramChart fann={fann} fits={fits} chosen={chosen} />
        </div>
      )}
    </div>
  );
}
