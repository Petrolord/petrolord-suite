// Job Design tab: casing, depths, TOC/excess, fluid program, volume summary.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { CASING_QUICK } from '../../TorqueDragStudio/engine/tubulars';
import {
  volumeOut, volumeIn, volumeLabel, depthOut, depthIn, depthLabel,
  emwOut, emwIn, emwLabel,
} from '../services/cmtRun';

const IN = 0.0254;
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

const KINDS = ['spacer', 'lead', 'tail', 'displacement'];

export default function JobDesignTab({
  caseDraft, onCaseChange, depthUnit, vols, onCompute, running, error,
}) {
  const casing = caseDraft.casing || {};
  const job = caseDraft.job || {};
  const fluids = caseDraft.fluids || { mudInHole: {}, program: [] };
  const ft = depthUnit === 'ft';
  const setCasing = (patch) => onCaseChange({ casing: { ...casing, ...patch } });
  const setJob = (patch) => onCaseChange({ job: { ...job, ...patch } });
  const setFluids = (patch) => onCaseChange({ fluids: { ...fluids, ...patch } });

  const applyCasing = (designation) => {
    const item = CASING_QUICK.find((x) => x.designation === designation);
    if (!item) return;
    setCasing({ odM: item.odM, idM: item.idM, weightKgM: item.weightKgM, label: item.designation });
  };

  const setProgram = (i, patch) => setFluids({
    program: fluids.program.map((f, j) => (j === i ? { ...f, ...patch } : f)),
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Casing & job</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            Casing
            <Select value={casing.label || ''} onValueChange={applyCasing}>
              <SelectTrigger className={`${cell} w-48`} data-testid="cmt-casing"><SelectValue placeholder="pick casing" /></SelectTrigger>
              <SelectContent>
                {CASING_QUICK.map((item) => (
                  <SelectItem key={item.designation} value={item.designation}>{item.designation}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Param label="OD (in)" value={+((casing.odM || 0) / IN).toFixed(3)}
            onChange={(v) => setCasing({ odM: v * IN })} width="w-20" />
          <Param label="ID (in)" value={+((casing.idM || 0) / IN).toFixed(3)}
            onChange={(v) => setCasing({ idM: v * IN })} width="w-20" />
          <Param label={`Shoe MD (${depthLabel(depthUnit)})`} testId="cmt-shoe"
            value={+depthOut(casing.shoeMd || 0, depthUnit).toFixed(0)}
            onChange={(v) => setCasing({ shoeMd: depthIn(v, depthUnit) })} />
          <Param label={`Float collar (${depthLabel(depthUnit)})`}
            value={+depthOut(casing.floatCollarMd || 0, depthUnit).toFixed(0)}
            onChange={(v) => setCasing({ floatCollarMd: depthIn(v, depthUnit) })} />
          <Param label={`TOC (${depthLabel(depthUnit)})`} testId="cmt-toc"
            value={+depthOut(job.tocMd || 0, depthUnit).toFixed(0)}
            onChange={(v) => setJob({ tocMd: depthIn(v, depthUnit) })} />
          <Param label="OH excess (%)" value={job.excessOpenHolePct ?? 0}
            onChange={(v) => setJob({ excessOpenHolePct: v })} width="w-20" />
          <Param label={`Lead/tail split (${depthLabel(depthUnit)})`}
            value={+depthOut(job.leadTailSplitMd || 0, depthUnit).toFixed(0)}
            onChange={(v) => setJob({ leadTailSplitMd: v > 0 ? depthIn(v, depthUnit) : null })} />
          <Param label="Pump rate (L/s)" value={+((job.pumpRateM3s || 0) * 1000).toFixed(1)}
            onChange={(v) => setJob({ pumpRateM3s: v / 1000 })} width="w-24" />
          <Param label="Yield (m3/sk)" value={job.slurryYieldM3PerSack ?? 0.0382}
            onChange={(v) => setJob({ slurryYieldM3PerSack: v })} width="w-24" />
          <Param label={ft ? 'Mud (ppg)' : 'Mud (kg/m3)'}
            value={ft ? +(((fluids.mudInHole?.densityKgM3 || 0)) / 119.826).toFixed(2) : (fluids.mudInHole?.densityKgM3 || 0)}
            onChange={(v) => setFluids({ mudInHole: { ...fluids.mudInHole, densityKgM3: ft ? v * 119.826 : v } })} />
          <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onCompute} disabled={running} data-testid="cmt-compute">
            <Calculator className="mr-1 h-3.5 w-3.5" /> Compute volumes
          </Button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Pump program (in order)</h3>
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => setFluids({ program: [...fluids.program, { kind: 'spacer', densityKgM3: 1500, volumeM3: 3 }] })}>
            <Plus className="mr-1 h-3 w-3" /> Fluid
          </Button>
        </div>
        <table className="w-full text-xs text-slate-300">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500">
              <th className="p-1 text-left">Kind</th>
              <th className="p-1 text-right">Density ({emwLabel(depthUnit)})</th>
              <th className="p-1 text-right">Volume ({volumeLabel(depthUnit)}; 0 = auto)</th>
              <th className="p-1 text-right">Fann 600/300</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {fluids.program.map((f, i) => (
              <tr key={i} className="border-t border-slate-800">
                <td className="p-1">
                  <Select value={f.kind} onValueChange={(k) => setProgram(i, { kind: k })}>
                    <SelectTrigger className={`${cell} w-36`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <Input className={`${cell} w-24 text-right`} value={+emwOut(f.densityKgM3 || 0, depthUnit).toFixed(2)}
                    onChange={(e) => setProgram(i, { densityKgM3: emwIn(num(e.target.value), depthUnit) })} />
                </td>
                <td className="p-1">
                  <Input className={`${cell} w-24 text-right`}
                    value={f.volumeM3 != null ? +volumeOut(f.volumeM3, depthUnit).toFixed(1) : 0}
                    onChange={(e) => {
                      const v = num(e.target.value);
                      setProgram(i, { volumeM3: v > 0 ? volumeIn(v, depthUnit) : null });
                    }} />
                </td>
                <td className="p-1">
                  <div className="flex justify-end gap-1">
                    <Input className={`${cell} w-16 text-right`} value={f.fann?.theta600 ?? ''}
                      onChange={(e) => setProgram(i, { fann: { ...(f.fann || {}), theta600: num(e.target.value) } })} />
                    <Input className={`${cell} w-16 text-right`} value={f.fann?.theta300 ?? ''}
                      onChange={(e) => setProgram(i, { fann: { ...(f.fann || {}), theta300: num(e.target.value) } })} />
                  </div>
                </td>
                <td className="p-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-red-400"
                    onClick={() => setFluids({ program: fluids.program.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {vols && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6 text-xs">
          {[
            ['Slurry total', `${volumeOut(vols.slurryM3, depthUnit).toFixed(1)} ${volumeLabel(depthUnit)}`, 'cmt-slurry'],
            ['Lead', `${volumeOut(vols.leadM3, depthUnit).toFixed(1)} ${volumeLabel(depthUnit)}`, 'cmt-lead'],
            ['Tail', `${volumeOut(vols.tailM3, depthUnit).toFixed(1)} ${volumeLabel(depthUnit)}`, 'cmt-tail'],
            ['Sacks', vols.sacks != null ? vols.sacks.toFixed(0) : '--', 'cmt-sacks'],
            ['Displacement', `${volumeOut(vols.displacementM3, depthUnit).toFixed(1)} ${volumeLabel(depthUnit)}`, 'cmt-disp'],
            ['Job time', vols.jobTimeS != null ? `${(vols.jobTimeS / 60).toFixed(0)} min` : '--', 'cmt-time'],
          ].map(([label, value, tid]) => (
            <div key={label} className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[9px] uppercase text-slate-500">{label}</div>
              <div className="text-sm font-semibold text-slate-100" data-testid={tid}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
