// Mapping & Surface Studio workspace controller (G4.3) on the shared
// WorkspaceShell: surfaces explorer + gridding source on the left, the
// map canvas in the center, surface math + publish/export in the right
// dock, status bar below. Owns all state; every data touch goes
// through the injected backend so /dev/mapping-surface-studio runs the
// identical app on the in-memory backend (no auth/DB).
//
// Gridding uses the shared byte-golden engine (src/lib/gridding); the
// app glue (registry points, resample, surface math) is engine/surface.js.
//
// Depth convention (MS0, 2026-09-05): structure maps are gridded on
// TVDSS ELEVATION (negative below datum) at the borehole position
// through each well's survey and KB; every depth surface published here
// is elevation in metres (the registry convention) and is DISPLAYED in
// the user's unit (feet by default, persisted per browser).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Map as MapIcon, Loader2, UploadCloud, Sigma, Globe2,
} from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ScrollArea } from '@/components/ui/scroll-area';
import SurfacesExplorer from './SurfacesExplorer';
import MapCanvas from './MapCanvas';
import CultureImportDialog from '@/components/culture/CultureImportDialog';
import { gridSurface } from '@/lib/gridding/gridding';
import {
  topsToControlPoints, zoneAttrToPoints, specForPoints,
  resampleTo, thickness, surfaceStats,
} from '../engine/surface';
import { describeGridResult } from '../services/gridStatus';
import { toDisplay } from '@/components/wells/depthModes';
import { consensusTag } from '@/lib/crs/tags';
import { crsUnit } from '@/lib/crs';
import { placeWellsForHost } from '@/lib/crs/guards';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

export const DEPTH_UNIT_KEY = 'mapping.depthUnit';
const readDepthUnit = () => {
  try { return localStorage.getItem(DEPTH_UNIT_KEY) === 'm' ? 'm' : 'ft'; } catch { return 'ft'; }
};

/** Is this surface's z a length (depth or thickness) that follows the
 *  display unit, or a raw attribute? */
export const isLengthSurface = (s) => !!s && s.kind !== 'attribute' && s.z_domain !== 'attribute' && s.z_domain !== 'time';

export default function MappingWorkstation({ backend }) {
  const [wells, setWells] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [displayGrid, setDisplayGrid] = useState(null);   // Float32Array shown
  const [displaySurface, setDisplaySurface] = useState(null); // meta shown (saved or preview)
  const [preview, setPreview] = useState(null);           // {spec, grid, name, kind, provenance} unsaved
  const [source, setSource] = useState({ type: 'top', key: '' });
  const [depthRef, setDepthRef] = useState('tvdss');
  const [depthUnit, setDepthUnit] = useState(readDepthUnit);
  const [cellM, setCellM] = useState('150');
  const [gridding, setGridding] = useState(false);
  const [isoPair, setIsoPair] = useState({ a: '', b: '' });
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);
  const [sharingId, setSharingId] = useState(null); // share toggle in flight
  // culture / GIS layers (W1.3): geo_culture rows through the backend
  const [culture, setCulture] = useState([]);
  const [cultureTick, setCultureTick] = useState(0);
  const [visibleCultureIds, setVisibleCultureIds] = useState(new Set());
  const [cultureFeatures, setCultureFeatures] = useState(new Map());
  const [cultureImportOpen, setCultureImportOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(DEPTH_UNIT_KEY, depthUnit); } catch { /* private mode */ }
  }, [depthUnit]);

  const fmtZ = useCallback((v, s = displaySurface) => {
    if (!Number.isFinite(v)) return '—';
    return isLengthSurface(s) ? `${toDisplay(v, depthUnit).toFixed(1)} ${depthUnit}` : v.toFixed(3);
  }, [depthUnit, displaySurface]);

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

  useEffect(() => {
    let live = true;
    if (!backend.listCulture) return undefined;
    backend.listCulture()
      .then((rows) => { if (live) setCulture(rows); })
      .catch(() => { if (live) setCulture([]); });
    return () => { live = false; };
  }, [backend, cultureTick]);

  const toggleCultureLayer = async (row) => {
    if (visibleCultureIds.has(row.id)) {
      setVisibleCultureIds((set) => { const n = new Set(set); n.delete(row.id); return n; });
      return;
    }
    if (!cultureFeatures.has(row.id)) {
      try {
        const feats = await backend.downloadCultureFeatures(row);
        setCultureFeatures((m) => new Map(m).set(row.id, feats));
      } catch (e) {
        setStatus(e.message);
        return;
      }
    }
    setVisibleCultureIds((set) => new Set([...set, row.id]));
  };

  const cultureLayers = useMemo(() => culture
    .filter((c) => visibleCultureIds.has(c.id) && cultureFeatures.has(c.id))
    .map((c) => ({
      id: c.id, name: c.name, style: c.style || {}, features: cultureFeatures.get(c.id),
    })), [culture, visibleCultureIds, cultureFeatures]);

  const topNames = useMemo(() => {
    const seen = [];
    for (const w of wells || []) for (const t of w.tops || []) if (!seen.includes(t.name)) seen.push(t.name);
    return seen;
  }, [wells]);
  const zoneNames = useMemo(() => {
    const seen = [];
    for (const w of wells || []) for (const z of w.zones || []) if (z.name && !seen.includes(z.name)) seen.push(z.name);
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
      let result;
      let name;
      let kind;
      if (source.type === 'top') {
        result = topsToControlPoints(wells, source.key, { depthRef, placement: 'borehole' });
        name = `${source.key} structure`;
        kind = 'structure';
      } else {
        const zoneName = source.zoneName || zoneNames[0];
        result = { points: zoneAttrToPoints(wells, zoneName, source.key), skipped: [], extrapolated: 0, depthRef: null };
        name = `${source.key} attribute`;
        kind = 'attribute';
      }
      const { points } = result;
      if (points.length < 3) throw new Error('Need at least 3 control points — this source has too few wells.');
      const spec = specForPoints(points, cell, 2);
      if (spec.nx * spec.ny > 4_000_000) throw new Error('Grid too large — increase the cell size.');
      // Fill the whole convex hull of the control points: the engine's
      // default extrapolation limit (2 cells) is a seismic-pick-density
      // setting and leaves a well-spaced map in patches. A distance
      // control belongs to the MS3 gridding form.
      const g = gridSurface(points, spec, { maxExtrapolation: 1e9 });
      // The map inherits its CRS from the wells it was gridded from:
      // any disagreement or unknown well leaves the map unverified
      // (null tag, amber badge) instead of guessing.
      const contributing = (wells || []).filter((w) => points.some((p) => p.well === w.name));
      const crs = consensusTag(contributing.map((w) => w.crs));
      const zDomain = kind === 'attribute' ? 'attribute' : 'depth';
      setPreview({
        spec, grid: g.z, name, kind, crs, zDomain,
        provenance: {
          source, engine: 'mapping-surface-studio', cell_m: cell,
          control_points: points.length,
          depth_ref: result.depthRef, placement: kind === 'structure' ? 'borehole' : null,
          skipped: result.skipped, extrapolated: result.extrapolated,
          z_convention: kind === 'structure' ? 'elevation' : 'raw',
        },
      });
      setDisplaySurface({ origin_x: spec.x0, origin_y: spec.y0, nx: spec.nx, ny: spec.ny, dx: spec.dx, dy: spec.dy, name, kind, z_domain: zDomain, crs });
      setDisplayGrid(g.z);
      setSelectedId(null);
      setStatus(describeGridResult({ name, result, spec, depthUnit }));
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
      setStatus(`${s.name}: ${st.count} live nodes, z ${fmtZ(st.min, s)} to ${fmtZ(st.max, s)}.`);
    } catch (e) { setStatus(e.message); }
  };

  const publish = async () => {
    if (!preview) return;
    try {
      const saved = await backend.saveSurface({
        name: preview.name, kind: preview.kind, spec: preview.spec,
        zDomain: preview.zDomain || (preview.kind === 'attribute' ? 'attribute' : 'depth'),
        zUnit: preview.kind === 'attribute' ? null : 'm',
        crs: preview.crs || null,
        xyUnit: preview.crs ? crsUnit(preview.crs) : null,
        crsProvenance: preview.crs
          ? { derived_from: preview.provenance?.thickness ? 'surfaces' : 'wells' }
          : null,
        provenance: preview.provenance, grid: preview.grid,
      });
      setStatus(`Published ${saved.name} to the registry.`);
      setPreview(null);
      await refresh();
      setSelectedId(saved.id);
    } catch (e) { setStatus(e.message); }
  };

  const runThickness = async () => {
    const top = surfaces.find((s) => s.id === isoPair.a);
    const base = surfaces.find((s) => s.id === isoPair.b);
    if (!top || !base) { setStatus('Pick a top and a base surface for the isochore.'); return; }
    try {
      const [gt, gb] = await Promise.all([backend.downloadSurfaceGrid(top), backend.downloadSurfaceGrid(base)]);
      const specT = { x0: top.origin_x, y0: top.origin_y, dx: top.dx, dy: top.dy, nx: top.nx, ny: top.ny };
      const specB = { x0: base.origin_x, y0: base.origin_y, dx: base.dx, dy: base.dy, nx: base.nx, ny: base.ny };
      const gbOnT = resampleTo(gb, specB, specT);
      const iso = thickness(gt, gbOnT); // elevation top − elevation base, positive when the base is deeper
      const name = `${top.name} to ${base.name} isochore`;
      setPreview({
        spec: specT, grid: iso, name, kind: 'isochore', zDomain: 'depth',
        crs: consensusTag([top.crs, base.crs]),
        provenance: { thickness: { top: top.id, base: base.id }, engine: 'mapping-surface-studio', z_convention: 'thickness' },
      });
      setDisplaySurface({ ...specT, origin_x: specT.x0, origin_y: specT.y0, name, kind: 'isochore', z_domain: 'depth' });
      setDisplayGrid(iso);
      setSelectedId(null);
      setStatus(`Isochore ${name} (${depthUnit}): review, then Publish.`);
    } catch (e) { setStatus(e.message); }
  };

  const del = async (surface) => {
    try { await backend.deleteSurface(surface); setStatus(`Deleted ${surface.name}.`); if (selectedId === surface.id) { setDisplayGrid(null); setDisplaySurface(null); } await refresh(); }
    catch (e) { setStatus(e.message); }
  };

  const toggleShare = async (surface) => {
    setSharingId(surface.id);
    try {
      const updated = await backend.setSurfaceShared(surface, !surface.organization_id);
      setStatus(updated.organization_id
        ? `Shared ${surface.name} with your organization (read-only for members).`
        : `${surface.name} is private again.`);
      await refresh();
    } catch (e) {
      setStatus(e.message);
    } finally {
      setSharingId(null);
    }
  };

  const ribbon = (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <ModuleHomeLink module="geoscience" />
      <MapIcon className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Mapping &amp; Surface Studio</span>
      <span className="text-[11px] text-slate-500">gridding &amp; contouring on the shared registry</span>
      <button type="button" data-testid="map-depth-unit"
        className="ml-2 px-2 py-0.5 text-[11px] rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
        title="Depth display unit (feet or metres). Surfaces are stored in metres."
        onClick={() => setDepthUnit((u) => (u === 'ft' ? 'm' : 'ft'))}>
        depth: {depthUnit}
      </button>
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
      <span className="whitespace-nowrap text-slate-600" data-testid="map-status-unit">depth: {depthUnit} · elevation, negative down</span>
    </div>
  );

  // CRS guard: wells convert into the displayed surface's frame when
  // both tags are known; local-grid wells drop from a georeferenced
  // map. Unknown tags render as before (legacy behavior).
  const displayWells = useMemo(() => {
    if (!wells || !displaySurface || displaySurface.crs === undefined) return wells;
    const r = placeWellsForHost(
      wells.map((w) => ({ ...w, surfaceX: w.surface_x, surfaceY: w.surface_y })),
      displaySurface.crs,
    );
    return r.wells.map((w) => ({ ...w, surface_x: w.surfaceX, surface_y: w.surfaceY }));
  }, [wells, displaySurface]);

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry…</div>
  ) : !displayGrid ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="map-empty">
      Grid a top from the left, or select a surface.
    </div>
  ) : (
    <div className="p-3">
      <MapCanvas
        surface={displaySurface}
        grid={displayGrid}
        wells={displayWells}
        cultureLayers={cultureLayers}
        display={{ unit: depthUnit, isLength: isLengthSurface(displaySurface) }}
      />
    </div>
  );

  return (
    <>
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
          onToggleShare={toggleShare}
          sharingId={sharingId}
          topNames={topNames}
          zoneNames={zoneNames}
          zoneKeys={zoneKeys}
          source={source}
          onSource={setSource}
          depthRef={depthRef}
          onDepthRef={setDepthRef}
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
            <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Sigma className="w-3 h-3" /> Isochore (top to base)</div>
            <select className={selCls} value={isoPair.a} data-testid="map-iso-a" onChange={(e) => setIsoPair((p) => ({ ...p, a: e.target.value }))}>
              <option value="">top surface (shallower)…</option>
              {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={selCls} value={isoPair.b} data-testid="map-iso-b" onChange={(e) => setIsoPair((p) => ({ ...p, b: e.target.value }))}>
              <option value="">base surface (deeper)…</option>
              {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" data-testid="map-iso-run"
              className="w-full px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
              disabled={!isoPair.a || !isoPair.b || isoPair.a === isoPair.b} onClick={runThickness}>
              Compute isochore
            </button>
            <p className="text-[10px] text-slate-600">Resamples the base onto the top's frame and subtracts the elevations, so the thickness is positive where the base is deeper. Publish to save.</p>

            <div className="pt-2 border-t border-slate-800/60">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-1">
                <Globe2 className="w-3 h-3" /> Culture layers
              </div>
              {culture.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 py-0.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleCultureIds.has(c.id)}
                    onChange={() => toggleCultureLayer(c)}
                  />
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ background: c.style?.color || '#f59e0b' }}
                  />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-slate-600">{c.feature_count}</span>
                </label>
              ))}
              {!culture.length && (
                <p className="text-[10px] text-slate-600">
                  No culture layers yet (license blocks, outlines, pipelines).
                </p>
              )}
              {backend.canImportCulture && (
                <button
                  type="button"
                  data-testid="map-culture-import"
                  className="mt-1 w-full px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => setCultureImportOpen(true)}
                >
                  Import GeoJSON / shapefile…
                </button>
              )}
            </div>
          </div>
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
      />
      <CultureImportDialog
        open={cultureImportOpen}
        onOpenChange={setCultureImportOpen}
        onImported={() => setCultureTick((k) => k + 1)}
      />
    </>
  );
}
