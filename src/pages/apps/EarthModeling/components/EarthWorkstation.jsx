// Earth Modeling workspace controller (G8.2) on the shared
// WorkspaceShell: model explorer left, map / section / QC views in the
// center, the model builder in the right dock, status bar below. Owns
// all state; every data touch goes through the injected backend so
// /dev/earth-modeling runs the identical app on the in-memory backend
// (no auth/DB). Build is explicit (the Build button) — the definition
// is cheap state, the computed model is derived, deterministic, and
// recomputed on demand (plan decision 2).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Mountain, Loader2, Hammer, UploadCloud, Map as MapIcon, Rows, ClipboardCheck, ImageDown, Route, FileDown, ExternalLink, HelpCircle } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import ModelExplorer from './ModelExplorer';
import BuilderDock from './BuilderDock';
import MapView from './MapView';
import SectionView from './SectionView';
import QcPanel from './QcPanel';
import { buildModel, emptyDefinition } from '../services/modelBuild';
import { DEPTH_UNIT_KEY, VOLUME_UNITS_KEY, VOLUME_UNIT_SETS, readSetting, fmtDepth } from '../services/units';
import { allSurfaceRows, makeDerivedEntry, describeDerived } from '../services/derivedSurfaces';
import { projectWells, VE_OPTIONS } from '../services/sectionPath';
import { minCurvature, positionAtMd } from '../engine/wellties';
import { useWellCurvesCache } from '@/components/wells/useWellCurvesCache';
import { downloadBlob } from '@/components/maps/mapPng';
import { volumesCsv } from '../services/volumesCsv';
import { appPath, mapSurfaceHref, reservoirCalcSurfaceHref, MAPPING_ID, RESERVOIRCALC_ID, EARTH_MODELING_ID } from '@/components/wells/appLinks';
import { toDisplay } from '@/components/wells/depthModes';
import { validatePolygon } from '../engine/blocks';
import { surfaceStats } from '@/lib/gridding/gridmath';
import { depthDownToSurfaceZ } from '@/lib/surfaceConvention';

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
  { key: 'phi_var', label: 'Porosity kriging variance' },
  { key: 'sw_var', label: 'Sw kriging variance' },
  { key: 'ntg_var', label: 'NTG kriging variance' },
  { key: 'blocks', label: 'Fault blocks' },
];

/** @param {Object<string,string>} [p.appPaths] route overrides for the launchers (harness) */
export default function EarthWorkstation({ backend, appPaths = {} }) {
  const [wells, setWells] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const [culturePolygons, setCulturePolygons] = useState([]);
  const [projects, setProjects] = useState([]);
  const [definition, setDefinition] = useState(emptyDefinition);
  const [built, setBuilt] = useState(null);
  const [building, setBuilding] = useState(false);
  const [view, setView] = useState('map');
  const [zoneIdx, setZoneIdx] = useState(0);
  const [layer, setLayer] = useState('top');
  const [drawing, setDrawing] = useState(false);
  const [searchParams] = useSearchParams();
  const deepLinkRef = useRef({ surface: searchParams.get('surface'), done: false });
  const [pending, setPending] = useState([]);
  const [sectionWells, setSectionWells] = useState({ a: '', b: '' });
  // EM3 section window: a polyline drawn on the map (or the well pair),
  // vertical exaggeration, projection distance, and GR curves per well
  const [sectionPath, setSectionPath] = useState(null);       // [[x, y], ...] world
  const [sectionDrawing, setSectionDrawing] = useState(false);
  const [sectionPending, setSectionPending] = useState([]);
  const [ve, setVe] = useState(2);
  const [wellCurves, setWellCurves] = useState({});           // wellId -> {tvdss, values} | null
  const sectionRef = useRef(null);
  const [lastPublished, setLastPublished] = useState(null); // EM5: the row the launchers point at
  const curvesCache = useWellCurvesCache(backend);
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);
  // EM0: display units. Depth follows the account's Geoscience depth
  // unit (the Mapping setting) once known, browser fallback, ft default;
  // volumes are a display choice of this app
  const [depthUnit, setDepthUnit] = useState(() => readSetting(DEPTH_UNIT_KEY, ['m', 'ft'], 'ft'));
  const [volumeUnits, setVolumeUnits] = useState(() => readSetting(VOLUME_UNITS_KEY, Object.keys(VOLUME_UNIT_SETS), 'metric'));
  const [boundaries, setBoundaries] = useState([]);
  useEffect(() => { try { localStorage.setItem(DEPTH_UNIT_KEY, depthUnit); } catch { /* private mode */ } }, [depthUnit]);
  useEffect(() => { try { localStorage.setItem(VOLUME_UNITS_KEY, volumeUnits); } catch { /* private mode */ } }, [volumeUnits]);
  useEffect(() => {
    let live = true;
    if (backend.getDepthUnit) backend.getDepthUnit().then((u) => { if (live && (u === 'm' || u === 'ft')) setDepthUnit(u); }).catch(() => {});
    if (backend.listBoundaries) backend.listBoundaries().then((b) => { if (live) setBoundaries(b); }).catch(() => {});
    return () => { live = false; };
  }, [backend]);
  const changeDepthUnit = (u) => {
    setDepthUnit(u);
    if (backend.setDepthUnit) backend.setDepthUnit(u).catch((e) => setStatus(e.message));
  };

  const refreshSurfaces = useCallback(async () => {
    try { setSurfaces(await backend.listSurfaces()); } catch (e) { setStatus(e.message); }
  }, [backend]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [w, s, p, cp] = await Promise.all([
          backend.listWells(),
          backend.listSurfaces(),
          backend.listProjects().catch(() => []),
          backend.listFaultPolygons ? backend.listFaultPolygons().catch(() => []) : Promise.resolve([]),
        ]);
        if (!live) return;
        setWells(w);
        setSurfaces(s);
        setProjects(p);
        setCulturePolygons(cp);
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
  // EM2: registry surfaces plus the definition's derived horizons, the
  // list every stack lookup uses
  const rows = useMemo(() => allSurfaceRows(surfaces, definition), [surfaces, definition]);
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
      const s = allSurfaceRows(surfaces, def).find((x) => x.id === id);
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

  // ?surface=<id> (Mapping's "Open in Earth Modeling", MS4): stack it once
  // the registry list is in
  useEffect(() => {
    const dl = deepLinkRef.current;
    if (dl.done || !dl.surface || !wells) return;
    dl.done = true;
    const hit = surfaces.find((x) => x.id === dl.surface);
    if (!hit) { setStatus('The linked surface is not in your registry.'); return; }
    if (!definition.surfaceIds.includes(hit.id)) setDef({ ...definition, surfaceIds: [...definition.surfaceIds, hit.id] });
    setStatus(`Added ${hit.name} from the link. Stack a second surface, then Build model.`);
  }, [wells, surfaces, definition, setDef]);
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
      const adj = result.adjustment;
      const adjText = adj ? (() => {
        const rows = adj.report.filter((r) => r.adjusted);
        const before = Math.max(0, ...rows.map((r) => r.before ?? 0));
        const after = Math.max(0, ...rows.map((r) => r.after ?? 0));
        return rows.length ? `, ${rows.length} surface${rows.length === 1 ? '' : 's'} adjusted to the wells (max residual ${fmtDepth(before, depthUnit, 1)} to ${fmtDepth(after, depthUnit, 1)} ${depthUnit})` : ', no tied surface to adjust';
      })() : '';
      setStatus(`Built ${definition.name}: ${result.spec.nx}×${result.spec.ny} frame at ${result.spec.dx} m, ${result.zones.length} zones, ${blocks} block${blocks > 1 ? 's' : ''}, ${clamps} clamped nodes${result.boundary ? `, clipped to ${result.boundary.name}` : ''}${adjText}.`);
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
    if (layer.endsWith('_var')) return built.zones[zoneIdx]?.variance?.[layer.slice(0, -4)] || null;
    return built.zones[zoneIdx]?.props?.[layer] || null;
  }, [built, layer, zoneIdx]);

  const surfaceNames = definition.surfaceIds
    .map((id) => rows.find((s) => s.id === id)?.name || '?');
  // EM2: derived horizons
  const addDerived = (form) => {
    try {
      const entry = makeDerivedEntry(form, rows, depthUnit);
      setDef({ ...definition, derived: [...(definition.derived || []), entry], surfaceIds: [...definition.surfaceIds, entry.id] });
      setStatus(`Added derived horizon ${entry.name} (${describeDerived(entry, rows, depthUnit)}) to the stack. Order it, then Build.`);
    } catch (e) { setStatus(e.message); }
  };
  const removeDerived = (id) => {
    const i = definition.surfaceIds.indexOf(id);
    setDef({
      ...definition,
      derived: (definition.derived || []).filter((d) => d.id !== id),
      surfaceIds: definition.surfaceIds.filter((x) => x !== id),
      topNames: i >= 0 ? definition.topNames.filter((_, ti) => ti !== i) : definition.topNames,
    });
  };
  const zoneName = built?.zones?.[zoneIdx]?.name || definition.zones[zoneIdx]?.name || '';
  const layerLabel = LAYERS.find((l) => l.key === layer)?.label || layer;

  const publish = async () => {
    if (!built || !mapGrid || layer === 'blocks') return;
    try {
      const kind = layer === 'thickness' ? 'isochore'
        : (layer === 'top' || layer === 'base') ? 'structure' : 'attribute';
      const name = `${definition.name} · ${zoneName} ${layer.endsWith('_var') ? `${layer.slice(0, -4)} variance` : layer}`;
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
        // structure layers leave as registry elevation (negative below
        // datum, metres); thickness and attributes are raw
        grid: kind === 'structure' ? depthDownToSurfaceZ(mapGrid) : Float32Array.from(mapGrid),
      });
      setLastPublished(saved);
      setStatus(`Published ${saved.name} to the registry. Open it in ReservoirCalc Pro or Mapping from the ribbon.`);
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
  // a fault polygon drawn in Mapping & Surface Studio (geo_culture, MS5)
  // joins the model's own list; the culture id is kept so it is not
  // added twice and the provenance survives a save
  const addCulturePolygon = (cp) => {
    if ((definition.faultPolygons || []).some((p) => p.cultureId === cp.id)) { setStatus(`${cp.name} is already in the model.`); return; }
    try {
      validatePolygon(cp.vertices);
      const faultPolygons = [...(definition.faultPolygons || []), { name: cp.name, vertices: cp.vertices.map(([x, y]) => [x, y]), cultureId: cp.id, source: 'geo_culture' }];
      setDef({ ...definition, faultPolygons });
      setStatus(`Added fault polygon ${cp.name} from Mapping & Surface Studio. Rebuild to apply blocks.`);
    } catch (e) { setStatus(e.message); }
  };

  const saveProject = async () => {
    try {
      const saved = await backend.saveProject({
        name: definition.name,
        definition,
        crs: built?.crs || null,
      });
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
      <ModuleHomeLink module="geoscience" />
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
        <button type="button" data-testid="em-depth-unit"
          className="px-2 py-1 text-[11px] rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          title="Depth display unit (feet or metres), the account's Geoscience setting. The model computes in metres."
          onClick={() => changeDepthUnit(depthUnit === 'ft' ? 'm' : 'ft')}>
          depth: {depthUnit}
        </button>
        <select className={selCls} data-testid="em-volume-units" value={volumeUnits} title="Volume display units"
          onChange={(e) => setVolumeUnits(e.target.value)}>
          {Object.values(VOLUME_UNIT_SETS).map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
        </select>
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
        <button type="button" data-testid="em-volumes-csv" title="Download the volume tables as CSV in the chosen units"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          disabled={!built} onClick={() => exportVolumesCsv()}>
          <FileDown className="w-3.5 h-3.5" /> Volumes CSV
        </button>
        {lastPublished && (
          <>
            <Link to={reservoirCalcSurfaceHref(lastPublished.id, appPath(RESERVOIRCALC_ID, appPaths))} data-testid="em-open-rcp"
              title={`Open ReservoirCalc Pro's Surface import on ${lastPublished.name}`}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-amber-700/60 text-amber-300 hover:bg-amber-500/10">
              <ExternalLink className="w-3.5 h-3.5" /> Open in ReservoirCalc Pro
            </Link>
            <Link to={mapSurfaceHref(lastPublished.id, appPath(MAPPING_ID, appPaths))} data-testid="em-open-mapping"
              title={`Open ${lastPublished.name} in Mapping & Surface Studio`}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10">
              <MapIcon className="w-3.5 h-3.5" /> Open in Mapping
            </Link>
          </>
        )}
        <Link to={`${appPath(EARTH_MODELING_ID, appPaths)}/help`} data-testid="em-help" title="Open the Earth Modeling help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800">
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="em-status" className="truncate">{status}</span>
      <span className="ml-auto whitespace-nowrap" data-testid="em-frame">
        {built ? `${built.spec.nx}×${built.spec.ny} @ ${built.spec.dx} m` : `${definition.surfaceIds.length} surfaces stacked`}
      </span>
      <span className="whitespace-nowrap text-slate-600">TVDSS {depthUnit}, SI internal</span>
    </div>
  );

  const mapToolbar = built && (
    <div className="flex items-center gap-2 mb-2">
      {sectionDrawing && (
        <>
          <span className="text-[11px] text-cyan-300" data-testid="em-sec-pending">{sectionPending.length} section vertices</span>
          <button type="button" data-testid="em-sec-finish" className={viewBtn(true)} disabled={sectionPending.length < 2} onClick={() => finishSection()}>Finish section line</button>
          <button type="button" data-testid="em-sec-cancel" className={viewBtn(false)} onClick={() => cancelSection()}>Cancel</button>
        </>
      )}
      <select className={selCls} data-testid="em-map-zone" value={zoneIdx}
        onChange={(e) => setZoneIdx(Number(e.target.value))}>
        {built.zones.map((z, i) => <option key={z.name} value={i}>{z.name}</option>)}
      </select>
      <select className={selCls} data-testid="em-map-layer" value={layer} onChange={(e) => setLayer(e.target.value)}>
        {LAYERS.filter((l) => !l.key.endsWith('_var') || built.zones[zoneIdx]?.variance?.[l.key.slice(0, -4)]).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
      </select>
      {layer === 'blocks' && !built.labels && <span className="text-[11px] text-slate-500">no fault polygons — single block</span>}
      {layer.endsWith('_var') && <span className="text-[11px] text-slate-500" data-testid="em-map-variance-note">low near the wells, high where the property is guessed</span>}
    </div>
  );

  const wellById = (id) => (wells || []).find((w) => w.id === id);
  const sectionVertices = useMemo(() => {
    if (sectionPath && sectionPath.length >= 2) return sectionPath;
    const a = wellById(sectionWells.a); const b = wellById(sectionWells.b);
    if (a && b && a.id !== b.id && Number.isFinite(a.surface_x) && Number.isFinite(b.surface_x)) return [[a.surface_x, a.surface_y], [b.surface_x, b.surface_y]];
    return null;
  }, [sectionPath, sectionWells, wells]); // eslint-disable-line react-hooks/exhaustive-deps
  const projectionM = built ? 2 * Math.max(built.spec.dx, built.spec.dy) : 100;
  const projected = useMemo(() => {
    if (!sectionVertices || !built) return [];
    return projectWells(wells || [], sectionVertices, projectionM).map((p) => {
      const traj = minCurvature(p.well.deviation || [], p.well.kb_m || 0, p.well.surface_x, p.well.surface_y);
      const tops = (p.well.tops || []).map((t) => {
        const tie = built.ties.find((r) => r.well === p.well.name && r.top === t.name);
        return { name: t.name, tvdss: positionAtMd(traj, t.md_m).tvdss, residualM: tie?.residualM ?? null };
      });
      const c = wellCurves[p.well.id];
      let gr = null;
      if (c?.GR && c?.DEPT) {
        const tvdss = new Float64Array(c.DEPT.length);
        for (let i = 0; i < c.DEPT.length; i++) tvdss[i] = positionAtMd(traj, c.DEPT[i]).tvdss;
        gr = { tvdss, values: c.GR };
      }
      return { ...p, tops, gr };
    });
  }, [sectionVertices, built, wells, wellCurves, projectionM]);
  // load GR (and DEPT) for the wells on the section once
  useEffect(() => {
    if (!backend.listLogs) return;
    for (const p of projected) {
      const id = p.well.id;
      if (id in wellCurves) continue;
      setWellCurves((m) => ({ ...m, [id]: null }));
      curvesCache.getCurves(id).then((d) => {
        const gr = d.curves?.GR || d.logs?.GR || null;
        const dept = d.curves?.DEPT || d.logs?.DEPT || null;
        setWellCurves((m) => ({ ...m, [id]: gr && dept ? { GR: gr, DEPT: dept } : null }));
      }).catch(() => setWellCurves((m) => ({ ...m, [id]: null })));
    }
  }, [projected, backend, curvesCache]); // eslint-disable-line react-hooks/exhaustive-deps

  const startSection = () => {
    if (!built) { setStatus('Build the model first; the map is the drawing surface.'); return; }
    setView('map'); setSectionDrawing(true); setSectionPending([]);
    setStatus('Click the map to place the section line vertices (2 or more), then Finish section line.');
  };
  const finishSection = () => {
    if (sectionPending.length < 2) { setStatus('A section line needs at least two vertices.'); return; }
    setSectionPath(sectionPending); setSectionDrawing(false); setSectionPending([]); setView('section');
    const total = sectionPending.slice(1).reduce((acc, [x, y], i) => acc + Math.hypot(x - sectionPending[i][0], y - sectionPending[i][1]), 0);
    setStatus(`Section line set: ${sectionPending.length} vertices, ${total.toFixed(0)} m. Wells within ${projectionM.toFixed(0)} m project onto it.`);
  };
  const cancelSection = () => { setSectionDrawing(false); setSectionPending([]); setStatus('Section drawing cancelled.'); };
  const exportVolumesCsv = () => {
    try {
      const { text, fileName } = volumesCsv(built, { name: definition.name, volumeUnits });
      downloadBlob(new Blob([text], { type: 'text/csv' }), fileName);
      setStatus(`Volumes exported as ${fileName}.`);
    } catch (e) { setStatus(e.message); }
  };
  const exportSectionPng = async () => {
    try {
      const blob = await sectionRef.current?.toBlob();
      if (!blob) throw new Error('Nothing to export yet.');
      downloadBlob(blob, `${definition.name.replace(/[^\w-]+/g, '_') || 'earth-model'}-section.png`);
      setStatus('Section exported as PNG.');
    } catch (e) { setStatus(e.message); }
  };
  const sectionOverlays = [
    ...(sectionPath ? [{ points: Float64Array.from(sectionPath.flat()), color: '#22d3ee', width: 2 }] : []),
    ...(sectionPending.length >= 2 ? [{ points: Float64Array.from(sectionPending.flat()), color: '#67e8f9', width: 1.5, dash: [4, 3] }] : []),
  ];
  const sectionToolbar = (
    <div className="flex items-center gap-2 mb-2">
      <select className={selCls} data-testid="em-sec-a" value={sectionWells.a}
        onChange={(e) => setSectionWells((p) => ({ ...p, a: e.target.value }))}>
        {(wells || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <span className="text-[11px] text-slate-500">→</span>
      <select className={selCls} data-testid="em-sec-b" value={sectionWells.b}
        onChange={(e) => { setSectionWells((p) => ({ ...p, b: e.target.value })); setSectionPath(null); }}>
        {(wells || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <button type="button" data-testid="em-sec-draw" className={viewBtn(false)} title="Draw the section line on the map" onClick={startSection}>
        <Route className="w-3.5 h-3.5" /> {sectionPath ? 'Redraw line' : 'Draw line on map'}
      </button>
      {sectionPath && <button type="button" data-testid="em-sec-clear" className={viewBtn(false)} onClick={() => { setSectionPath(null); setStatus('Section back to the well pair.'); }}>Well pair</button>}
      <label className="flex items-center gap-1 text-[11px] text-slate-400">VE
        <select className={selCls} data-testid="em-sec-ve" value={ve} onChange={(e) => setVe(Number(e.target.value))}>
          {VE_OPTIONS.map((v) => <option key={v} value={v}>{v}x</option>)}
        </select>
      </label>
      <span className="text-[11px] text-slate-500" data-testid="em-sec-wells">{projected.length} well{projected.length === 1 ? '' : 's'} on the line</span>
      <button type="button" data-testid="em-sec-png" className={`${viewBtn(false)} ml-auto`} title="Download the section as a PNG" onClick={exportSectionPng}>
        <ImageDown className="w-3.5 h-3.5" /> PNG
      </button>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry…
    </div>
  ) : view === 'qc' ? (
    <QcPanel built={built} surfaceNames={surfaceNames} depthUnit={depthUnit} volumeUnits={volumeUnits} />
  ) : view === 'section' ? (
    <div className="p-3">
      {sectionToolbar}
      <SectionView
        ref={sectionRef}
        spec={built?.spec}
        clamped={built?.clamped || []}
        surfaceNames={surfaceNames}
        zoneNames={(built?.zones || []).map((z) => z.name)}
        vertices={sectionVertices}
        ties={built?.ties || []}
        projected={projected}
        depthUnit={depthUnit}
        ve={ve}
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
        drawing={drawing || sectionDrawing}
        onMapClick={({ x, y }) => (sectionDrawing ? setSectionPending((p) => [...p, [x, y]]) : setPending((p) => [...p, [x, y]]))}
        overlays={sectionOverlays}
        contours={layer !== 'blocks'}
        label={`${zoneName} · ${layerLabel}${['top', 'base', 'thickness'].includes(layer) ? ` (${depthUnit})` : ''}`}
        zFormat={['top', 'base', 'thickness'].includes(layer) ? (v) => toDisplay(v, depthUnit).toFixed(1) : (v) => v.toFixed(3)}
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
          surfaces={rows}
          mappingPath={appPath(MAPPING_ID, appPaths)}
          wells={wells || []}
          definition={definition}
          onAddSurface={addSurface}
          onRemoveSurface={removeSurface}
          onMoveSurface={moveSurface}
          onDeletePolygon={deletePolygon}
          culturePolygons={culturePolygons}
          onAddCulturePolygon={addCulturePolygon}
        />
      )}
      center={center}
      dock={(
        <BuilderDock
          definition={definition}
          onDefinition={setDef}
          surfaces={rows}
          registrySurfaces={surfaces}
          depthUnit={depthUnit}
          onAddDerived={addDerived}
          onRemoveDerived={removeDerived}
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
          boundaries={boundaries}
        />
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
