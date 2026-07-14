// Earth Modeling workspace controller (G8.2) on the shared
// WorkspaceShell: model explorer left, map / section / QC views in the
// center, the model builder in the right dock, status bar below. Owns
// all state; every data touch goes through the injected backend so
// /dev/earth-modeling runs the identical app on the in-memory backend
// (no auth/DB). Build is explicit (the Build button) — the definition
// is cheap state, the computed model is derived, deterministic, and
// recomputed on demand (plan decision 2).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mountain, Loader2, Hammer, UploadCloud, Map as MapIcon, Rows, ClipboardCheck } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModelExplorer from './ModelExplorer';
import BuilderDock from './BuilderDock';
import MapView from './MapView';
import SectionView from './SectionView';
import QcPanel from './QcPanel';
import { buildModel, emptyDefinition } from '../services/modelBuild';
import { validatePolygon } from '../engine/blocks';
import { surfaceStats } from '@/lib/gridding/gridmath';

const selCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';
const viewBtn = (active) =>
  `flex items-center gap-1 px-2 py-1 text-xs rounded border ${active
    ? 'border-cyan-600 text-cyan-300 bg-cyan-500/10'
    : 'border-slate-700 text-slate-400 hover:bg-slate-700/30'}`;

const LAYERS = [
  { key: 'top', label: 'Zone top (depth)' },
  { key: 'base', label: 'Zone base (depth)' },
  { key: 'thickness', label: 'Thickness (isochore)' },
  { key: 'phi', label: 'Porosity' },
  { key: 'sw', label: 'Sw' },
  { key: 'ntg', label: 'NTG' },
  { key: 'blocks', label: 'Fault blocks' },
];

export default function EarthWorkstation({ backend }) {
  const [wells, setWells] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [definition, setDefinition] = useState(emptyDefinition);
  const [built, setBuilt] = useState(null);
  const [building, setBuilding] = useState(false);
  const [view, setView] = useState('map');
  const [zoneIdx, setZoneIdx] = useState(0);
  const [layer, setLayer] = useState('top');
  const [drawing, setDrawing] = useState(false);
  const [pending, setPending] = useState([]);
  const [sectionWells, setSectionWells] = useState({ a: '', b: '' });
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);

  const refreshSurfaces = useCallback(async () => {
    try { setSurfaces(await backend.listSurfaces()); } catch (e) { setStatus(e.message); }
  }, [backend]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [w, s, p] = await Promise.all([
          backend.listWells(),
          backend.listSurfaces(),
          backend.listProjects().catch(() => []),
        ]);
        if (!live) return;
        setWells(w);
        setSurfaces(s);
        setProjects(p);
        if (w.length >= 2) setSectionWells({ a: w[0].id, b: w[1].id });
      } catch (e) { if (live) { setStatus(e.message); setWells([]); } }
    })();
    return () => { live = false; };
  }, [backend]);

  const topNames = useMemo(() => {
    const seen = [];
    for (const w of wells || []) for (const t of w.tops || []) if (!seen.includes(t.name)) seen.push(t.name);
    return seen;
  }, [wells]);
  const zoneNames = useMemo(() => {
    const seen = [];
    for (const w of wells || []) for (const z of w.zones || []) if (!seen.includes(z.name)) seen.push(z.name);
    return seen;
  }, [wells]);

  /** Keep topNames/zones arrays consistent with the stack; auto-match
   *  tie tops by name and default registry zones in order. */
  const normalizeDefinition = useCallback((def) => {
    const k = def.surfaceIds.length;
    const tn = def.surfaceIds.map((id, i) => {
      if (def.topNames[i]) return def.topNames[i];
      const s = surfaces.find((x) => x.id === id);
      return s && topNames.includes(s.name) ? s.name : '';
    });
    const zones = Array.from({ length: Math.max(0, k - 1) }, (_, i) =>
      def.zones[i] || { name: `Zone ${i + 1}`, registryZone: zoneNames[i] || '' });
    return { ...def, topNames: tn, zones };
  }, [surfaces, topNames, zoneNames]);

  const setDef = useCallback((def) => {
    setDefinition(normalizeDefinition(def));
    setBuilt(null);
  }, [normalizeDefinition]);

  const addSurface = (id) => setDef({ ...definition, surfaceIds: [...definition.surfaceIds, id] });
  const removeSurface = (id) => {
    const i = definition.surfaceIds.indexOf(id);
    const surfaceIds = definition.surfaceIds.filter((x) => x !== id);
    const topNamesNext = definition.topNames.filter((_, ti) => ti !== i);
    setDef({ ...definition, surfaceIds, topNames: topNamesNext });
  };
  const moveSurface = (i, dir) => {
    const surfaceIds = [...definition.surfaceIds];
    const tn = [...definition.topNames];
    const j = i + dir;
    [surfaceIds[i], surfaceIds[j]] = [surfaceIds[j], surfaceIds[i]];
    [tn[i], tn[j]] = [tn[j], tn[i]];
    setDef({ ...definition, surfaceIds, topNames: tn });
  };

  const build = async () => {
    setBuilding(true);
    try {
      const result = await buildModel(definition, wells, surfaces, backend);
      setBuilt(result);
      setZoneIdx(0);
      const blocks = Object.keys(result.census).length;
      const clamps = result.counts.reduce((a, b) => a + b, 0);
      setStatus(`Built ${definition.name}: ${result.spec.nx}×${result.spec.ny} frame, ${result.zones.length} zones, ${blocks} block${blocks > 1 ? 's' : ''}, ${clamps} clamped nodes.`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBuilding(false);
    }
  };

  const mapGrid = useMemo(() => {
    if (!built) return null;
    if (layer === 'blocks') return built.labels ? Float64Array.from(built.labels) : null;
    if (layer === 'top') return built.clamped[zoneIdx] || null;
    if (layer === 'base') return built.clamped[zoneIdx + 1] || null;
    if (layer === 'thickness') return built.thickness[zoneIdx] || null;
    return built.zones[zoneIdx]?.props?.[layer] || null;
  }, [built, layer, zoneIdx]);

  const surfaceNames = definition.surfaceIds
    .map((id) => surfaces.find((s) => s.id === id)?.name || '?');
  const zoneName = built?.zones?.[zoneIdx]?.name || definition.zones[zoneIdx]?.name || '';
  const layerLabel = LAYERS.find((l) => l.key === layer)?.label || layer;

  const publish = async () => {
    if (!built || !mapGrid || layer === 'blocks') return;
    try {
      const kind = layer === 'thickness' ? 'isochore'
        : (layer === 'top' || layer === 'base') ? 'structure' : 'attribute';
      const name = `${definition.name} · ${zoneName} ${layer}`;
      const saved = await backend.saveSurface({
        name,
        kind,
        spec: built.spec,
        zDomain: kind === 'attribute' ? 'attribute' : 'depth',
        zUnit: kind === 'attribute' ? null : 'm',
        provenance: {
          engine: 'earth-modeling',
          model: definition.name,
          zone: zoneName,
          layer,
          methods: definition.methods,
        },
        grid: Float32Array.from(mapGrid),
      });
      setStatus(`Published ${saved.name} to the registry — ReservoirCalc Pro can import it now.`);
      await refreshSurfaces();
    } catch (e) { setStatus(e.message); }
  };

  const startDraw = () => {
    if (!built) { setStatus('Build the model first — the map is the drawing surface.'); return; }
    setView('map');
    setDrawing(true);
    setPending([]);
  };
  const finishDraw = () => {
    try {
      validatePolygon(pending);
      const faultPolygons = [...(definition.faultPolygons || []),
        { name: `Fault ${(definition.faultPolygons || []).length + 1}`, vertices: pending }];
      setDrawing(false);
      setPending([]);
      setDef({ ...definition, faultPolygons });
      setStatus('Fault polygon added — rebuild to apply blocks.');
    } catch (e) { setStatus(e.message); }
  };
  const cancelDraw = () => { setDrawing(false); setPending([]); };
  const deletePolygon = (i) => {
    setDef({ ...definition, faultPolygons: definition.faultPolygons.filter((_, pi) => pi !== i) });
  };

  const saveProject = async () => {
    try {
      const saved = await backend.saveProject({ name: definition.name, definition });
      setProjects(await backend.listProjects());
      setStatus(`Saved model "${saved.name}".`);
    } catch (e) { setStatus(e.message); }
  };
  const loadProject = (p) => {
    setDefinition(normalizeDefinition(p.definition));
    setBuilt(null);
    setStatus(`Loaded model "${p.name}" — Build to compute.`);
  };

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <Mountain className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Earth Modeling</span>
      <span className="text-[11px] text-slate-500">layer-cake framework on the shared registry</span>
      <div className="ml-4 flex items-center gap-1">
        <button type="button" data-testid="em-view-map" className={viewBtn(view === 'map')} onClick={() => setView('map')}>
          <MapIcon className="w-3.5 h-3.5" /> Map
        </button>
        <button type="button" data-testid="em-view-section" className={viewBtn(view === 'section')} onClick={() => setView('section')}>
          <Rows className="w-3.5 h-3.5" /> Section
        </button>
        <button type="button" data-testid="em-view-qc" className={viewBtn(view === 'qc')} onClick={() => setView('qc')}>
          <ClipboardCheck className="w-3.5 h-3.5" /> QC &amp; volumes
        </button>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" data-testid="em-build"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
          disabled={building || definition.surfaceIds.length < 2} onClick={build}>
          {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />} Build model
        </button>
        <button type="button" data-testid="em-publish"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
          disabled={!built || !mapGrid || layer === 'blocks'} onClick={publish}>
          <UploadCloud className="w-3.5 h-3.5" /> Publish layer
        </button>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="em-status" className="truncate">{status}</span>
      <span className="ml-auto whitespace-nowrap" data-testid="em-frame">
        {built ? `${built.spec.nx}×${built.spec.ny} @ ${built.spec.dx} m` : `${definition.surfaceIds.length} surfaces stacked`}
      </span>
      <span className="whitespace-nowrap text-slate-600">TVDSS m, SI internal</span>
    </div>
  );

  const mapToolbar = built && (
    <div className="flex items-center gap-2 mb-2">
      <select className={selCls} data-testid="em-map-zone" value={zoneIdx}
        onChange={(e) => setZoneIdx(Number(e.target.value))}>
        {built.zones.map((z, i) => <option key={z.name} value={i}>{z.name}</option>)}
      </select>
      <select className={selCls} data-testid="em-map-layer" value={layer} onChange={(e) => setLayer(e.target.value)}>
        {LAYERS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
      </select>
      {layer === 'blocks' && !built.labels && <span className="text-[11px] text-slate-500">no fault polygons — single block</span>}
    </div>
  );

  const wellById = (id) => (wells || []).find((w) => w.id === id);
  const sectionToolbar = (
    <div className="flex items-center gap-2 mb-2">
      <select className={selCls} data-testid="em-sec-a" value={sectionWells.a}
        onChange={(e) => setSectionWells((p) => ({ ...p, a: e.target.value }))}>
        {(wells || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <span className="text-[11px] text-slate-500">→</span>
      <select className={selCls} data-testid="em-sec-b" value={sectionWells.b}
        onChange={(e) => setSectionWells((p) => ({ ...p, b: e.target.value }))}>
        {(wells || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry…
    </div>
  ) : view === 'qc' ? (
    <QcPanel built={built} surfaceNames={surfaceNames} />
  ) : view === 'section' ? (
    <div className="p-3">
      {sectionToolbar}
      <SectionView
        spec={built?.spec}
        clamped={built?.clamped || []}
        surfaceNames={surfaceNames}
        zoneNames={(built?.zones || []).map((z) => z.name)}
        wellA={wellById(sectionWells.a)}
        wellB={wellById(sectionWells.b)}
        ties={built?.ties || []}
      />
    </div>
  ) : !built ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="em-empty">
      Stack ≥ 2 registry surfaces (explorer), then Build model.
    </div>
  ) : (
    <div className="p-3">
      {mapToolbar}
      <MapView
        spec={built.spec}
        grid={mapGrid}
        wells={wells}
        polygons={definition.faultPolygons || []}
        pendingVertices={pending}
        drawing={drawing}
        onMapClick={({ x, y }) => setPending((p) => [...p, [x, y]])}
        contours={layer !== 'blocks'}
        label={`${zoneName} — ${layerLabel}`}
      />
    </div>
  );

  return (
    <WorkspaceShell
      autoSaveId="earthmodeling.workspace.v1"
      minWidth={1050}
      dockDefaultSize={24}
      ribbon={ribbon}
      explorer={(
        <ModelExplorer
          surfaces={surfaces}
          wells={wells || []}
          definition={definition}
          onAddSurface={addSurface}
          onRemoveSurface={removeSurface}
          onMoveSurface={moveSurface}
          onDeletePolygon={deletePolygon}
        />
      )}
      center={center}
      dock={(
        <BuilderDock
          definition={definition}
          onDefinition={setDef}
          surfaces={surfaces}
          topNames={topNames}
          zoneNames={zoneNames}
          drawing={drawing}
          pendingCount={pending.length}
          onStartDraw={startDraw}
          onFinishDraw={finishDraw}
          onCancelDraw={cancelDraw}
          projects={projects}
          onSaveProject={saveProject}
          onLoadProject={loadProject}
        />
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
