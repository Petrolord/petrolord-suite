// Earth Modeling workspace controller (G8.2) on the shared
// WorkspaceShell: model explorer left, map / section / QC views in the
// center, the model builder in the right dock, status bar below. Owns
// all state; every data touch goes through the injected backend so
// /dev/earth-modeling runs the identical app on the in-memory backend
// (no auth/DB). Build is explicit (the Build button) — the definition
// is cheap state, the computed model is derived, deterministic, and
// recomputed on demand (plan decision 2).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Mountain, Loader2, Hammer, UploadCloud, Map as MapIcon, Rows, ClipboardCheck, ImageDown, Route, FileDown, ExternalLink, HelpCircle, Box, FileText } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import ModelExplorer from './ModelExplorer';
import BuilderDock from './BuilderDock';
import MapView from './MapView';
import SectionView from './SectionView';
import FrameworkView3D from './FrameworkView3D';
import QcPanel from './QcPanel';
import { emptyDefinition, MISTIE_WARN_M, publishPayload, BG_UNITS, upgradeDefinition } from '../services/modelBuild';
import { runBuild } from '../services/buildClient';
import { resolveShm } from '../services/shmResolve';
import { contourPlan, colorbarLevelsFor } from '@/pages/apps/MappingSurfaceStudio/components/MapCanvas';
import { DEPTH_UNIT_KEY, VOLUME_UNITS_KEY, VOLUME_UNIT_SETS, readSetting, fmtDepth } from '../services/units';
import { useAppUnits } from '@/lib/units/useAppUnits';
import UnitProfileNote from '@/components/units/UnitProfileNote';
import { allSurfaceRows, makeDerivedEntry, describeDerived } from '../services/derivedSurfaces';
import { projectWells, VE_OPTIONS } from '../services/sectionPath';
import { minCurvature, positionAtMd } from '../engine/wellties';
import { useWellCurvesCache } from '@/components/wells/useWellCurvesCache';
import { downloadBlob } from '@/components/maps/mapPng';
import { volumesCsv } from '../services/volumesCsv';
import { buildModelReportPdf } from '../services/modelReportPdf';
import { buildEarthModelProspect, writeProspectHandoff, rcpProspectHref } from '@/lib/earthModelProspect';
import { SEISMIC_FAULTS_HOOK, normalizeSeismicFault, hangingWallAtSurface } from '../services/seismicFaultZones';
import { appPath, mapSurfaceHref, reservoirCalcSurfaceHref, MAPPING_ID, RESERVOIRCALC_ID, EARTH_MODELING_ID } from '@/components/wells/appLinks';
import { toDisplay } from '@/components/wells/depthModes';
import { validatePolygon } from '../engine/blocks';
import { surfaceStats } from '@/lib/gridding/gridmath';

/** A cell size for the status line: whole metres or two decimals. */
const REPORT_KEY = 'em.report';
const fmtCell = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(2));

const selCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs';
const viewBtn = (active) =>
  `flex items-center gap-1 px-2 py-1 text-xs rounded border ${active
    ? 'border-pl-primary text-pl-primary-text bg-pl-primary/10'
    : 'border-pl-border text-pl-muted hover:bg-pl-sunken'}`;

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
export default function EarthWorkstation({ sample = false, backend, appPaths = {} }) {
  const [wells, setWells] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const [culturePolygons, setCulturePolygons] = useState([]);
  // U2-001: Seismolord faults through the hook (null until the backend has the reader)
  const [seismicFaults, setSeismicFaults] = useState(null);
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
  const [reporting, setReporting] = useState(false); // U2-003: a report PDF is being made
  // T1 (EM-T1-009): the depth sign shared with Mapping (mapping.depthPositive);
  // unset keeps Earth Modeling's positive TVDSS
  const [depthPositive, setDepthPositive] = useState(() => {
    try { const v = localStorage.getItem('mapping.depthPositive'); return v === null ? true : v === '1'; } catch { return true; }
  });
  const toggleDepthSign = () => setDepthPositive((d) => {
    try { localStorage.setItem('mapping.depthPositive', d ? '0' : '1'); } catch { /* private mode */ }
    return !d;
  });
  const [dockOpen, setDockOpen] = useState(true);
  // EM0: display units. Suite unit profile: depth and the volume set
  // start from the profile (rock volume family); the toolbar controls
  // change this view for the session only, and the older remembered
  // 'em.depthUnit' / 'em.volumeUnits' choices no longer beat the profile.
  // The toggle no longer writes the account depth setting either.
  const unitsHook = useAppUnits('earth-modeling', {
    depth: { family: 'depth', allowed: ['m', 'ft'] },
    volume: { family: 'rockVolume', allowed: Object.keys(VOLUME_UNIT_SETS) },
    // U1 (EM-U1-007): the gas FVF is typed in the profile's unit (RB/Mscf in field)
    bg: { family: 'fvfGas', allowed: BG_UNITS },
  }, {
    fallback: { depth: readSetting(DEPTH_UNIT_KEY, ['m', 'ft'], 'ft'), volume: readSetting(VOLUME_UNITS_KEY, Object.keys(VOLUME_UNIT_SETS), 'metric'), bg: 'm3/m3' },
    legacyKeys: [DEPTH_UNIT_KEY, VOLUME_UNITS_KEY],
  });
  const depthUnit = unitsHook.units.depth;
  const volumeUnits = unitsHook.units.volume;
  const setVolumeUnits = (v) => unitsHook.setUnit('volume', v);
  const bgUnit = unitsHook.units.bg || 'm3/m3';
  // U1 (EM-U1-011): field and analyst for the volumes report, kept per browser
  const [report, setReport] = useState(() => {
    try { const r = JSON.parse(localStorage.getItem(REPORT_KEY) || '{}'); return { field: r.field || '', analyst: r.analyst || '' }; } catch { return { field: '', analyst: '' }; }
  });
  const changeReport = (patchR) => setReport((r) => {
    const next = { ...r, ...patchR };
    try { localStorage.setItem(REPORT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  const [boundaries, setBoundaries] = useState([]);
  const [scalProjects, setScalProjects] = useState([]);
  useEffect(() => {
    let live = true;
    if (backend.listBoundaries) backend.listBoundaries().then((b) => { if (live) setBoundaries(b); }).catch(() => {});
    // U2-002: SCAL Studio projects for Sw from saturation-height
    if (backend.listScalProjects) backend.listScalProjects().then((p) => { if (live) setScalProjects(p || []); }).catch(() => {});
    return () => { live = false; };
  }, [backend]);
  const changeDepthUnit = (u) => unitsHook.setUnit('depth', u);

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
        if (backend[SEISMIC_FAULTS_HOOK.method]) {
          backend[SEISMIC_FAULTS_HOOK.method]().then((sf) => {
            if (!live) return;
            const norm = (sf?.faults || []).map(normalizeSeismicFault);
            setSeismicFaults({ faults: norm.map((n, i) => ({ ...n, id: n.id ?? `sf-${i}`, volumeName: n.volumeName })), skipped: sf?.skipped || [] });
          }).catch((e) => { if (live) setStatus(`Seismolord faults could not be read: ${e.message}`); });
        }
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

  // U2-004: the build runs on a worker with progress; Cancel terminates it
  const [buildProgress, setBuildProgress] = useState(null);
  const [buildWhere, setBuildWhere] = useState(null);
  const buildAbortRef = useRef(null);
  const cancelBuild = () => { buildAbortRef.current?.abort(); };
  const build = async () => {
    setBuilding(true);
    setBuildProgress({ label: 'Starting the build', fraction: 0 });
    const ctrl = new AbortController();
    buildAbortRef.current = ctrl;
    try {
      // U2-002: the SCAL project is read here, so the worker gets plain data
      const def = definition.methods?.sw === 'shm' ? { ...definition, shmResolved: await resolveShm(definition.shm, backend) } : definition;
      const { built: result, where } = await runBuild({
        definition: def, wells, surfaces, backend, signal: ctrl.signal,
        onProgress: (p) => setBuildProgress({ label: p.label, fraction: p.fraction }),
      });
      setBuilt(result);
      setBuildWhere(where);
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
      // T1 (EM-T1-002, -003, -004): fallbacks, mis-ties and clamps said out loud
      const fb = result.fallbacks || [];
      const fbText = fb.length ? ` ${fb.length} propert${fb.length === 1 ? 'y' : 'ies'} fell back (${fb.slice(0, 3).map((f) => `${f.zone} ${f.prop} block ${f.block} to ${f.used}`).join('; ')}${fb.length > 3 ? '; …' : ''}).` : '';
      const mt = result.misties || [];
      const worst = mt.reduce((a, t) => Math.max(a, Math.abs(t.residualM)), 0);
      const mtText = mt.length && !result.adjustment ? ` ${mt.length} well tie${mt.length === 1 ? '' : 's'} miss by more than ${fmtDepth(MISTIE_WARN_M, depthUnit, 0)} ${depthUnit} (worst ${fmtDepth(worst, depthUnit, 1)} ${depthUnit}): tick adjust surfaces to the well tops.` : '';
      const clampText = clamps ? ` Clamped nodes are marked on the map.` : '';
      // PETRO-U2-013: zone porosity published before PT9a is total porosity
      const tp = result.totalPhi || [];
      const tpText = tp.length ? ` Porosity from ${[...new Set(tp.map((t) => t.well))].join(', ')} is total porosity (Petrophysics Studio summary published before 2026-09-07); the well owner can republish it.` : '';
      // U1 (EM-U1-005, -008, door notes): clamped properties, open legs and what the door assumed
      const pc = result.propertyClamps || [];
      const pcText = pc.length ? ` ${pc.map((c) => `${c.zone} ${c.prop}: ${c.nodes} node${c.nodes === 1 ? '' : 's'}`).join('; ')} extrapolated outside 0 to 1 and held at the limit.` : '';
      const open = result.zones.filter((z) => z.openEdge?.open);
      const openText = open.length ? ` ${open.map((z) => z.name).join(', ')}: the hydrocarbon leg reaches the model edge, so the volume depends on where the frame stops (see QC).` : '';
      const noteText = (result.notes || []).length ? ` ${result.notes.join(' ')}` : '';
      const frameText = `${result.spec.nx}×${result.spec.ny} frame at ${fmtCell(result.specM.dx)} m${result.xyToM !== 1 ? ` (${fmtCell(result.spec.dx)} ${result.xyUnit})` : ''}`;
      setStatus(`Built ${definition.name}: ${frameText}, ${result.zones.length} zones, ${blocks} block${blocks > 1 ? 's' : ''}, ${clamps} clamped nodes${result.boundary ? `, clipped to ${result.boundary.name}` : ''}${adjText}.${clampText}${mtText}${fbText}${tpText}${pcText}${openText}${noteText}`);
    } catch (e) {
      setStatus(e.cancelled ? 'Build cancelled. The previous model, if any, is unchanged.' : e.message);
    } finally {
      setBuilding(false);
      setBuildProgress(null);
      buildAbortRef.current = null;
    }
  };

  const mapGrid = useMemo(() => {
    if (!built) return null;
    if (layer === 'blocks') { const lb = built.zones[zoneIdx]?.labels || built.labels; return lb ? Float64Array.from(lb) : null; }
    if (layer === 'top') return built.clamped[zoneIdx] || null;
    if (layer === 'base') return built.clamped[zoneIdx + 1] || null;
    if (layer === 'thickness') return built.thickness[zoneIdx] || null;
    if (layer.endsWith('_var')) return built.zones[zoneIdx]?.variance?.[layer.slice(0, -4)] || null;
    return built.zones[zoneIdx]?.props?.[layer] || null;
  }, [built, layer, zoneIdx]);

  // T1 (EM-T1-005): contour interval and colour-bar ticks round in the
  // display unit (the Mapping plan), depth layers in the shared sign
  const isDepthLayer = ['top', 'base', 'thickness'].includes(layer);
  const depthSign = isDepthLayer && layer !== 'thickness' && !depthPositive ? -1 : 1;
  const mapPlan = useMemo(() => (mapGrid && isDepthLayer
    ? contourPlan({ grid: mapGrid, typed: '', unit: depthUnit, isLength: true, sign: depthSign })
    : null), [mapGrid, isDepthLayer, depthUnit, depthSign]);
  const mapLevels = useMemo(() => (mapPlan ? colorbarLevelsFor(mapPlan.toDisp, mapPlan.fromDisp) : null), [mapPlan]);
  // T1 (EM-T1-004): the nodes this layer's surface had clamped, as crosses
  const clampOverlays = useMemo(() => {
    if (!built || !['top', 'base'].includes(layer)) return [];
    const mask = built.clampMasks?.[layer === 'top' ? zoneIdx : zoneIdx + 1];
    if (!mask) return [];
    const { spec } = built;
    const h = 0.3 * Math.min(spec.dx, spec.dy);
    const out = [];
    for (let j = 0; j < mask.length && out.length < 4000; j++) {
      if (!mask[j]) continue;
      const r = Math.floor(j / spec.nx); const c = j - r * spec.nx;
      const x = spec.x0 + c * spec.dx; const y = spec.y0 + r * spec.dy;
      out.push({ points: [x - h, y - h, x + h, y + h], color: '#f97316', width: 1.2 });
      out.push({ points: [x - h, y + h, x + h, y - h], color: '#f97316', width: 1.2 });
    }
    return out;
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
      // U1 (EM-U1-003): the layer leaves with the model's CRS and XY unit
      const saved = await backend.saveSurface(publishPayload(built, {
        layer, grid: mapGrid, modelName: definition.name, zoneName, methods: definition.methods,
      }));
      setLastPublished(saved);
      setStatus(`Published ${saved.name} to the registry. Open it in ReservoirCalc Pro or Mapping from the ribbon.`);
      await refreshSurfaces();
    } catch (e) { setStatus(e.message); }
  };

  const startDraw = () => {
    if (!built) { setStatus('Build the model first. The map is the drawing surface.'); return; }
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
      setStatus('Fault polygon added. Rebuild to apply blocks.');
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
      const faultPolygons = [...(definition.faultPolygons || []), { name: cp.name, vertices: cp.vertices.map(([x, y]) => [x, y]), cultureId: cp.id, source: 'geo_culture', ...(cp.crs ? { crs: cp.crs } : {}) }];
      setDef({ ...definition, faultPolygons });
      setStatus(`Added fault polygon ${cp.name} from Mapping & Surface Studio. Rebuild to apply blocks.`);
    } catch (e) { setStatus(e.message); }
  };

  // U2-001: a Seismolord fault joins as its rails; the build cuts it with
  // each zone top. The polygon at the first top is kept for the list and map.
  const addSeismicFault = (sf) => {
    if (!sf.ok) { setStatus(`${sf.name}: ${sf.reason}.`); return; }
    if ((definition.faultPolygons || []).some((p) => p.seismicFaultId === sf.id)) { setStatus(`${sf.name} is already in the model.`); return; }
    if (!built) { setStatus(`Build the model first: ${sf.name} is cut with the zone tops of the built framework.`); return; }
    const k = built.xyToM || 1;
    const rails = sf.rails.map((rail) => rail.map((p) => ({ x: p.x * k, y: p.y * k, d: p.d })));
    const r = hangingWallAtSurface(rails, built.clamped[0], built.specM);
    if (r.error) { setStatus(`${sf.name}: ${r.error}.`); return; }
    const faultPolygons = [...(definition.faultPolygons || []), {
      name: `${sf.name} hanging wall`, vertices: r.polygon.map(([x, y]) => [x / k, y / k]),
      rails: sf.rails.map((rail) => rail.map((p) => [p.x, p.y, p.d])), seismicFaultId: sf.id, source: 'seismolord', ...(sf.volumeName ? { volumeName: sf.volumeName } : {}), ...(sf.crs ? { crs: sf.crs } : {}),
    }];
    setDef({ ...definition, faultPolygons });
    setStatus(`Added the hanging-wall block of ${sf.name}; it is cut with each zone top. Rebuild to apply blocks.`);
  };

  // U1 (EM-U1-009): Save overwrites the model that is open; a new row only
  // for a model never saved, or on Save as a new model
  const [projectId, setProjectId] = useState(null);
  const saveProject = async ({ asNew = false } = {}) => {
    try {
      const payload = { name: definition.name, definition, crs: built?.crs || null };
      const saved = projectId && !asNew && backend.updateProject
        ? await backend.updateProject(projectId, payload)
        : await backend.saveProject(payload);
      setProjectId(saved.id);
      setProjects(await backend.listProjects());
      setStatus(`Saved model "${saved.name}"${projectId && !asNew ? ' (updated)' : ''}.`);
    } catch (e) { setStatus(e.message); }
  };
  const loadProject = (p) => {
    setDefinition(normalizeDefinition(upgradeDefinition(p.definition)));
    setProjectId(p.id);
    setBuilt(null);
    setStatus(`Loaded model "${p.name}". Build to compute.`);
  };

  const ribbon = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
      <ModuleHomeLink module="geoscience" />
      <Mountain className="w-4 h-4 text-pl-primary-text" />
      <span className="text-sm font-semibold text-pl-text whitespace-nowrap">Earth Modeling</span>
      <span className="hidden 2xl:inline text-[11px] text-pl-muted">layer-cake framework on the shared registry</span>
      <div className="ml-4 flex flex-wrap items-center gap-1">
        <button type="button" data-testid="em-view-map" className={viewBtn(view === 'map')} onClick={() => setView('map')}>
          <MapIcon className="w-3.5 h-3.5" /> Map
        </button>
        <button type="button" data-testid="em-view-section" className={viewBtn(view === 'section')} onClick={() => setView('section')}>
          <Rows className="w-3.5 h-3.5" /> Section
        </button>
        <button type="button" data-testid="em-view-qc" className={viewBtn(view === 'qc')} onClick={() => setView('qc')}>
          <ClipboardCheck className="w-3.5 h-3.5" /> QC &amp; volumes
        </button>
        <button type="button" data-testid="em-view-3d" className={viewBtn(view === '3d')} onClick={() => setView('3d')} title="The framework in 3D">
          <Box className="w-3.5 h-3.5" /> 3D
        </button>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" data-testid="em-depth-unit"
          className="px-2 py-1 text-[11px] rounded border border-pl-border text-pl-text hover:bg-pl-sunken"
          title="Depth display unit (feet or metres); starts from your Suite units and changes this view for the session. The model computes in metres."
          onClick={() => changeDepthUnit(depthUnit === 'ft' ? 'm' : 'ft')}>
          depth: {depthUnit}
        </button>
        <select className={selCls} data-testid="em-volume-units" value={volumeUnits} title="Volume display units"
          onChange={(e) => setVolumeUnits(e.target.value)}>
          {Object.values(VOLUME_UNIT_SETS).map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
        </select>
        <UnitProfileNote u={unitsHook} names={{ volume: 'volumes' }} className="hidden xl:inline-flex" />
        <button type="button" data-testid="em-build" data-build-where={buildWhere || ''}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-primary/50 text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-40"
          disabled={building || definition.surfaceIds.length < 2} onClick={build}>
          {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />} Build model
        </button>
        {building && (
          <span className="flex items-center gap-1" data-testid="em-build-progress">
            <span className="w-20 h-1.5 rounded bg-pl-sunken overflow-hidden" title={buildProgress?.label || ''}>
              <span className="block h-full bg-pl-primary" style={{ width: `${Math.round(100 * (buildProgress?.fraction || 0))}%` }} />
            </span>
            <span className="text-[11px] text-pl-muted whitespace-nowrap" data-testid="em-build-progress-text">{Math.round(100 * (buildProgress?.fraction || 0))}%</span>
            <button type="button" data-testid="em-build-cancel" onClick={cancelBuild}
              className="px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken">Cancel</button>
          </span>
        )}
        <button type="button" data-testid="em-publish"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-primary-text hover:bg-pl-sunken disabled:opacity-40"
          disabled={!built || !mapGrid || layer === 'blocks'} onClick={publish}>
          <UploadCloud className="w-3.5 h-3.5" /> Publish layer
        </button>
        <button type="button" data-testid="em-volumes-csv" title="Download the volume tables as CSV in the chosen units"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"
          disabled={!built} onClick={() => exportVolumesCsv()}>
          <FileDown className="w-3.5 h-3.5" /> Volumes CSV
        </button>
        <button type="button" data-testid="em-send-rcp" title="Open ReservoirCalc Pro with the zone on the map as a prospect: area, column, NTG, porosity, Sw, contacts and FVFs as the model has them"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"
          disabled={!built} onClick={() => sendToRcp()}>
          <ExternalLink className="w-3.5 h-3.5" /> Prospect to ReservoirCalc Pro
        </button>
        <button type="button" data-testid="em-report-pdf" title="Download the model report (PDF): reviewer header, volumes, contacts as used, flags, provenance, ties and the map"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"
          disabled={!built || reporting} onClick={() => exportReportPdf()}>
          <FileText className="w-3.5 h-3.5" /> Report PDF
        </button>
        {lastPublished && (
          <>
            <Link to={reservoirCalcSurfaceHref(lastPublished.id, appPath(RESERVOIRCALC_ID, appPaths))} data-testid="em-open-rcp"
              title={`Open ReservoirCalc Pro's Surface import on ${lastPublished.name}`}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken">
              <ExternalLink className="w-3.5 h-3.5" /> Open in ReservoirCalc Pro
            </Link>
            <Link to={mapSurfaceHref(lastPublished.id, appPath(MAPPING_ID, appPaths))} data-testid="em-open-mapping"
              title={`Open ${lastPublished.name} in Mapping & Surface Studio`}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-primary/50 text-pl-primary-text hover:bg-pl-primary/10">
              <MapIcon className="w-3.5 h-3.5" /> Open in Mapping
            </Link>
          </>
        )}
        <button type="button" data-testid="em-depth-sign" onClick={toggleDepthSign}
          title="Show depths as positive TVDSS or as elevation (negative below datum); shared with Mapping"
          className="px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken">
          {depthPositive ? 'depth +' : 'elevation'}
        </button>
        <Link to={`${appPath(EARTH_MODELING_ID, appPaths)}/help`} data-testid="em-help" title="Open the Earth Modeling help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken">
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
        <ThemeToggle className="h-7 w-7" />
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-pl-surface border-t border-pl-border text-[11px] text-pl-muted">
      <span data-testid="em-status" className="truncate">{building && buildProgress ? `Building: ${buildProgress.label} (${Math.round(100 * buildProgress.fraction)}%)` : status}</span>
      <span className="ml-auto whitespace-nowrap" data-testid="em-frame">
        {built ? `${built.spec.nx}×${built.spec.ny} @ ${fmtCell(built.specM.dx)} m` : `${definition.surfaceIds.length} surfaces stacked`}
      </span>
      <span className="whitespace-nowrap text-pl-muted">{depthPositive ? 'TVDSS' : 'elevation'} {depthUnit}, SI internal</span>
    </div>
  );

  const mapToolbar = built && (
    <div className="flex items-center gap-2 mb-2">
      {sectionDrawing && (
        <>
          <span className="text-[11px] text-pl-primary-text" data-testid="em-sec-pending">{sectionPending.length} section vertices</span>
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
      {layer === 'blocks' && !built.labels && <span className="text-[11px] text-pl-muted">no fault polygons, so a single block</span>}
      {layer.endsWith('_var') && <span className="text-[11px] text-pl-muted" data-testid="em-map-variance-note">low near the wells, high where the property is guessed</span>}
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
    const k = built?.xyToM || 1;
    const total = k * sectionPending.slice(1).reduce((acc, [x, y], i) => acc + Math.hypot(x - sectionPending[i][0], y - sectionPending[i][1]), 0);
    setStatus(`Section line set: ${sectionPending.length} vertices, ${total.toFixed(0)} m. Wells within ${(projectionM * k).toFixed(0)} m project onto it.`);
  };
  const cancelSection = () => { setSectionDrawing(false); setSectionPending([]); setStatus('Section drawing cancelled.'); };
  const exportVolumesCsv = () => {
    try {
      const { text, fileName } = volumesCsv(built, { name: definition.name, volumeUnits, report });
      downloadBlob(new Blob([text], { type: 'text/csv' }), fileName);
      setStatus(`Volumes exported as ${fileName}.`);
    } catch (e) { setStatus(e.message); }
  };
  // U2-003: the model report a reviewer signs (PDF); the map on screen goes in as a picture
  // U2-009: the model to ReservoirCalc Pro as a prospect (the zone on the map)
  const navigate = useNavigate();
  const sendToRcp = () => {
    try {
      const usedWells = (wells || []).filter((w) => (w.zones || []).some((z) => definition.zones.some((d) => d.registryZone && d.registryZone === z.name)));
      const payload = buildEarthModelProspect(built, { name: definition.name, wells: usedWells, report });
      const id = writeProspectHandoff(payload);
      navigate(rcpProspectHref(id, zoneIdx, appPath(RESERVOIRCALC_ID, appPaths)));
    } catch (e) { setStatus(e.message); }
  };
  const exportReportPdf = async () => {
    if (!built) return;
    setReporting(true);
    try {
      const images = [];
      const canvas = document.querySelector('[data-testid="em-map-canvas"] canvas') || document.querySelector('canvas[data-testid="em-map-canvas"]');
      if (canvas && canvas.width > 0) {
        try { images.push({ title: `Map: ${zoneName} ${layerLabel}`, dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }); } catch { /* a tainted canvas is skipped */ }
      }
      const { doc, fileName } = await buildModelReportPdf({ built, name: definition.name, volumeUnits, report, images });
      downloadBlob(doc.output('blob'), fileName);
      setStatus(`Model report exported as ${fileName}.`);
    } catch (e) { setStatus(e.message); } finally { setReporting(false); }
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
      <span className="text-[11px] text-pl-muted">→</span>
      <select className={selCls} data-testid="em-sec-b" value={sectionWells.b}
        onChange={(e) => { setSectionWells((p) => ({ ...p, b: e.target.value })); setSectionPath(null); }}>
        {(wells || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <button type="button" data-testid="em-sec-draw" className={viewBtn(false)} title="Draw the section line on the map" onClick={startSection}>
        <Route className="w-3.5 h-3.5" /> {sectionPath ? 'Redraw line' : 'Draw line on map'}
      </button>
      {sectionPath && <button type="button" data-testid="em-sec-clear" className={viewBtn(false)} onClick={() => { setSectionPath(null); setStatus('Section back to the well pair.'); }}>Well pair</button>}
      <label className="flex items-center gap-1 text-[11px] text-pl-muted">VE
        <select className={selCls} data-testid="em-sec-ve" value={ve} onChange={(e) => setVe(Number(e.target.value))}>
          {VE_OPTIONS.map((v) => <option key={v} value={v}>{v}x</option>)}
        </select>
      </label>
      <span className="text-[11px] text-pl-muted" data-testid="em-sec-wells">{projected.length} well{projected.length === 1 ? '' : 's'} on the line</span>
      <button type="button" data-testid="em-sec-png" className={`${viewBtn(false)} ml-auto`} title="Download the section as a PNG" onClick={exportSectionPng}>
        <ImageDown className="w-3.5 h-3.5" /> PNG
      </button>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-pl-muted text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry…
    </div>
  ) : view === 'qc' ? (
    <QcPanel built={built} surfaceNames={surfaceNames} depthUnit={depthUnit} volumeUnits={volumeUnits}
      onDistribution={(d) => { setBuilt((b) => (b ? { ...b, distribution: d } : b)); setStatus(`Volume distribution: ${d.iterations} trials, seed ${d.seed}. P90 is the low case.`); }} />
  ) : view === '3d' ? (
    <div className="p-3 h-full min-h-0">
      {built ? (
        <FrameworkView3D built={built} wells={wells} surfaceNames={surfaceNames} faultPolygons={definition.faultPolygons || []} depthUnit={depthUnit} onStatus={setStatus} />
      ) : (
        <div className="h-full flex items-center justify-center text-pl-muted text-sm" data-testid="em-3d-empty">Build the model to see it in 3D.</div>
      )}
    </div>
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
        xyToM={built?.xyToM || 1}
      />
    </div>
  ) : !built ? (
    <div className="h-full flex items-center justify-center text-pl-muted text-sm" data-testid="em-empty">
      <span className="flex flex-col items-center gap-2">
        <span>Stack two or more registry surfaces (explorer), then Build model.</span>
        {!sample && !backend.isSample && (
          <Link to="?sample=1" data-testid="em-try-sample" className="text-pl-primary-text hover:underline text-xs">New here? Try it on sample data (nothing is saved)</Link>
        )}
      </span>
    </div>
  ) : (
    <div className="h-full min-h-0 p-3 flex flex-col">
      {mapToolbar}
      <MapView
        spec={built.spec}
        grid={mapGrid}
        wells={wells}
        polygons={built.polygonsByZone ? built.polygonsByZone[zoneIdx].map((ring, q) => ({ ...(definition.faultPolygons[q] || {}), vertices: ring })) : (definition.faultPolygons || [])}
        pendingVertices={pending}
        drawing={drawing || sectionDrawing}
        onMapClick={({ x, y }) => (sectionDrawing ? setSectionPending((p) => [...p, [x, y]]) : setPending((p) => [...p, [x, y]]))}
        overlays={[...sectionOverlays, ...clampOverlays]}
        contours={layer !== 'blocks'}
        label={`${zoneName} · ${layerLabel}${isDepthLayer ? ` (${depthUnit})` : ''}`}
        zFormat={isDepthLayer ? (v) => (depthSign * toDisplay(v, depthUnit)).toFixed(1) : (v) => v.toFixed(3)}
        contourStep={mapPlan?.stepM ?? null}
        contourFormat={mapPlan?.format ?? null}
        colorbarLevels={mapLevels}
        height="fill"
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
          seismicFaults={seismicFaults}
          seismicHookReason={backend[SEISMIC_FAULTS_HOOK.method] ? null : SEISMIC_FAULTS_HOOK.reason}
          onAddSeismicFault={addSeismicFault}
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
          onSaveProject={() => saveProject()}
          onSaveAsNew={() => saveProject({ asNew: true })}
          projectId={projectId}
          bgUnit={bgUnit}
          report={report}
          onReport={changeReport}
          onBgUnit={(u) => unitsHook.setUnit('bg', u)}
          onLoadProject={loadProject}
          boundaries={boundaries}
          scalProjects={scalProjects}
        />
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
