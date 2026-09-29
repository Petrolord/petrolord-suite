// Saturation-height dialog (AppUpgrade PETRO-U2-010): pick a saved SCAL
// Studio project, say where k and porosity come from and where the free-water
// level is, and compare the log Sw with the capillary-pressure Sw zone by
// zone. Numbers from services/saturationHeight.js (SCAL Studio's engine).

import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { shmFromScalProject } from '../services/saturationHeight';

const inputCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';
const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v).toFixed(d) : EMPTY_VALUE);
const FT = 0.3048;

export default function SaturationHeightDialog({
  open, onOpenChange, backend, depthUnit = 'm', zones = [], settings = null, result = null, comparison = null, onRun, onShowTracks,
}) {
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(settings?.projectId || '');
  const [payload, setPayload] = useState(null);
  const [rock, setRock] = useState(settings?.rock || 'project');
  const [fwlText, setFwlText] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open || projects) return;
    (async () => {
      try {
        const list = backend.listScalProjects ? await backend.listScalProjects() : [];
        setProjects(list);
        if (!projectId && list[0]) setProjectId(list[0].id);
      } catch (e) { setError(e.message); setProjects([]); }
    })();
  }, [open, projects, backend, projectId]);
  useEffect(() => {
    if (!projectId || !backend.loadScalProject) return;
    (async () => {
      try {
        const p = await backend.loadScalProject(projectId);
        setPayload(p);
        const shm = shmFromScalProject(p);
        const fwl = Number.isFinite(settings?.fwlTvdssM) && settings.projectId === projectId ? settings.fwlTvdssM : shm.fwlTvdssM;
        setFwlText(Number.isFinite(fwl) ? String(Number((depthUnit === 'ft' ? fwl / FT : fwl).toFixed(2))) : '');
        setError(shm.ok ? null : shm.errors[0]);
      } catch (e) { setError(e.message); }
    })();
  }, [projectId, backend, depthUnit, settings]);
  const shm = payload ? shmFromScalProject(payload) : null;
  const run = () => {
    const v = Number(fwlText);
    if (!(fwlText.trim() && Number.isFinite(v))) { setError('Type the free-water level (TVDSS).'); return; }
    onRun({ projectId, projectName: shm?.name, shm, rock, fwlTvdssM: depthUnit === 'ft' ? v * FT : v });
  };
  const u = depthUnit === 'ft' ? 'ft' : 'm';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="petro-shm-dialog">
        <DialogHeader>
          <DialogTitle>Saturation-height from SCAL Studio</DialogTitle>
          <DialogDescription className="text-pl-muted">
            Water saturation from capillary pressure: the project&apos;s Leverett J function (Leverett 1941) scaled to the rock,
            converted to height above the free-water level with its fluid gradients, and read at each sample&apos;s TVDSS.
            Compare it with the log Sw zone by zone.
          </DialogDescription>
        </DialogHeader>
        {projects && !projects.length && <p className="text-xs text-pl-muted" data-testid="petro-shm-none">No SCAL Studio project saved under your account. Fit a J function in SCAL Studio and save the project first.</p>}
        {projects?.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <label className="flex flex-col gap-0.5 text-pl-muted">SCAL project
              <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="petro-shm-project">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-pl-muted">k and φ
              <select className={inputCls} value={rock} onChange={(e) => setRock(e.target.value)} data-testid="petro-shm-rock">
                <option value="project">the project&apos;s rock</option>
                <option value="logs">per sample from KPERM and φe</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-pl-muted">Free-water level (TVDSS, {u})
              <input className={inputCls} value={fwlText} onChange={(e) => setFwlText(e.target.value)} data-testid="petro-shm-fwl" />
            </label>
          </div>
        )}
        {shm?.ok && (
          <p className="text-[11px] text-pl-muted" data-testid="petro-shm-function">
            J = {shm.jSpec.type === 'power' ? `${fmt(shm.jSpec.a)} ((Sw - ${fmt(shm.jSpec.Swirr, 2)}) / (1 - ${fmt(shm.jSpec.Swirr, 2)}))^-${fmt(shm.jSpec.b, 2)}` : 'tabulated'};
            rock k {shm.reservoir.k_md} mD, φ {shm.reservoir.phi}, σ cos θ from {shm.reservoir.sigma_dyncm} dyn/cm at {shm.reservoir.thetaDeg}°;
            gradients water {shm.fluids.gammaW}, hydrocarbon {shm.fluids.gammaHc} (specific gravity).
          </p>
        )}
        {error && <p className="text-xs text-pl-danger-text" data-testid="petro-shm-error">{error}</p>}
        {result && comparison && (
          <table className="text-xs border-collapse min-w-full" data-testid="petro-shm-compare">
            <thead><tr className="text-pl-muted">{['Zone', 'Samples', 'Log Sw', 'SHM Sw', 'Log minus SHM'].map((h) => <th key={h} className="text-left px-2 py-1 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {zones.map((z) => {
                const c = comparison[z.id] || {};
                return (
                  <tr key={z.id} className="border-t border-pl-border" data-testid={`petro-shm-row-${z.name}`}>
                    <td className="px-2 py-1 text-pl-text">{z.name}</td>
                    <td className="px-2 py-1">{c.n || 0}</td>
                    <td className="px-2 py-1">{fmt(c.logSw)}</td>
                    <td className="px-2 py-1">{fmt(c.shmSw)}</td>
                    <td className={`px-2 py-1 ${Math.abs(c.diff) > 0.1 ? 'text-pl-warning-text' : ''}`}>{fmt(c.diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" size="sm" data-testid="petro-shm-tracks" disabled={!result} onClick={onShowTracks}>Show on tracks</Button>
          <Button size="sm" data-testid="petro-shm-run" disabled={!shm?.ok} onClick={run}>Compute</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
