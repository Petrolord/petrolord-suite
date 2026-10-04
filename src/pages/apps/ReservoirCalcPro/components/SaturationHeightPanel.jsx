// Sw from saturation height (ReservoirCalc Pro upgrade U2-007): pick a saved
// SCAL Studio project and the free-water level; the deterministic volumes
// then take Sw per fluid leg from the capillary-pressure chain.
import React, { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { shmFromScalProject } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';
import NumberField from './common/NumberField';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const FT_PER_M = 3.280839895;

export default function SaturationHeightPanel() {
  const { state, updateInputs, backend } = useReservoirCalc();
  const src = state.inputs.swSource || 'typed';
  const sh = state.inputs.saturationHeight || null;
  const len = state.unitSystem === 'metric' ? 'm' : 'ft';
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (src !== 'shm' || projects) return;
    (async () => {
      try { setProjects((await backend.scal?.listScalProjects?.()) || []); } catch (e) { setError(e.message); setProjects([]); }
    })();
  }, [src, projects, backend]);

  const pick = async (id) => {
    setError(null);
    try {
      const payload = await backend.scal.loadScalProject(id);
      const shm = shmFromScalProject(payload);
      if (!shm.ok) { setError(shm.errors[0]); return; }
      // SCAL saves the FWL as a TVDSS depth in ft; RCP contacts are elevations
      const fwlFt = Number.isFinite(shm.fwlTvdssM) ? shm.fwlTvdssM * FT_PER_M : null;
      const fwl = fwlFt === null ? (sh?.fwl ?? null) : -(state.unitSystem === 'metric' ? fwlFt / FT_PER_M : fwlFt);
      updateInputs({ saturationHeight: { projectId: id, name: shm.name, jSpec: shm.jSpec, reservoir: shm.reservoir, fluids: shm.fluids, fwl, sourceText: shm.sourceText } });
    } catch (e) { setError(e.message); }
  };

  const r = state.results?.saturationHeight;
  return (
    <div className="space-y-1.5" data-testid="rcp-shm">
      <Label className="text-[10px] text-pl-muted">Water saturation from</Label>
      <select className="h-7 w-full rounded border border-pl-border bg-pl-surface px-1 text-xs text-pl-text" data-testid="rcp-sw-source"
        value={src} onChange={(e) => updateInputs({ swSource: e.target.value })}>
        <option value="typed">the Sw typed above</option>
        <option value="shm">saturation height (SCAL Studio)</option>
      </select>
      {src === 'shm' && (
        <div className="space-y-1.5 rounded border border-pl-border p-2">
          {projects && !projects.length && <p className="text-[10px] text-pl-muted">No SCAL Studio project saved under your account. Fit a J function in SCAL Studio and save it first.</p>}
          {projects?.length > 0 && (
            <select className="h-7 w-full rounded border border-pl-border bg-pl-surface px-1 text-xs text-pl-text" data-testid="rcp-shm-project"
              value={sh?.projectId || ''} onChange={(e) => pick(e.target.value)}>
              <option value="" disabled>Pick a SCAL project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <Label className="text-[10px] text-pl-muted">Free-water level, TVDSS {len} (negative below datum)</Label>
          <NumberField className="h-7 text-xs" data-testid="rcp-shm-fwl" value={sh?.fwl ?? null}
            onCommit={(v) => updateInputs({ saturationHeight: { ...(sh || {}), fwl: v } })} />
          <p className="text-[10px] text-pl-muted">Sw at each depth comes from the project&apos;s Leverett J function and fluid gradients, at its height above the FWL, averaged over each leg with the rock at that depth. Applies to the deterministic case with Hybrid, Surfaces or Area-depth; Monte Carlo keeps the Sw distribution.</p>
          {error && <p className="text-[10px] text-pl-danger-text">{error}</p>}
          {r && (
            <p className="text-[10px] text-pl-text" data-testid="rcp-shm-result">
              Sw used: oil leg {Number.isFinite(r.swOil) ? r.swOil.toFixed(3) : EMPTY_VALUE}{Number.isFinite(r.swGas) ? `, gas cap ${r.swGas.toFixed(3)}` : ''} ({r.project || 'SCAL project'}, FWL {r.fwlElevation} {r.unit})
            </p>
          )}
        </div>
      )}
    </div>
  );
}
