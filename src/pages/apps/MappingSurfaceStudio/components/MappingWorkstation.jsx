// Mapping & Surface Studio workspace controller (G4.3) on the shared
// WorkspaceShell: surfaces explorer + gridding source on the left, the
// map canvas in the center, surface math + publish/export in the right
// dock, status bar below. Owns all state; every data touch goes
// through the injected backend so /dev/mapping-surface-studio runs the
// identical app on the in-memory backend (no auth/DB).
//
// Gridding uses the shared byte-golden engine (src/lib/gridding); the
// app glue (registry points, resample, surface math) is engine/surface.js.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, Loader2, UploadCloud, Sigma } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { ScrollArea } from '@/components/ui/scroll-area';
import SurfacesExplorer from './SurfacesExplorer';
import MapCanvas from './MapCanvas';
import { gridSurface } from '@/lib/gridding/gridding';
import {
  topsToPoints, zoneAttrToPoints, specForPoints, gridObject,
  resampleTo, isochore, surfaceStats,
} from '../engine/surface';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

export default function MappingWorkstation({ backend }) {
  const [wells, setWells] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [displayGrid, setDisplayGrid] = useState(null);   // Float32Array shown
  const [displaySurface, setDisplaySurface] = useState(null); // meta shown (saved or preview)
  const [preview, setPreview] = useState(null);           // {spec, grid, name, kind, provenance} unsaved
  const [source, setSource] = useState({ type: 'top', key: '' });
  const [cellM, setCellM] = useState('150');
  const [gridding, setGridding] = useState(false);
  const [isoPair, setIsoPair] = useState({ a: '', b: '' });
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);

  const refresh = useCallback(async () => {
    try { setSurfaces(await backend.listSurfaces()); }
    catch (e) { setStatus(e.message); }
  }, [backend]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const w = await backend.listWells();
        if (!live) return;
        setWells(w);
        await refresh();
      } catch (e) { if (live) { setStatus(e.message); setWells([]); } }
    })();
    return () => { live = false; };
  }, [backend, refresh]);

  const topNames = useMemo(() => {
    const seen = [];
    for (const w of wells || []) for (const t of w.tops || []) if (!seen.includes(t.name)) seen.push(t.name);
    return seen;
  }, [wells]);
  const zoneKeys = useMemo(() => {
    const keys = new Set();
    for (const w of wells || []) for (const z of w.zones || []) {
      for (const k of Object.keys(z.properties || {})) if (Number.isFinite(z.properties[k])) keys.add(k);
    }
    return [...keys];
  }, [wells]);

  useEffect(() => {
    if (!source.key && topNames.length) setSource({ type: 'top', key: topNames[0] });
  }, [topNames, source.key]);

  const runGrid = async () => {
    const cell = Number(cellM);
    if (!(cell > 0)) { setStatus('Cell size must be a positive number of metres.'); return; }
    setGridding(true);
    try {
      const points = source.type === 'top'
        ? topsToPoints(wells, source.key)
        : zoneAttrToPoints(wells, source.zoneName || 'Reservoir', source.key);
      if (points.length < 3) throw new Error('Need at least 3 control points — this source has too few wells.');
      const spec = specForPoints(points, cell, 2);
      if (spec.nx * spec.ny > 4_000_000) throw new Error('Grid too large — increase the cell size.');
      const g = gridSurface(points, spec);
      const name = source.type === 'top' ? `${source.key} structure` : `${source.key} attribute`;
      setPreview({
        spec, grid: g.z, name, kind: source.type === 'top' ? 'structure' : 'attribute',
        provenance: { source: source, control_points: points.length, cell_m: cell, engine: 'mapping-surface-studio' },
      });
      setDisplaySurface({ origin_x: spec.x0, origin_y: spec.y0, nx: spec.nx, ny: spec.ny, dx: spec.dx, dy: spec.dy, name, kind: preview?.kind });
      setDisplayGrid(g.z);
      setSelectedId(null);
      setStatus(`Gridded ${name} from ${points.length} wells (${spec.nx}×${spec.ny}). Review, then Publish.`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setGridding(false);
    }
  };

  const selectSurface = async (id) => {
    setSelectedId(id);
    setPreview(null);
    const s = surfaces.find((x) => x.id === id);
    if (!s) return;
    try {
      const grid = await backend.downloadSurfaceGrid(s);
      setDisplaySurface(s);
      setDisplayGrid(grid);
      const st = surfaceStats(grid);
      setStatus(`${s.name}: ${st.count} live nodes, z ${st.min?.toFixed(1)}–${st.max?.toFixed(1)}.`);
    } catch (e) { setStatus(e.message); }
  };

  const publish = async () => {
    if (!preview) return;
    try {
      const saved = await backend.saveSurface({
        name: preview.name, kind: preview.kind, spec: preview.spec,
        zDomain: preview.kind === 'attribute' ? 'attribute' : 'depth',
        zUnit: preview.kind === 'attribute' ? null : 'm',
        provenance: preview.provenance, grid: preview.grid,
      });
      setStatus(`Published ${saved.name} to the registry.`);
      setPreview(null);
      await refresh();
      setSelectedId(saved.id);
    } catch (e) { setStatus(e.message); }
  };

  const runIsochore = async () => {
    const a = surfaces.find((s) => s.id === isoPair.a);
    const b = surfaces.find((s) => s.id === isoPair.b);
    if (!a || !b) { setStatus('Pick two surfaces for the isochore.'); return; }
    try {
      const [ga, gb] = await Promise.all([backend.downloadSurfaceGrid(a), backend.downloadSurfaceGrid(b)]);
      const specA = { x0: a.origin_x, y0: a.origin_y, dx: a.dx, dy: a.dy, nx: a.nx, ny: a.ny };
      const specB = { x0: b.origin_x, y0: b.origin_y, dx: b.dx, dy: b.dy, nx: b.nx, ny: b.ny };
      const gbOnA = resampleTo(gb, specB, specA);
      const iso = isochore(ga, gbOnA); // a(deep) - b(shallow)
      const name = `${a.name} − ${b.name} isochore`;
      setPreview({ spec: specA, grid: iso, name, kind: 'isochore', provenance: { isochore: [a.id, b.id], engine: 'mapping-surface-studio' } });
      setDisplaySurface({ ...specA, origin_x: specA.x0, origin_y: specA.y0, name, kind: 'isochore' });
      setDisplayGrid(iso);
      setSelectedId(null);
      setStatus(`Isochore ${name} — review, then Publish.`);
    } catch (e) { setStatus(e.message); }
  };

  const del = async (surface) => {
    try { await backend.deleteSurface(surface); setStatus(`Deleted ${surface.name}.`); if (selectedId === surface.id) { setDisplayGrid(null); setDisplaySurface(null); } await refresh(); }
    catch (e) { setStatus(e.message); }
  };

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <MapIcon className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Mapping &amp; Surface Studio</span>
      <span className="text-[11px] text-slate-500">gridding &amp; contouring on the shared registry</span>
      {preview && (
        <button type="button" data-testid="map-publish"
          className="ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
          onClick={publish}>
          <UploadCloud className="w-3.5 h-3.5" /> Publish surface
        </button>
      )}
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="map-status" className="truncate">{status}</span>
      <span className="ml-auto whitespace-nowrap">{surfaces.length} surfaces{preview ? ' · unsaved preview' : ''}</span>
      <span className="whitespace-nowrap text-slate-600">SI internal (m)</span>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry…</div>
  ) : !displayGrid ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="map-empty">
      Grid a top from the left, or select a surface.
    </div>
  ) : (
    <div className="p-3"><MapCanvas surface={displaySurface} grid={displayGrid} wells={wells} /></div>
  );

  return (
    <WorkspaceShell
      autoSaveId="mappingsurfacestudio.workspace.v1"
      minWidth={1000}
      dockDefaultSize={20}
      ribbon={ribbon}
      explorer={(
        <SurfacesExplorer
          surfaces={surfaces}
          selectedId={selectedId}
          onSelect={selectSurface}
          onDelete={del}
          topNames={topNames}
          zoneKeys={zoneKeys}
          source={source}
          onSource={setSource}
          cellM={cellM}
          onCellM={setCellM}
          onGrid={runGrid}
          gridding={gridding}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <div className="p-2 space-y-2 text-xs" data-testid="map-controls">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Sigma className="w-3 h-3" /> Isochore (A − B)</div>
            <select className={selCls} value={isoPair.a} data-testid="map-iso-a" onChange={(e) => setIsoPair((p) => ({ ...p, a: e.target.value }))}>
              <option value="">deeper surface…</option>
              {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={selCls} value={isoPair.b} data-testid="map-iso-b" onChange={(e) => setIsoPair((p) => ({ ...p, b: e.target.value }))}>
              <option value="">shallower surface…</option>
              {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" data-testid="map-iso-run"
              className="w-full px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
              disabled={!isoPair.a || !isoPair.b || isoPair.a === isoPair.b} onClick={runIsochore}>
              Compute isochore
            </button>
            <p className="text-[10px] text-slate-600">Resamples B onto A's frame, subtracts, and previews the thickness map. Publish to save.</p>
          </div>
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
