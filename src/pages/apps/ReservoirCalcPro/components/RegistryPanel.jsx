// Wells tab (ReservoirCalc Pro RC1, 2026-09-06): the door from the shared
// Geoscience registry into the volumetric inputs. Pick a zone and pull
// the zone averages Petrophysics Studio published (porosity, Sw, NTG,
// net thickness) from every well that carries it; take the area from a
// registry surface's live footprint; take a boundary polygon drawn in
// Mapping & Surface Studio as an AOI. Nothing is applied silently: the
// panel shows what Apply would set, and the audit trail and the inputs'
// provenance record the source.

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Database, Loader2 } from 'lucide-react';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import {
  zoneCatalog, registryPatchForZone, areaPatchForSurface, aoiFromBoundary, isBoundaryLayer, describePatch,
} from '../services/registryDoor';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

export default function RegistryPanel() {
  const { state, backend, updateInputs, addAOI, logEvent } = useReservoirCalc();
  const [wells, setWells] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const [boundaries, setBoundaries] = useState([]);
  const [zone, setZone] = useState('');
  const [surfaceId, setSurfaceId] = useState('');
  const [boundaryId, setBoundaryId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const ws = backend?.wells ? await backend.wells.listWellsWithTops() : [];
        const withZones = await Promise.all(ws.map(async (w) => ({
          ...w,
          zones: Array.isArray(w.zones) && w.zones.length ? w.zones : (backend?.wells?.listZones ? await backend.wells.listZones(w.id).catch(() => []) : []),
        })));
        if (live) setWells(withZones);
      } catch (e) { if (live) { setWells([]); setNote(e.message); } }
      try { const s = backend?.surfaces ? await backend.surfaces.listSurfaces() : []; if (live) setSurfaces(s.filter((x) => x.kind !== 'attribute')); } catch { /* no registry surfaces */ }
      try { const c = backend?.culture ? await backend.culture.listCulture() : []; if (live) setBoundaries(c.filter(isBoundaryLayer)); } catch { /* no culture */ }
    })();
    return () => { live = false; };
  }, [backend]);

  const catalog = useMemo(() => zoneCatalog(wells || []), [wells]);
  const preview = useMemo(() => {
    if (!zone || !wells) return null;
    try { return registryPatchForZone(wells, zone, state.unitSystem); } catch (e) { return { error: e.message }; }
  }, [zone, wells, state.unitSystem]);

  const applyZone = () => {
    if (!preview || preview.error) { setNote(preview?.error || 'Choose a zone first.'); return; }
    updateInputs({ ...preview.patch, registryProvenance: { ...(state.inputs?.registryProvenance || {}), zone: preview.provenance } });
    logEvent('Registry inputs applied', `zone ${zone}: ${describePatch(preview.patch, state.unitSystem)} from ${preview.wellNames.join(', ')}`);
    setNote(`Applied ${describePatch(preview.patch, state.unitSystem)} from ${preview.fromWells} well${preview.fromWells === 1 ? '' : 's'} (${preview.wellNames.join(', ')}).`);
  };

  const applyArea = async () => {
    const s = surfaces.find((x) => x.id === surfaceId);
    if (!s) { setNote('Choose a surface first.'); return; }
    setBusy(true);
    try {
      const grid = await backend.surfaces.downloadSurfaceGrid(s);
      const r = areaPatchForSurface(s, grid, state.unitSystem);
      updateInputs({ ...r.patch, registryProvenance: { ...(state.inputs?.registryProvenance || {}), area: r.provenance } });
      logEvent('Registry area applied', `${s.name}: ${describePatch(r.patch, state.unitSystem)}`);
      setNote(`Applied ${describePatch(r.patch, state.unitSystem)} from the live footprint of ${s.name}.`);
    } catch (e) { setNote(e.message); } finally { setBusy(false); }
  };

  const addBoundary = async () => {
    const row = boundaries.find((b) => b.id === boundaryId);
    if (!row) { setNote('Choose a boundary polygon first.'); return; }
    setBusy(true);
    try {
      const feats = await backend.culture.downloadCultureFeatures(row);
      const aoi = aoiFromBoundary(row, feats);
      addAOI(aoi);
      logEvent('AOI from registry', `${row.name} (${row.kind}, ${aoi.vertices.length} vertices)`);
      setNote(`Added ${row.name} as an AOI (${aoi.vertices.length} vertices). Activate it in the AOI tab to clip the volumetrics.`);
    } catch (e) { setNote(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 text-xs" data-testid="rcp-registry-panel">
      <div className="bg-cyan-900/20 border border-cyan-800 p-2 rounded text-[10px] text-cyan-300 leading-tight flex items-start gap-1">
        <Database className="w-3 h-3 mt-0.5 shrink-0" />
        <span>From the shared Geoscience registry: zone averages published by Petrophysics Studio, surfaces from Mapping and Earth Modeling, boundary polygons drawn in Mapping. Nothing is applied until you press Apply; the audit trail records the source.</span>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-slate-300">Petrophysics from a registry zone</Label>
        {wells === null ? (
          <div className="text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading wells</div>
        ) : (
          <select className={selCls} data-testid="rcp-reg-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">zone…</option>
            {catalog.map((z) => <option key={z.name} value={z.name}>{z.name} ({z.published} of {z.wells} wells published)</option>)}
          </select>
        )}
        {preview && !preview.error && (
          <div className="text-slate-300" data-testid="rcp-reg-preview">{describePatch(preview.patch, state.unitSystem)} from {preview.wellNames.join(', ')}</div>
        )}
        {preview?.error && <div className="text-amber-400">{preview.error}</div>}
        <Button size="sm" className="h-7 text-xs w-full" data-testid="rcp-reg-apply-zone" disabled={!preview || !!preview.error} onClick={applyZone}>Apply zone averages</Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-slate-300">Area from a registry surface</Label>
        <select className={selCls} data-testid="rcp-reg-surface" value={surfaceId} onChange={(e) => setSurfaceId(e.target.value)}>
          <option value="">surface…</option>
          {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.nx}x{s.ny})</option>)}
        </select>
        <Button size="sm" variant="outline" className="h-7 text-xs w-full" data-testid="rcp-reg-apply-area" disabled={!surfaceId || busy} onClick={applyArea}>Apply footprint area</Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-slate-300">Boundary polygon as an AOI</Label>
        <select className={selCls} data-testid="rcp-reg-boundary" value={boundaryId} onChange={(e) => setBoundaryId(e.target.value)}>
          <option value="">boundary…</option>
          {boundaries.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.kind})</option>)}
        </select>
        <Button size="sm" variant="outline" className="h-7 text-xs w-full" data-testid="rcp-reg-add-aoi" disabled={!boundaryId || busy} onClick={addBoundary}>Add as AOI</Button>
      </div>

      {note && <div className="text-[11px] text-slate-400" data-testid="rcp-reg-note">{note}</div>}
      {state.inputs?.registryProvenance && (
        <div className="text-[10px] text-slate-500">
          {state.inputs.registryProvenance.zone && <div>Petrophysics from zone {state.inputs.registryProvenance.zone.zone} ({(state.inputs.registryProvenance.zone.wells || []).join(', ')})</div>}
          {state.inputs.registryProvenance.area && <div>Area from {state.inputs.registryProvenance.area.surface}</div>}
        </div>
      )}
    </div>
  );
}
