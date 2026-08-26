// Inputs & Logs tab: log source (registry well), curve mapping status,
// PP source choice, geomechanical parameters with lithology seeds.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database } from 'lucide-react';
import { LITHOLOGY_SEEDS } from '../engine/geomech';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

function Param({ label, value, onChange, testId, width = 'w-24' }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
      {label}
      <Input type="number" step="any" className={`${cell} ${width} text-right`} value={value}
        onChange={(e) => onChange(num(e.target.value))} data-testid={testId} />
    </label>
  );
}

export default function InputsTab({
  caseDraft, onCaseChange, geoWells, curveStatus, onLoadCurves, loading, error,
}) {
  const source = caseDraft.source || {};
  const params = caseDraft.params || {};
  const setSource = (patch) => onCaseChange({ source: { ...source, ...patch } });
  const setParams = (patch) => onCaseChange({ params: { ...params, ...patch } });

  const applySeed = (name) => {
    const s = LITHOLOGY_SEEDS.find((l) => l.name === name);
    if (!s) return;
    setParams({
      nu: s.nu,
      frictionAngleDeg: s.frictionAngleDeg,
      lithology: s.name,
      ucs: params.ucs?.correlation === 'constant'
        ? { correlation: 'constant', params: { ucsPa: s.cohesionMPa * 4 * 1e6 } }
        : params.ucs,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Log source</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            Registry well
            <Select value={source.geoWellId || ''} onValueChange={(id) => setSource({ geoWellId: id })}>
              <SelectTrigger className={`${cell} w-56`} data-testid="gm-geowell"><SelectValue placeholder="pick a well" /></SelectTrigger>
              <SelectContent>
                {(geoWells || []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            Pore pressure source
            <Select value={source.ppSource || 'hydrostatic'} onValueChange={(v) => setSource({ ppSource: v })}>
              <SelectTrigger className={`${cell} w-56`} data-testid="gm-ppsource"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="published">Published pp-1.0.0 curves</SelectItem>
                <SelectItem value="computed">Compute (Eaton over DT)</SelectItem>
                <SelectItem value="hydrostatic">Hydrostatic</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onLoadCurves} disabled={loading || !source.geoWellId} data-testid="gm-load">
            <Database className="mr-1 h-3.5 w-3.5" /> {loading ? 'Loading…' : 'Load curves'}
          </Button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
        {curveStatus && (
          <div className="mt-2 flex flex-wrap gap-2 text-[10px]" data-testid="gm-curve-status">
            {Object.entries(curveStatus).map(([k, ok]) => (
              <span key={k} className={`rounded px-1.5 py-0.5 ${ok ? 'bg-lime-900/50 text-lime-300' : 'bg-slate-800 text-slate-500'}`}>
                {k}: {ok ? 'found' : 'missing'}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Geomechanical parameters</h3>
          <Select value={params.lithology || ''} onValueChange={applySeed}>
            <SelectTrigger className={`${cell} w-40`}><SelectValue placeholder="lithology seed" /></SelectTrigger>
            <SelectContent>
              {LITHOLOGY_SEEDS.map((l) => <SelectItem key={l.name} value={l.name}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Param label="Poisson nu" value={params.nu ?? 0.25} onChange={(v) => setParams({ nu: v })} testId="gm-nu" />
          <Param label="Biot alpha" value={params.alphaBiot ?? 1} onChange={(v) => setParams({ alphaBiot: v })} />
          <Param label="Friction angle (deg)" value={params.frictionAngleDeg ?? 30}
            onChange={(v) => setParams({ frictionAngleDeg: v })} testId="gm-phi" />
          <Param label="Tensile strength (MPa)" value={+((params.tensileStrengthPa ?? 0) / 1e6).toFixed(1)}
            onChange={(v) => setParams({ tensileStrengthPa: v * 1e6 })} />
          <Param label="Strain ex (1e-4)" value={+(((params.epsX ?? 0)) * 1e4).toFixed(2)}
            onChange={(v) => setParams({ epsX: v / 1e4 })} />
          <Param label="Strain ey (1e-4)" value={+(((params.epsY ?? 0)) * 1e4).toFixed(2)}
            onChange={(v) => setParams({ epsY: v / 1e4 })} />
          <Param label="E (GPa, 0 = off)" value={+((params.ePa ?? 0) / 1e9).toFixed(0)}
            onChange={(v) => setParams({ ePa: v > 0 ? v * 1e9 : null })} />
          <Param label="SHmax azimuth (deg)" value={params.shmaxAzimuthDeg ?? 0}
            onChange={(v) => setParams({ shmaxAzimuthDeg: v })} testId="gm-shazi" />
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            Regime
            <Select value={params.regime || 'NF'} onValueChange={(v) => setParams({ regime: v })}>
              <SelectTrigger className={`${cell} w-24`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NF">NF</SelectItem>
                <SelectItem value="SS">SS</SelectItem>
                <SelectItem value="TF">TF</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            UCS correlation
            <Select value={params.ucs?.correlation || 'horsrud'}
              onValueChange={(v) => setParams({ ucs: { ...(params.ucs || {}), correlation: v } })}>
              <SelectTrigger className={`${cell} w-44`} data-testid="gm-ucs-corr"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="horsrud">Horsrud 2001 (shale)</SelectItem>
                <SelectItem value="mcnally">McNally 1987 (sandstone)</SelectItem>
                <SelectItem value="constant">Constant</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {params.ucs?.correlation === 'constant' && (
            <Param label="UCS (MPa)" value={+((params.ucs?.params?.ucsPa ?? 40e6) / 1e6).toFixed(0)}
              onChange={(v) => setParams({ ucs: { correlation: 'constant', params: { ucsPa: v * 1e6 } } })} />
          )}
        </div>
      </div>
    </div>
  );
}
