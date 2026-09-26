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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Map as MapIcon, Loader2, UploadCloud, Sigma, Globe2, Image as ImageIcon, SlidersHorizontal,
  Pentagon, Square, MapPin, Calculator, Clock, Trash2, Eye, EyeOff, HelpCircle, Spline,
} from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ScrollArea } from '@/components/ui/scroll-area';
import SurfacesExplorer from './SurfacesExplorer';
import MapCanvas, { DEFAULT_MAP_DISPLAY, contourPlan, displaySign } from './MapCanvas';
import { contourPaths } from '@/components/maps/mapPainter';
import { contourEditPlan, translatePath } from '../services/contourEdit';
import { MAP_COLORMAPS } from '@/components/maps/lut';
import { downloadBlob } from '@/components/maps/mapPng';
import CultureImportDialog from '@/components/culture/CultureImportDialog';
import SurfaceImportDialog from './SurfaceImportDialog';
import {
  exportSurfaceText, controlPointsCsv, downloadText, specOfSurface, gridInUnit, isLengthSurface,
} from '../services/surfaceExport';
import { mergeCloseControls } from '@/lib/gridding/gridding';
import { runGridding } from '../services/gridRunner';
import { extentMask } from '../services/extent';
import { convertWithWellVelocity, correctToWells, wellDepthsForTop, mapResiduals, residualStats } from '../services/wellTieDepth';
import ResidualTable from './ResidualTable';
import { prospectCardPng } from '../services/prospectCard';
import { GRID_METHODS, fitVariogramFromPoints, krigingOptions, describeVariogram } from '../services/krigingPlan';
import {
  polygonPayload, blocksForPoints, nodeBlocksFor, ringOf, isPolygonLayer, POLYGON_KINDS, POLYGON_KIND_LABEL, STRAT_POLYGON_KINDS,
} from '../services/polygonTools';
import { runArithmetic, ARITH_OPS } from '../services/arithmetic';
import { quickGrv, describeGrv, interpretContact, nodeAt } from '../services/quickGrv';
import ClosureCurveChart from './ClosureCurveChart';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { twtGridToElevation, usableModel, describeVelocity } from '../services/timeDepth';
import {
  topsToControlPoints, zoneAttrToPoints, specForPoints, surfaceStats, maskOutsidePolygon,
} from '../engine/surface';
import { resampleTo } from '@/lib/gridding/gridmath';
import { describeGridResult } from '../services/gridStatus';
import { parseWellsParam, parseNetParam, appPath, MAPPING_ID } from '@/components/wells/appLinks';
import { thicknessPoints, environmentPoints } from '@/lib/stratigraphy/stratMaps';
import { resolveEnvironment, resolveLithology } from '@/lib/stratigraphy/lithology';
import { toDisplay, fromDisplay } from '@/components/wells/depthModes';
import { consensusTag } from '@/lib/crs/tags';
import { crsUnit } from '@/lib/crs';
import { placeWellsForHost } from '@/lib/crs/guards';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

export const DEPTH_UNIT_KEY = 'mapping.depthUnit';
// T1 (MAP-T1-013): show depth structures as positive depth below datum
export const DEPTH_SIGN_KEY = 'mapping.depthPositive';
const readDepthPositive = () => {
  try { return localStorage.getItem(DEPTH_SIGN_KEY) === '1'; } catch { return false; }
};
const readDepthUnit = () => {
  try { return localStorage.getItem(DEPTH_UNIT_KEY) === 'm' ? 'm' : 'ft'; } catch { return 'ft'; }
};

export { isLengthSurface };

/** Registry grids arrive in the row's z_unit (Seismolord and imports
 *  write feet); the workstation works in METRES internally, so every
 *  load converts here and the display converts back to the user's unit. */
const loadGridM = async (backend, surface) => gridInUnit(surface, await backend.downloadSurfaceGrid(surface), 'm');

/** @param {Object} [p.appPaths] route overrides for the launchers (harness) */
export default function MappingWorkstation({ backend, appPaths = {}, sample = false }) {
  const [wells, setWells] = useState(null);
  // deep links (MS4): ?surface= selects, ?top=&wells= grids on arrival,
  // ?wells= alone posts only those wells; read once, consumed after load
  const [searchParams] = useSearchParams();
  const deepLinkRef = useRef({
    surface: searchParams.get('surface'),
    top: searchParams.get('top'),
    net: parseNetParam(searchParams.get('net')),           // ST4: ?net=upper|lower&measure=
    measure: searchParams.get('measure') || 'net',
    wells: parseWellsParam(searchParams.get('wells')),
    done: false,
  });
  const [linkedWellIds, setLinkedWellIds] = useState(null); // ?wells= filter for posting
  const [surfaces, setSurfaces] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [displayGrid, setDisplayGrid] = useState(null);   // Float32Array shown
  const [displaySurface, setDisplaySurface] = useState(null); // meta shown (saved or preview)
  const [preview, setPreview] = useState(null);           // {spec, grid, name, kind, provenance} unsaved
  const [source, setSource] = useState({ type: 'top', key: '' });
  const [depthRef, setDepthRef] = useState('tvdss');
  const [depthUnit, setDepthUnit] = useState(readDepthUnit);
  const [depthPositive, setDepthPositive] = useState(readDepthPositive);
  const [cellM, setCellM] = useState('150');
  // MS5 kriging: method and variogram fields (range in metres, sill in
  // metres squared for a structure map); fitted from the wells on demand
  const [gridMethod, setGridMethod] = useState('tps');
  const [variogram, setVariogram] = useState({ model: 'spherical', range: '', sill: '', nugget: '0', detrend: true });
  const [showVariance, setShowVariance] = useState(false);
  // T1 batch B: spline in tension settings, how far the map reaches, the
  // wells' hull drawn when the map goes past it, and the tie residuals
  const [tensionOpts, setTensionOpts] = useState({ tension: 0.5, smoothing: 0 });
  const [extent, setExtent] = useState({ mode: 'hull', distance: '1000' });
  const [hullOverlay, setHullOverlay] = useState(null);
  const [residuals, setResiduals] = useState(null); // {title, rows, stats}
  const [tdMethod, setTdMethod] = useState('linear');
  const [tdTop, setTdTop] = useState('');
  const [tdCorrect, setTdCorrect] = useState(false);
  // T1 (MAP-T1-016): contours of another surface over this one's colours
  const [contourFromId, setContourFromId] = useState('');
  const [contourOverlay, setContourOverlay] = useState(null);
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
  // map display settings (MS1): contour interval, labels, colour map,
  // posting, legend, scale bar, north arrow, axes; saved with a surface
  // in provenance.display and restored on select
  const [mapSettings, setMapSettings] = useState(DEFAULT_MAP_DISPLAY);
  const [posted, setPosted] = useState(null); // well -> {z, x, y} of the preview's control points
  const viewRef = useRef(null);
  // MS2: import dialog and the in-place re-grid target
  const [importOpen, setImportOpen] = useState(false);
  const [replaceId, setReplaceId] = useState(null);
  // MS3: drawing (fault-block / boundary polygons, guide points), gridding
  // constraints, arithmetic, quick GRV, time-to-depth
  const [drawMode, setDrawMode] = useState(null); // null | 'fault' | 'boundary' | 'guide'
  const [pending, setPending] = useState([]);     // [x, y] world vertices being drawn
  const [polyName, setPolyName] = useState('');
  const [guidePoints, setGuidePoints] = useState([]); // {x, y, z (m), label}
  const [guideValue, setGuideValue] = useState('');
  const [guideAt, setGuideAt] = useState(null);      // world point awaiting a value
  const [gridFaultIds, setGridFaultIds] = useState(new Set());
  const [clipBoundaryId, setClipBoundaryId] = useState('');
  const [arith, setArith] = useState({ op: 'thickness', k: '' });
  const [grvContact, setGrvContact] = useState('');
  const [grvResult, setGrvResult] = useState(null);
  const [grvData, setGrvData] = useState(null);       // T1: the closure result behind the read-out
  // T1 (MAP-T1-005): a delete asks first, then waits UNDO_MS before it
  // reaches the registry, so a slip can be taken back
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // {surface, timer}
  const pendingDeleteRef = useRef(null);
  const [velocityModels, setVelocityModels] = useState([]);
  const [tdModelId, setTdModelId] = useState('');
  const [tdUnit, setTdUnit] = useState('ft');
  // MS5 contour editing: the contour picked up on pointer-down and the
  // drag vector so far; the moved line is painted as an overlay
  const [contourDrag, setContourDrag] = useState(null); // {level, path, from, to}
  const contourCounter = useRef(0);

  useEffect(() => {
    try { localStorage.setItem(DEPTH_UNIT_KEY, depthUnit); } catch { /* private mode */ }
  }, [depthUnit]);
  useEffect(() => {
    try { localStorage.setItem(DEPTH_SIGN_KEY, depthPositive ? '1' : '0'); } catch { /* private mode */ }
  }, [depthPositive]);
  // MS5: the per-user setting (geoscience_settings.depth_unit) wins over
  // the browser default once it is known; a toggle writes it back and the
  // browser copy stays as the fallback when the column is not there yet
  useEffect(() => {
    let live = true;
    if (!backend.getDepthUnit) return undefined;
    backend.getDepthUnit().then((u) => { if (live && (u === 'm' || u === 'ft')) setDepthUnit(u); }).catch(() => {});
    return () => { live = false; };
  }, [backend]);
  const changeDepthUnit = (u) => {
    setDepthUnit(u);
    if (backend.setDepthUnit) backend.setDepthUnit(u).catch((e) => setStatus(e.message));
  };

  const setSetting = (key, value) => setMapSettings((m) => ({ ...m, [key]: value }));

  const fmtZ = useCallback((v, s = displaySurface) => {
    if (!Number.isFinite(v)) return '—';
    return isLengthSurface(s) ? `${(displaySign(s, depthPositive) * toDisplay(v, depthUnit)).toFixed(1)} ${depthUnit}` : v.toFixed(3);
  }, [depthUnit, displaySurface, depthPositive]);
  const zConventionText = depthPositive ? 'depth positive down' : 'elevation, negative down';

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

  useEffect(() => {
    let live = true;
    if (!backend.listVelocityModels) return undefined;
    backend.listVelocityModels()
      .then((rows) => { if (live) setVelocityModels(rows); })
      .catch(() => { if (live) setVelocityModels([]); });
    return () => { live = false; };
  }, [backend]);

  const polygonRows = useMemo(() => culture.filter(isPolygonLayer), [culture]);
  const otherCulture = useMemo(() => culture.filter((c) => !isPolygonLayer(c)), [culture]);
  const faultRows = useMemo(() => polygonRows.filter((c) => c.kind === POLYGON_KINDS.fault), [polygonRows]);
  const boundaryRows = useMemo(() => polygonRows.filter((c) => c.kind === POLYGON_KINDS.boundary), [polygonRows]);

  /** Ring of a polygon row, downloading its features once. */
  const ringFor = useCallback(async (row) => {
    let feats = cultureFeatures.get(row.id);
    if (!feats) {
      feats = await backend.downloadCultureFeatures(row);
      setCultureFeatures((m) => new Map(m).set(row.id, feats));
    }
    const ring = ringOf(feats[0]);
    if (ring.length < 3) throw new Error(`${row.name} has no polygon ring.`);
    return ring;
  }, [backend, cultureFeatures]);

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

  // consume the deep link once the registry is in
  useEffect(() => {
    const dl = deepLinkRef.current;
    if (dl.done || !wells) return;
    if (!dl.surface && !dl.top && !dl.net && !dl.wells.length) { dl.done = true; return; }
    dl.done = true;
    if (dl.surface) {
      if (surfaces.some((x) => x.id === dl.surface)) selectSurface(dl.surface);
      else setStatus('The linked surface is not in your registry.');
      return;
    }
    const known = dl.wells.filter((id) => wells.some((w) => w.id === id));
    if (dl.net) {
      const missing = [dl.net.upper, dl.net.lower].filter((n) => !topNames.includes(n));
      if (missing.length) { setStatus(`The linked top "${missing[0]}" is on none of your wells.`); return; }
      const src = { type: 'net', key: dl.measure, measure: ['gross', 'net', 'ratio'].includes(dl.measure) ? dl.measure : 'net', upper: dl.net.upper, lower: dl.net.lower, codes: ['sandstone', 'siltstone', 'conglomerate'] };
      setSource(src);
      if (known.length) setLinkedWellIds(known);
      runGrid({ source: src, wellIds: known, prefix: `Opened on ${dl.net.upper} to ${dl.net.lower} from a link. ` });
      return;
    }
    if (dl.top) {
      if (!topNames.includes(dl.top)) { setStatus(`The linked top "${dl.top}" is on none of your wells.`); return; }
      const src = { type: 'top', key: dl.top };
      setSource(src);
      if (known.length) setLinkedWellIds(known);
      runGrid({ source: src, wellIds: known, prefix: `Opened on top ${dl.top} from a link. ` });
      return;
    }
    if (known.length) {
      setLinkedWellIds(known);
      setStatus(`Posting the ${known.length} linked well${known.length === 1 ? '' : 's'} only. Grid a top to map them.`);
    } else {
      setStatus('The linked wells are not in your registry.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wells, surfaces, topNames]);

  // the control points the current source would grid (MS5, for the
  // variogram fit); same placement rules as runGrid
  const currentControlPoints = (opts = {}) => {
    const src = opts.source || source;
    const sourceWells = opts.wellIds?.length ? (wells || []).filter((w) => opts.wellIds.includes(w.id)) : wells;
    if (src.type === 'top') return topsToControlPoints(sourceWells, src.key, { depthRef, placement: 'borehole' }).points;
    if (src.type === 'net') return thicknessPoints(sourceWells, src.upper, src.lower, { intervalsByWell: intervalsByWell(sourceWells), measure: src.measure, codes: src.codes }).points;
    return zoneAttrToPoints(sourceWells, src.zoneName || zoneNames[0], src.key);
  };
  // ST4: each well's interval rows keyed by id (the backends embed them)
  const intervalsByWell = (list) => Object.fromEntries((list || []).map((w) => [w.id, w.intervals || []]));
  const environmentRows = useMemo(() => {
    if (source.type !== 'net' || !source.upper || !source.lower || source.upper === source.lower) return [];
    try { return environmentPoints(wells || [], source.upper, source.lower, { intervalsByWell: intervalsByWell(wells) }).points; } catch { return []; }
  }, [source, wells]);
  const fitVariogramFromWells = () => {
    try {
      const pts = [...currentControlPoints(), ...guidePoints.map((gp) => ({ x: gp.x, y: gp.y, z: gp.z }))];
      const fit = fitVariogramFromPoints(pts, { model: variogram.model, nugget: Number(variogram.nugget || 0) });
      setVariogram((v) => ({ ...v, range: fit.range.toFixed(0), sill: fit.sill.toFixed(2) }));
      setStatus(`Fitted a ${fit.model} variogram from ${pts.length} control points: range ${fit.range.toFixed(0)} m, sill ${fit.sill.toFixed(2)} (${fit.bins} lag bins of ${fit.lag.toFixed(0)} m, rmse ${fit.rmse.toFixed(3)}).`);
    } catch (e) { setStatus(e.message); }
  };

  const runGrid = async (opts = {}) => {
    const src = opts.source || source;
    const cell = Number(cellM);
    if (!(cell > 0)) { setStatus('Cell size must be a positive number of metres.'); return; }
    setGridding(true);
    try {
      // a ?wells= list from a launcher restricts the control points
      const sourceWells = opts.wellIds?.length ? (wells || []).filter((w) => opts.wellIds.includes(w.id)) : wells;
      let result;
      let name;
      let kind;
      if (src.type === 'top') {
        result = topsToControlPoints(sourceWells, src.key, { depthRef, placement: 'borehole' });
        // T1 (MAP-T1-006): an MD map is not a structure map. Its values
        // are positive measured depths, so publishing it as an elevation
        // surface made ReservoirCalc Pro and Earth Modeling read it upside
        // down. It is an attribute (raw metres) and says so in its name.
        if (depthRef === 'md') {
          name = `${src.key} MD (measured depth, m)`;
          kind = 'attribute';
        } else {
          name = `${src.key} structure`;
          kind = 'structure';
        }
      } else if (src.type === 'net') {
        // ST4: thickness between two tops from the lithology log (measured-depth thickness)
        const r = thicknessPoints(sourceWells, src.upper, src.lower, { intervalsByWell: intervalsByWell(sourceWells), measure: src.measure, codes: src.codes });
        result = { points: r.points, skipped: r.skipped, extrapolated: 0, depthRef: null };
        name = `${src.measure === 'gross' ? 'Gross thickness' : src.measure === 'net' ? 'Net sand' : 'Net to gross'} ${src.upper} to ${src.lower}`;
        kind = src.measure === 'ratio' ? 'attribute' : 'isochore';
      } else {
        const zoneName = src.zoneName || zoneNames[0];
        result = { points: zoneAttrToPoints(sourceWells, zoneName, src.key), skipped: [], extrapolated: 0, depthRef: null };
        name = `${src.key} attribute`;
        kind = 'attribute';
      }
      // guide points (MS3) grid with the wells, tagged so the CSV says so
      const guideList = opts.guides || guidePoints;
      const guides = kind === 'structure' ? guideList.map((gp) => ({ x: gp.x, y: gp.y, z: gp.z, well: gp.label, md: null, extrapolated: false, guide: true })) : [];
      // T1 (MAP-T1-003): wells closer than half a cell (a pilot hole and
      // its sidetrack, a re-entry) become one control point at their mean;
      // an exact interpolant through two nearly coincident values
      // overshoots into a bullseye, and through two at the same place it
      // cannot be solved at all
      const merge = mergeCloseControls([...result.points, ...guides], cell / 2);
      const points = merge.points;
      if (points.length < 3) throw new Error('Need at least 3 control points: this source has too few wells.');
      // T1 (MAP-T1-007): the map may reach past the outermost wells
      const beyond = extent.mode === 'beyond' ? Number(extent.distance) : 0;
      if (extent.mode === 'beyond' && !(beyond > 0)) throw new Error('Type how far past the wells to map, in metres.');
      const spec = specForPoints(points, cell, 2 + (beyond > 0 ? Math.ceil(beyond / cell) : 0));
      // Even "inside the wells" a map reaches a cell and a half past their
      // hull, so the outermost wells sit inside the map instead of on its
      // ragged null edge (T1: they read no residual and looked unmapped)
      const reachM = beyond > 0 ? beyond : 1.5 * cell;
      if (spec.nx * spec.ny > 4_000_000) throw new Error('Grid too large: increase the cell size.');
      // Fault-block polygons (MS3): the surface is gridded independently
      // inside and outside each polygon, so a throw shows as a step at
      // the polygon edge (the Earth Modeling rule). Otherwise fill the
      // whole convex hull of the control points: the engine's default
      // extrapolation limit (2 cells) is a seismic-pick-density setting
      // and leaves a well-spaced map in patches.
      const faults = faultRows.filter((r) => gridFaultIds.has(r.id));
      const rings = await Promise.all(faults.map(ringFor));
      let g;
      let kriged = null;
      if (gridMethod === 'kriging') {
        // MS5: ordinary kriging with the dock's variogram; fault blocks
        // stay a thin-plate spline feature in v1
        if (rings.length) throw new Error('Kriging grids without fault blocks in this version. Untick the fault polygons or grid with the thin-plate spline.');
        if (beyond > 0) throw new Error('Kriging maps inside the wells in this version. Map beyond them with the thin-plate spline or the spline in tension.');
        let v = variogram;
        if (!(Number(v.range) > 0) || !(Number(v.sill) > 0)) {
          const fit = fitVariogramFromPoints(points, { model: v.model, nugget: Number(v.nugget || 0) });
          v = { ...v, range: fit.range.toFixed(0), sill: fit.sill.toFixed(2) };
          setVariogram(v);
        }
        kriged = krigingOptions(v);
        g = await runGridding('kriging', points, spec, { ...kriged, maxExtrapolation: 1e9 });
      } else if (gridMethod === 'tension') {
        if (rings.length) throw new Error('The spline in tension grids without fault blocks in this version. Untick the fault polygons or grid with the thin-plate spline.');
        g = await runGridding('tension', points, spec, { tension: tensionOpts.tension, smoothing: tensionOpts.smoothing, mask: 'none' });
      } else if (rings.length) {
        g = await runGridding('blocked', blocksForPoints(points, rings), spec, { nodeBlocks: nodeBlocksFor(spec, rings), maxExtrapolation: 1e9 });
      } else {
        g = await runGridding('tps', points, spec, { maxExtrapolation: 1e9, mask: 'none' });
      }
      let reach = null;
      if (!kriged && !rings.length) {
        const em = extentMask(g.z, spec, points, reachM);
        g = { ...g, z: em.z };
        if (beyond > 0) reach = em;
      }
      setHullOverlay(reach ? reach.ring : null);
      const boundary = boundaryRows.find((r) => r.id === clipBoundaryId) || null;
      let z = g.z;
      if (boundary) z = maskOutsidePolygon(z, spec, await ringFor(boundary));
      g = { ...g, z };
      // The map inherits its CRS from the wells it was gridded from:
      // any disagreement or unknown well leaves the map unverified
      // (null tag, amber badge) instead of guessing.
      const contributing = (wells || []).filter((w) => points.some((p) => p.well === w.name));
      const crs = consensusTag(contributing.map((w) => w.crs));
      const zDomain = kind === 'attribute' ? 'attribute' : 'depth';   // an isochore is a length in the depth domain
      const postedNow = Object.fromEntries(points.flatMap((p) => (p.wells || [p.well]).map((w) => [w, { z: p.z, x: p.x, y: p.y }])));
      setShowVariance(false);
      snapshot();
      setPreview({
        spec, grid: g.z, name, kind, crs, zDomain, variance: g.variance || null,
        provenance: {
          source: src, engine: 'mapping-surface-studio', cell_m: cell,
          method: kriged ? 'kriging' : gridMethod === 'tension' ? 'tension' : (rings.length ? 'tps-blocked' : 'tps'),
          tension: gridMethod === 'tension' ? { ...tensionOpts, p: g.p ?? null } : null,
          extent: beyond > 0 ? { beyond_m: beyond } : null,
          variogram: kriged ? { model: kriged.model, range_m: kriged.range, sill: kriged.sill, nugget: kriged.nugget, detrend: kriged.detrend, neighbourhood: g.neighbourhood } : null,
          control_points: points.length,
          points: points.map((p) => ({ well: p.well, x: p.x, y: p.y, z: p.z, md: p.md ?? null, extrapolated: !!p.extrapolated })),
          depth_ref: result.depthRef, placement: kind === 'structure' ? 'borehole' : null,
          ...(src.type === 'net' ? { surfaces: [src.upper, src.lower], measure: src.measure, codes: src.codes, thickness_basis: 'md' } : {}),
          skipped: result.skipped, extrapolated: result.extrapolated,
          z_convention: kind === 'structure' ? 'elevation' : 'raw',
          faults: faults.map((f) => ({ id: f.id, name: f.name })),
          boundary: boundary ? { id: boundary.id, name: boundary.name } : null,
          guide_points: guides.map((gp) => ({ x: gp.x, y: gp.y, z: gp.z, label: gp.well })),
        },
      });
      setPosted(postedNow);
      // E5: how well the map honours each well (the unmerged, un-guided picks)
      if (kind === 'structure') {
        const tieWells = result.points.map((p) => ({ well: p.well, x: p.x, y: p.y, depthM: -p.z }));
        const rows = mapResiduals(tieWells, g.z, spec);
        setResiduals({ title: 'Map against the wells', rows, stats: residualStats(rows) });
      } else setResiduals(null);
      setDisplaySurface({ origin_x: spec.x0, origin_y: spec.y0, nx: spec.nx, ny: spec.ny, dx: spec.dx, dy: spec.dy, name, kind, z_domain: zDomain, crs });
      setDisplayGrid(g.z);
      setSelectedId(null);
      const extras = [
        kriged ? describeVariogram(kriged) : null,
        kriged && g.merged ? `${g.merged} duplicate location${g.merged === 1 ? '' : 's'} averaged` : null,
        faults.length ? `${faults.length} fault-block polygon${faults.length === 1 ? '' : 's'}` : null,
        g.skippedBlocks ? `${g.skippedBlocks} block${g.skippedBlocks === 1 ? '' : 's'} with fewer than 3 control points left empty` : null,
        boundary ? `clipped to ${boundary.name}` : null,
        gridMethod === 'tension' && !kriged ? `spline in tension ${tensionOpts.tension}${tensionOpts.smoothing ? `, smoothing ${tensionOpts.smoothing}` : ''}` : null,
        reach ? `mapped ${beyond} m beyond the wells (${reach.extrapolatedNodes} extrapolated nodes; the dashed line is the wells' hull)` : null,
        guides.length ? `${guides.length} guide point${guides.length === 1 ? '' : 's'}` : null,
        ...merge.merged.map((m) => `${m.wells.join(' + ')} merged into one control point${kind === 'structure' || kind === 'isochore' ? ` (${fmtZ(m.spreadZ, { kind: 'isochore', z_domain: 'depth' })} apart)` : ''}`),
      ].filter(Boolean);
      setStatus(`${opts.prefix || ''}${describeGridResult({ name, result: { ...result, points }, spec, depthUnit, method: kriged ? 'kriging' : gridMethod === 'tension' ? 'tension' : 'tps' })}${extras.length ? ` With ${extras.join(', ')}.` : ''}`);
    } catch (e) {
      setStatus(/singular/.test(e.message)
        ? `${e.message} Check for wells in a straight line, or wells at one location with different values.`
        : e.message);
    } finally {
      setGridding(false);
    }
  };

  const selectSurface = async (id) => {
    setSelectedId(id);
    setPreview(null);
    setResiduals(null);
    setHullOverlay(null);
    setReplaceId(null);
    const s = surfaces.find((x) => x.id === id);
    if (!s) return;
    try {
      const grid = await loadGridM(backend, s);
      setDisplaySurface(s);
      setDisplayGrid(grid);
      const pts = s.provenance?.points;
      setPosted(Array.isArray(pts) ? Object.fromEntries(pts.map((p) => [p.well, { z: p.z, x: p.x, y: p.y }])) : null);
      if (s.provenance?.display) setMapSettings({ ...DEFAULT_MAP_DISPLAY, ...s.provenance.display });
      const st = surfaceStats(grid);
      setStatus(`${s.name}: ${st.count} live nodes, z ${fmtZ(st.min, s)} to ${fmtZ(st.max, s)}.`);
    } catch (e) { setStatus(e.message); }
  };

  const publish = async () => {
    if (!preview) return;
    try {
      const payload = {
        name: preview.name, kind: preview.kind, spec: preview.spec,
        zDomain: preview.zDomain || (preview.kind === 'attribute' ? 'attribute' : 'depth'),
        zUnit: preview.kind === 'attribute' ? null : (preview.zUnit || 'm'),
        crs: preview.crs || null,
        xyUnit: preview.crs ? crsUnit(preview.crs) : null,
        crsProvenance: preview.crs
          ? { derived_from: preview.provenance?.thickness ? 'surfaces' : 'wells' }
          : null,
        provenance: { ...preview.provenance, display: mapSettings }, grid: preview.grid,
      };
      const target = replaceId ? surfaces.find((x) => x.id === replaceId) : null;
      if (target) {
        // re-grid in place: same id and storage path, the previous frame
        // recorded in provenance.history so the change is auditable
        const prev = target.provenance || {};
        const history = [...(Array.isArray(prev.history) ? prev.history : []), {
          replaced_at: new Date().toISOString(),
          previous: { nx: target.nx, ny: target.ny, dx: target.dx, dy: target.dy, origin_x: target.origin_x, origin_y: target.origin_y, rotation_deg: target.rotation_deg || 0, z_unit: target.z_unit ?? null, z_domain: target.z_domain, kind: target.kind, cell_m: prev.cell_m ?? null, depth_ref: prev.depth_ref ?? null, control_points: prev.control_points ?? null },
        }];
        const saved = await backend.replaceSurfaceGrid(target, { ...payload, name: target.name, provenance: { ...payload.provenance, history } });
        setStatus(`Replaced ${saved.name} in place (${payload.spec.nx}×${payload.spec.ny}).`);
        setPreview(null);
        setReplaceId(null);
        await refresh();
        setSelectedId(saved.id);
        return;
      }
      const saved = await backend.saveSurface(payload);
      setStatus(`Published ${saved.name} to the registry.`);
      setPreview(null);
      await refresh();
      setSelectedId(saved.id);
    } catch (e) { setStatus(e.message); }
  };

  /** Re-grid a surface with its recorded source: the form is set from
   *  provenance and the next Publish replaces the row in place. */
  const regrid = (surface) => {
    const p = surface.provenance || {};
    if (!p.source?.type) { setStatus('This surface has no recorded gridding source (imported or computed), so it cannot be re-gridded here.'); return; }
    setSource(p.source);
    if (p.depth_ref) setDepthRef(p.depth_ref);
    if (p.cell_m) setCellM(String(p.cell_m));
    if (p.display) setMapSettings({ ...DEFAULT_MAP_DISPLAY, ...p.display });
    if (Array.isArray(p.guide_points)) setGuidePoints(p.guide_points.map((gp, i) => ({ ...gp, label: gp.label || `G${i + 1}` })));
    setGridFaultIds(new Set((p.faults || []).map((f) => f.id)));
    setClipBoundaryId(p.boundary?.id || '');
    setReplaceId(surface.id);
    setSelectedId(surface.id);
    setStatus(`Re-gridding ${surface.name}: adjust the source, reference or cell size, Grid, then Publish to replace it in place.`);
  };

  /** T1 (MAP-T1-017): put back the grid a re-grid replaced. */
  const restorePrevious = async (surface) => {
    const history = surface.provenance?.history || [];
    const last = history[history.length - 1];
    if (!last?.archive_path || !backend.downloadArchivedGrid) { setStatus('This surface has no kept previous grid to restore.'); return; }
    try {
      const pv = last.previous || {};
      const grid = await backend.downloadArchivedGrid(last.archive_path, { nx: pv.nx, ny: pv.ny });
      const spec = { x0: pv.origin_x ?? surface.origin_x, y0: pv.origin_y ?? surface.origin_y, dx: pv.dx, dy: pv.dy, nx: pv.nx, ny: pv.ny, ...(pv.rotation_deg ? { rotation_deg: pv.rotation_deg } : {}) };
      const provenance = { ...surface.provenance, history: history.slice(0, -1), restored_at: new Date().toISOString() };
      await backend.replaceSurfaceGrid(surface, { spec, grid, kind: pv.kind, zDomain: pv.z_domain, zUnit: pv.z_unit, provenance });
      setStatus(`Restored the previous grid of ${surface.name} (${pv.nx}×${pv.ny}).`);
      await refresh();
      setSelectedId(null);
    } catch (e) { setStatus(e.message); }
  };

  // T1 (E3): the prospect card of the measured closure
  const exportProspectCard = async () => {
    if (!grvData || grvData.kind !== 'closure' || !viewRef.current) return;
    try {
      const zf = (m) => fmtZ(m, { kind: 'structure', z_domain: 'depth' });
      const mm3 = (v) => `${(v / 1e6).toFixed(2)} million m³`;
      const mapBlob = await viewRef.current.toPng({ title: displaySurface.name, caption: `${depthUnit}, ${zConventionText}`, theme: 'print' });
      const rows = [
        ['Crest', zf(grvData.crestZ)],
        ['Spill', `${zf(grvData.spill.z)}${grvData.spill.limitedByEdge ? ' (map edge)' : ''}`],
        ['Contact', zf(grvData.contactM)],
        ['Closed area', `${grvData.areaKm2.toFixed(2)} km²`],
        ['GRV', mm3(grvData.grvM3)],
        ...(grvData.range ? [['GRV P90 / P50 / P10', `${(grvData.range.p90 / 1e6).toFixed(1)} / ${(grvData.range.p50 / 1e6).toFixed(1)} / ${(grvData.range.p10 / 1e6).toFixed(1)} million m³`]] : []),
      ];
      const note = grvData.open ? 'Not a trap volume: the closure runs off the mapped area, so the GRV is a minimum.' : '';
      const blob = await prospectCardPng({ mapBlob, title: `${displaySurface.name}: prospect`, rows, note });
      downloadBlob(blob, `${String(displaySurface.name).replace(/[^\w-]+/g, '_')}-prospect-card.png`);
      setStatus(`Exported the prospect card of ${displaySurface.name}.`);
    } catch (e) { setStatus(e.message); }
  };

  // T1 (MAP-T1-017): undo the last preview (grid, arithmetic, conversion)
  const undoStack = useRef([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const snapshot = () => {
    undoStack.current = [...undoStack.current.slice(-9), { preview, displaySurface, displayGrid, posted, residuals, hullOverlay, selectedId }];
    setUndoDepth(undoStack.current.length);
  };
  const undo = () => {
    const last = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (!last) return;
    setPreview(last.preview); setDisplaySurface(last.displaySurface); setDisplayGrid(last.displayGrid);
    setPosted(last.posted); setResiduals(last.residuals); setHullOverlay(last.hullOverlay); setSelectedId(last.selectedId);
    setStatus(last.preview ? `Back to ${last.preview.name} (unsaved).` : last.displaySurface ? `Back to ${last.displaySurface.name}.` : 'Back to the empty map.');
  };

  const rename = async (surface, name) => {
    try {
      await backend.updateSurface(surface.id, { name });
      setStatus(`Renamed to ${name}.`);
      await refresh();
    } catch (e) { setStatus(e.message); }
  };

  const exportAs = async (surface, formatKey) => {
    try {
      const grid = await backend.downloadSurfaceGrid(surface);
      const { text, fileName, unit } = exportSurfaceText(surface, grid, formatKey, { unit: depthUnit });
      downloadText(text, fileName);
      setStatus(`Exported ${surface.name} as ${fileName}${unit ? ` (${unit}, elevation negative down)` : ''}.`);
    } catch (e) { setStatus(e.message); }
  };

  const pointsCsv = (surface) => {
    try {
      const { text, fileName } = controlPointsCsv(surface, { unit: depthUnit });
      downloadText(text, fileName, 'text/csv');
      setStatus(`Exported the control points of ${surface.name} as ${fileName}.`);
    } catch (e) { setStatus(e.message); }
  };

  const onImported = async (saved) => {
    setStatus(`Imported ${saved.name} (${saved.nx}×${saved.ny}) into the registry.`);
    await refresh();
    const grid = await loadGridM(backend, saved).catch(() => null);
    if (grid) {
      setDisplaySurface(saved);
      setDisplayGrid(grid);
      setPosted(null);
      setPreview(null);
      setSelectedId(saved.id);
    }
  };

  const runArith = async () => {
    const def = ARITH_OPS.find((o) => o.key === arith.op);
    const a = surfaces.find((x) => x.id === isoPair.a);
    const b = surfaces.find((x) => x.id === isoPair.b);
    if (!a) { setStatus('Pick surface A.'); return; }
    if (def?.needsB && !b) { setStatus(arith.op === 'thickness' ? 'Pick a top and a base surface for the isochore.' : 'Pick surface B.'); return; }
    try {
      const [ga, gb] = await Promise.all([loadGridM(backend, a), def?.needsB ? loadGridM(backend, b) : null]);
      let boundary = null;
      if (def?.needsBoundary) {
        const row = boundaryRows.find((r) => r.id === clipBoundaryId);
        if (!row) throw new Error('Pick a boundary polygon in the Polygons section.');
        boundary = { id: row.id, name: row.name, ring: await ringFor(row) };
      }
      const r = runArithmetic({ op: arith.op, a: { surface: a, grid: ga }, b: b ? { surface: b, grid: gb } : null, k: arith.k, boundary });
      snapshot();
      setPreview({
        spec: r.spec, grid: r.grid, name: r.name, kind: r.kind, zDomain: r.zDomain,
        crs: consensusTag([a.crs, ...(b ? [b.crs] : [])]),
        provenance: r.provenance,
      });
      setDisplaySurface({ ...r.spec, origin_x: r.spec.x0, origin_y: r.spec.y0, name: r.name, kind: r.kind, z_domain: r.zDomain, crs: a.crs });
      setDisplayGrid(r.grid);
      setSelectedId(null);
      setPosted(null);
      setStatus(`${arith.op === 'thickness' ? 'Isochore' : 'Computed'} ${r.name}${isLengthSurface({ kind: r.kind, z_domain: r.zDomain }) ? ` (${depthUnit})` : ''}: review, then Publish.`);
    } catch (e) { setStatus(e.message); }
  };

  const runGrv = (seedIndex = null) => {
    if (!displayGrid || !displaySurface || !isLengthSurface(displaySurface) || displaySurface.kind === 'isochore') {
      setStatus('Quick GRV needs a depth structure surface on the map.');
      return;
    }
    try {
      const c = Number(grvContact);
      if (grvContact === '' || !Number.isFinite(c)) throw new Error(`Type the contact in ${depthUnit}: an elevation (negative below datum) or a depth below datum.`);
      // T1 (MAP-T1-004): a positive number above the whole map whose
      // negative lies inside it is a depth below datum, read as such
      const { contactM, readAsDepth } = interpretContact(fromDisplay(c, depthUnit), displayGrid);
      const spec = specOfSurface(displaySurface);
      const r = quickGrv({ spec, gridM: displayGrid, contactM, seedIndex });
      // T1 (E2): with a kriged surface on screen, the GRV range from the
      // kriging standard deviation (z -/+ 1.2816 sigma: P90 low, P10 high).
      // Every node moves together, a fully correlated structural case.
      if (r.kind === 'closure' && preview?.variance && displayGrid === preview.grid) {
        const k = 1.2815515655446004;
        const shift = (sgn) => Float32Array.from(displayGrid, (v, i) => {
          const s2 = preview.variance[i];
          return Math.abs(v) >= 1e29 || !Number.isFinite(s2) || s2 < 0 ? v : v + sgn * k * Math.sqrt(s2);
        });
        const at = (grid) => {
          try { return quickGrv({ spec, gridM: grid, contactM, seedIndex: r.closure.crest.index }).grvM3; } catch { return 0; }
        };
        r.range = { p90: at(shift(-1)), p50: r.grvM3, p10: at(shift(1)) };
      }
      const zfmt = (m) => (depthPositive
        ? `${+(-toDisplay(m, depthUnit)).toFixed(1)} ${depthUnit} below datum`
        : `${+toDisplay(m, depthUnit).toFixed(1)} ${depthUnit}`);
      const rangeTxt = r.range ? ` Structural range from the kriging variance (fully correlated): P90 ${(r.range.p90 / 1e6).toFixed(2)}, P50 ${(r.range.p50 / 1e6).toFixed(2)}, P10 ${(r.range.p10 / 1e6).toFixed(2)} million m³.` : '';
      const text = `${readAsDepth && !depthPositive ? `Read ${c} as a depth below datum (elevation ${zfmt(contactM)}). ` : ''}${describeGrv(r, { contactLabel: zfmt(contactM), fmtZ: zfmt })}${rangeTxt}`;
      setGrvData(r);
      setGrvResult(text);
      setStatus(text);
    } catch (e) { setStatus(e.message); }
  };
  // a new map on screen invalidates the last read-out
  useEffect(() => { setGrvData(null); setGrvResult(null); }, [displayGrid]);
  // the contour overlay follows the displayed frame
  useEffect(() => {
    let live = true;
    const src = surfaces.find((x) => x.id === contourFromId);
    if (!src || !displaySurface || !displayGrid) { setContourOverlay(null); return undefined; }
    (async () => {
      try {
        const g = await loadGridM(backend, src);
        const onto = resampleTo(g, specOfSurface(src), specOfSurface(displaySurface));
        if (live) setContourOverlay({ surface: src, grid: onto });
      } catch (e) { if (live) { setContourOverlay(null); setStatus(e.message); } }
    })();
    return () => { live = false; };
  }, [contourFromId, displaySurface, displayGrid, surfaces, backend]);

  const runTimeDepth = async () => {
    const src = displaySurface;
    if (!src || src.z_domain !== 'time' || !displayGrid) { setStatus('Select a time (TWT) surface to convert.'); return; }
    const spec = specOfSurface(src);
    const tieWells = tdTop ? wellDepthsForTop(wells || [], tdTop).wells : [];
    // T1 (MAP-T1-009): average velocity from the wells, the routine method
    if (tdMethod === 'wells') {
      if (!tdTop) { setStatus('Pick the top that this time horizon marks.'); return; }
      try {
        const r = convertWithWellVelocity({ twtMs: displayGrid, spec, wells: tieWells });
        const name = `${src.name} depth (well velocity)`;
        snapshot();
      setPreview({
          spec, grid: Float32Array.from(r.zM), name, kind: 'structure', zDomain: 'depth', zUnit: 'm', crs: src.crs || null,
          provenance: {
            engine: 'mapping-surface-studio', z_convention: 'elevation',
            time_depth: { method: 'average_velocity_from_wells', top: tdTop, wells: r.ties.map((t) => ({ well: t.well, twt_ms: t.twtMs, vavg_mps: t.vavg })), source_surface: src.id, converted_at: new Date().toISOString() },
          },
        });
        setDisplaySurface({ ...spec, origin_x: spec.x0, origin_y: spec.y0, name, kind: 'structure', z_domain: 'depth', z_unit: 'm', crs: src.crs || null });
        setDisplayGrid(Float32Array.from(r.zM));
        setSelectedId(null);
        setPosted(Object.fromEntries(tieWells.map((w) => [w.well, { z: -w.depthM, x: w.x, y: w.y }])));
        setResiduals({ title: `Depth map against ${tdTop}`, rows: r.residuals, stats: r.stats });
        const vfmt = (v) => `${Math.round(v).toLocaleString()} m/s`;
        setStatus(`Converted ${src.name} with average velocity from ${r.ties.length} wells on ${tdTop} (${vfmt(r.vRange[0])} to ${vfmt(r.vRange[1])})${r.skipped.length ? `; ${r.skipped.length} well${r.skipped.length === 1 ? '' : 's'} skipped (${r.skipped.map((k) => k.well).join(', ')})` : ''}: review, then Publish.`);
      } catch (e) { setStatus(e.message); }
      return;
    }
    const entry = velocityModels.find((m) => m.id === tdModelId);
    if (!entry) { setStatus('Pick a velocity model.'); return; }
    const { model, reason } = usableModel(entry);
    if (!model) { setStatus(reason); return; }
    try {
      let zM = twtGridToElevation(displayGrid, model, { unit: 'm' });
      let corr = null;
      if (tdCorrect && tdTop) {
        corr = correctToWells({ zM, spec, wells: tieWells });
        zM = corr.zM;
      }
      const z = tdUnit === 'ft' ? Float32Array.from(zM, (v) => (Math.abs(v) >= 1e29 ? v : v / 0.3048)) : Float32Array.from(zM);
      const name = `${src.name} depth (${tdUnit})`;
      snapshot();
      setPreview({
        spec, grid: z, name, kind: 'structure', zDomain: 'depth', zUnit: tdUnit, crs: src.crs || null,
        provenance: {
          engine: 'mapping-surface-studio', z_convention: 'elevation',
          time_depth: { volume: { id: entry.id, name: entry.name }, model: { v0: model.v0, k: model.k }, unit: tdUnit, source_surface: src.id, converted_at: new Date().toISOString(),
            ...(corr ? { corrected_to: tdTop, radius_m: corr.radius, rms_before_m: corr.before.rms, rms_after_m: corr.after.rms } : {}) },
        },
      });
      setDisplaySurface({ ...spec, origin_x: spec.x0, origin_y: spec.y0, name, kind: 'structure', z_domain: 'depth', z_unit: tdUnit, crs: src.crs || null });
      // the workstation holds metres
      setDisplayGrid(Float32Array.from(zM));
      setSelectedId(null);
      setPosted(tieWells.length ? Object.fromEntries(tieWells.map((w) => [w.well, { z: -w.depthM, x: w.x, y: w.y }])) : null);
      if (tieWells.length) {
        const rows = corr ? corr.residuals : mapResiduals(tieWells, zM, spec);
        setResiduals({ title: `Depth map against ${tdTop}`, rows, stats: residualStats(rows) });
      } else setResiduals(null);
      const fmtM = (v) => (v == null ? 'n/a' : fmtZ(v, { kind: 'isochore', z_domain: 'depth' }));
      setStatus(`Converted ${src.name} to depth with ${describeVelocity(model)} (${tdUnit}, elevation)${corr ? `, then corrected to ${tdTop}: RMS mis-tie ${fmtM(corr.before.rms)} before, ${fmtM(corr.after.rms)} after` : ''}: review, then Publish.`);
    } catch (e) { setStatus(e.message); }
  };

  // drawing (MS3)
  const startDraw = (mode) => {
    setDrawMode(mode); setPending([]); setGuideAt(null); setPolyName(''); setContourDrag(null);
    setStatus(mode === 'guide' ? 'Click the map where the guide point goes, then type its value.'
      : mode === 'contour' ? 'Press on a contour line, drag it to where it belongs and release. The moved line becomes guide points and the surface re-grids through them.'
        : `Click the map to place ${mode === 'fault' ? 'fault-block' : mode === 'facies' ? 'facies' : mode === 'paleo' ? 'paleogeography' : 'boundary'} polygon vertices (3 or more), then name it${mode === 'facies' ? ' (a lithology name colours it)' : mode === 'paleo' ? ' (an environment name colours it)' : ''} and Save.`);
  };
  const cancelDraw = () => { setDrawMode(null); setPending([]); setGuideAt(null); setContourDrag(null); setStatus('Drawing cancelled.'); };

  // MS5 contour editing on the displayed grid: the contours the map is
  // drawing (same interval rule as MapCanvas), a pick tolerance of two
  // cells, guide spacing of two cells along the moved line
  const displaySpec = displaySurface ? { x0: displaySurface.origin_x, y0: displaySurface.origin_y, dx: displaySurface.dx, dy: displaySurface.dy, nx: displaySurface.nx, ny: displaySurface.ny } : null;
  const contoursForEdit = () => {
    if (!displayGrid || !displaySpec) return null;
    const plan = contourPlan({ grid: displayGrid, typed: mapSettings.contourStep, unit: depthUnit, isLength: isLengthSurface(displaySurface) });
    return contourPaths(displayGrid, displaySpec, { step: plan.stepM });
  };
  const onDragStart = (world) => {
    if (drawMode !== 'contour' || !displaySpec) return false;
    const contours = contoursForEdit();
    const tol = 2 * Math.max(displaySpec.dx, displaySpec.dy);
    try {
      const plan = contourEditPlan(contours, world, world, { tolerance: tol, spacing: tol });
      setContourDrag({ level: plan.level, path: plan.path, from: world, to: world });
      setStatus(`Picked the ${fmtZ(plan.level)} contour. Drag it to where it belongs and release.`);
      return true;
    } catch (e) { setStatus(e.message); return false; }
  };
  const onDrag = (world) => setContourDrag((d) => (d ? { ...d, to: world } : d));
  const onDragEnd = async (world, { moved } = {}) => {
    const d = contourDrag;
    setContourDrag(null);
    if (!d) return;
    if (!moved) { setStatus('The contour was not moved. Press on it and drag to a new position.'); return; }
    const spacing = 2 * Math.max(displaySpec.dx, displaySpec.dy);
    contourCounter.current += 1;
    const prefix = `C${contourCounter.current}`;
    try {
      const plan = contourEditPlan({ levels: [d.level], paths: [[d.path]] }, d.from, world, { tolerance: Infinity, spacing, prefix });
      const guides = [...guidePoints, ...plan.guides];
      setGuidePoints(guides);
      setDrawMode(null);
      if (source.type === 'top' && source.key) {
        setStatus(`Moved the ${fmtZ(d.level)} contour: ${plan.guides.length} guide points added. Re-gridding through them.`);
        await runGrid({ guides, prefix: `Moved the ${fmtZ(d.level)} contour (${plan.guides.length} guide points). ` });
      } else {
        setStatus(`Moved the ${fmtZ(d.level)} contour: ${plan.guides.length} guide points added. Grid a top to apply them.`);
      }
    } catch (e) { setStatus(e.message); }
  };
  // MS5: swap the map between the kriged surface and its variance
  const toggleVariance = (on) => {
    if (!preview?.variance) return;
    setShowVariance(on);
    if (on) {
      setDisplaySurface({ ...displaySurface, kind: 'attribute', z_domain: 'attribute', name: `${preview.name} kriging variance` });
      setDisplayGrid(preview.variance);
      setStatus('Showing the kriging variance (metres squared): low where the wells constrain the surface, high where it is guessed. Untick to return to the surface.');
    } else {
      setDisplaySurface({ ...displaySurface, kind: preview.kind, z_domain: preview.zDomain, name: preview.name });
      setDisplayGrid(preview.grid);
      setStatus(`Showing ${preview.name}.`);
    }
  };
  const hullLine = hullOverlay && hullOverlay.length > 2 ? [{ points: [...hullOverlay, hullOverlay[0]].flatMap((q) => [q.x, q.y]), color: 'rgba(148, 163, 184, 0.9)', width: 1.2, dash: [6, 4] }] : [];
  const editOverlays = contourDrag ? [...hullLine,
    { points: contourDrag.path, color: 'rgba(244, 114, 182, 0.5)', width: 1.5, dash: [4, 3] },
    { points: translatePath(contourDrag.path, contourDrag.to.x - contourDrag.from.x, contourDrag.to.y - contourDrag.from.y), color: '#f472b6', width: 2.5 },
  ] : hullLine;
  const onMapClick = ({ x, y }) => {
    if (drawMode === 'guide') { setGuideAt({ x, y }); return; }
    if (drawMode === 'grvpick') {
      setDrawMode(null);
      const idx = displaySurface ? nodeAt(specOfSurface(displaySurface), x, y) : -1;
      if (idx < 0) { setStatus('That point is off the map.'); return; }
      runGrv(idx);
      return;
    }
    if (drawMode) setPending((p) => [...p, [x, y]]);
  };
  const savePolygon = async () => {
    try {
      const kind = drawMode === 'fault' ? POLYGON_KINDS.fault : drawMode === 'facies' ? POLYGON_KINDS.facies : drawMode === 'paleo' ? POLYGON_KINDS.paleo : POLYGON_KINDS.boundary;
      // ST4: a facies or paleogeography polygon takes the vocabulary colour of its name when the name resolves
      const named = kind === POLYGON_KINDS.facies ? resolveLithology(polyName) : kind === POLYGON_KINDS.paleo ? resolveEnvironment(polyName) : null;
      const payload = polygonPayload({
        name: polyName, kind, vertices: pending,
        crs: displaySurface?.crs || null, xyUnit: displaySurface?.crs ? crsUnit(displaySurface.crs) : null,
        drawnOn: displaySurface?.id || null,
        color: named?.colour || null,
      });
      const row = await backend.saveCulture(payload);
      setCultureFeatures((m) => new Map(m).set(row.id, payload.features));
      setVisibleCultureIds((set) => new Set([...set, row.id]));
      setCultureTick((k) => k + 1);
      setDrawMode(null);
      setPending([]);
      setPolyName('');
      setStatus(`Saved ${kind === POLYGON_KINDS.fault ? 'fault-block polygon' : POLYGON_KIND_LABEL[kind]} ${row.name} (${payload.provenance.vertices} vertices).`);
    } catch (e) { setStatus(e.message); }
  };
  const addGuide = () => {
    const v = Number(guideValue);
    if (!guideAt) { setStatus('Click the map first.'); return; }
    if (!Number.isFinite(v)) { setStatus(`Type the guide value in ${depthUnit} (${zConventionText}).`); return; }
    setGuidePoints((g) => [...g, { x: guideAt.x, y: guideAt.y, z: fromDisplay(depthPositive ? -v : v, depthUnit), label: `G${g.length + 1}` }]);
    setGuideAt(null);
    setGuideValue('');
    setDrawMode(null);
    setStatus('Guide point added: it grids with the wells on the next Grid.');
  };
  const deletePolygon = async (row) => {
    try {
      await backend.deleteCulture(row);
      setVisibleCultureIds((set) => { const n = new Set(set); n.delete(row.id); return n; });
      setGridFaultIds((set) => { const n = new Set(set); n.delete(row.id); return n; });
      if (clipBoundaryId === row.id) setClipBoundaryId('');
      setCultureTick((k) => k + 1);
      setStatus(`Deleted ${row.name}.`);
    } catch (e) { setStatus(e.message); }
  };

  // T1 (MAP-T1-005): delete asks first, hides the row at once, and only
  // reaches the registry after UNDO_MS; a second delete flushes the first
  const UNDO_MS = 10000;
  const commitDelete = useCallback(async (pd) => {
    clearTimeout(pd.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    try { await backend.deleteSurface(pd.surface); setStatus(`Deleted ${pd.surface.name}.`); }
    catch (e) { setStatus(e.message); }
    await refresh();
  }, [backend, refresh]);
  const del = (surface) => setConfirmDelete(surface);
  const confirmDel = () => {
    const surface = confirmDelete;
    setConfirmDelete(null);
    if (!surface) return;
    if (pendingDeleteRef.current) commitDelete(pendingDeleteRef.current);
    if (selectedId === surface.id) { setDisplayGrid(null); setDisplaySurface(null); setPosted(null); setSelectedId(null); }
    const pd = { surface };
    pd.timer = setTimeout(() => commitDelete(pd), UNDO_MS);
    pendingDeleteRef.current = pd;
    setPendingDelete(pd);
    setStatus(`Deleting ${surface.name} in ${UNDO_MS / 1000} s. Undo keeps it.`);
  };
  const undoDelete = () => {
    const pd = pendingDeleteRef.current;
    if (!pd) return;
    clearTimeout(pd.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    setStatus(`Kept ${pd.surface.name}.`);
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

  const exportPng = async () => {
    if (!viewRef.current || !displaySurface) return;
    try {
      const crsTxt = displaySurface.crs ? ` · ${displaySurface.crs}` : '';
      const unitTxt = isLengthSurface(displaySurface) ? `${depthUnit}, ${displaySign(displaySurface, depthPositive) < 0 ? 'depth positive down' : 'elevation negative down'}` : 'attribute';
      // T1 (MAP-T1-010): the export is the white report page, not the dark screen
      const blob = await viewRef.current.toPng({
        title: displaySurface.name,
        caption: `${displaySurface.kind || 'surface'} · ${unitTxt}${crsTxt} · ${new Date().toISOString().slice(0, 10)}`,
        theme: 'print',
      });
      downloadBlob(blob, `${String(displaySurface.name).replace(/[^\w-]+/g, '_')}-map.png`);
      setStatus(`Exported ${displaySurface.name} as PNG.`);
    } catch (e) { setStatus(e.message); }
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
        onClick={() => changeDepthUnit(depthUnit === 'ft' ? 'm' : 'ft')}>
        depth: {depthUnit}
      </button>
      <button type="button" data-testid="map-depth-sign"
        className="px-2 py-0.5 text-[11px] rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
        title="Show structure maps as elevation (negative below datum) or as positive depth below datum. Storage is unchanged."
        onClick={() => setDepthPositive((d) => !d)}>
        {depthPositive ? 'depth +' : 'elevation'}
      </button>
      <button type="button" data-testid="map-export-png"
        className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        disabled={!displayGrid} title="Download the map as a titled PNG" onClick={exportPng}>
        <ImageIcon className="w-3.5 h-3.5" /> PNG
      </button>
      <button type="button" data-testid="map-undo" disabled={!undoDepth}
        className="px-2 py-0.5 text-[11px] rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        title="Undo the last grid, arithmetic or depth conversion preview" onClick={undo}>
        Undo
      </button>
      <Link to={`${appPath(MAPPING_ID)}/help`} data-testid="map-help" title="Open the Mapping & Surface Studio help guide"
        className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-slate-700 text-cyan-300 hover:bg-slate-800">
        <HelpCircle className="w-3.5 h-3.5" /> Help
      </Link>
      {linkedWellIds && (
        <button type="button" data-testid="map-linked-clear" className="px-2 py-0.5 text-[11px] rounded border border-amber-700/60 text-amber-300 hover:bg-amber-500/10"
          title="The link posted only some wells; show every well again" onClick={() => setLinkedWellIds(null)}>
          {linkedWellIds.length} linked wells · show all
        </button>
      )}
      {preview && (
        <button type="button" data-testid="map-publish"
          className="ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
          onClick={publish}>
          <UploadCloud className="w-3.5 h-3.5" /> {replaceId ? 'Replace surface' : 'Publish surface'}
        </button>
      )}
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="map-status" className="truncate">{status}</span>
      {pendingDelete && (
        <button type="button" data-testid="map-delete-undo" onClick={undoDelete}
          className="px-2 py-0.5 rounded border border-amber-700/60 text-amber-300 hover:bg-amber-500/10 whitespace-nowrap">
          Undo delete
        </button>
      )}
      <span className="ml-auto whitespace-nowrap">{surfaces.length} surfaces{preview ? ' · unsaved preview' : ''}</span>
      <span className="whitespace-nowrap text-slate-600" data-testid="map-status-unit">depth: {depthUnit} · {zConventionText}</span>
    </div>
  );

  // CRS guard: wells convert into the displayed surface's frame when
  // both tags are known; local-grid wells drop from a georeferenced
  // map. Unknown tags render as before (legacy behavior).
  const displayWells = useMemo(() => {
    const base = linkedWellIds ? (wells || []).filter((w) => linkedWellIds.includes(w.id)) : wells;
    if (!base || !displaySurface || displaySurface.crs === undefined) return base;
    const r = placeWellsForHost(
      base.map((w) => ({ ...w, surfaceX: w.surface_x, surfaceY: w.surface_y })),
      displaySurface.crs,
    );
    return r.wells.map((w) => ({ ...w, surface_x: w.surfaceX, surface_y: w.surfaceY }));
  }, [wells, displaySurface, linkedWellIds]);

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry…</div>
  ) : !displayGrid ? (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-sm" data-testid="map-empty">
      <span>Grid a top from the left, or select a surface.</span>
      {!sample && backend.canImportCulture && (
        <Link to="?sample=1" data-testid="map-try-sample" className="text-cyan-400 hover:underline text-xs">
          New here? Try it on sample data (nothing is saved)
        </Link>
      )}
    </div>
  ) : (
    <div className="h-full min-h-0 p-3 flex flex-col">
      <MapCanvas
        ref={viewRef}
        surface={displaySurface}
        grid={displayGrid}
        wells={displayWells}
        cultureLayers={cultureLayers}
        posted={posted}
        markers={[
          ...guidePoints.map((gp) => ({ x: gp.x, y: gp.y, label: `${gp.label} ${fmtZ(gp.z)}` })),
          ...(guideAt ? [{ x: guideAt.x, y: guideAt.y, label: 'value?' }] : []),
          ...(grvData?.kind === 'closure' ? [{ x: grvData.spill.x, y: grvData.spill.y, label: `spill ${fmtZ(grvData.spill.z, { kind: 'structure', z_domain: 'depth' })}` }] : []),
        ]}
        pendingVertices={pending}
        drawing={!!drawMode}
        onMapClick={onMapClick}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        overlays={editOverlays}
        display={{ unit: depthUnit, isLength: isLengthSurface(displaySurface), depthPositive }}
        contourOverlay={contourOverlay}
        settings={mapSettings}
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
          surfaces={pendingDelete ? surfaces.filter((x) => x.id !== pendingDelete.surface.id) : surfaces}
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
          environmentRows={environmentRows}
          depthRef={depthRef}
          onDepthRef={setDepthRef}
          cellM={cellM}
          onCellM={setCellM}
          onGrid={runGrid}
          gridding={gridding}
          gridMethod={gridMethod}
          onGridMethod={setGridMethod}
          variogram={variogram}
          tensionOpts={tensionOpts}
          onTensionOpts={setTensionOpts}
          extent={extent}
          onExtent={setExtent}
          onVariogram={setVariogram}
          onFitVariogram={fitVariogramFromWells}
          variance={preview?.variance ? { shown: showVariance, onToggle: toggleVariance } : null}
          onImport={() => setImportOpen(true)}
          onExport={exportAs}
          onPointsCsv={pointsCsv}
          onRename={rename}
          onRegrid={regrid}
          onRestore={restorePrevious}
          replaceId={replaceId}
          appPaths={appPaths}
          wells={displayWells || []}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <div className="p-2 space-y-2 text-xs" data-testid="map-controls">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><SlidersHorizontal className="w-3 h-3" /> Display</div>
            <label className="flex items-center gap-2 text-slate-300">
              <span className="w-24 shrink-0">Contour interval</span>
              <input className={`${selCls} flex-1`} data-testid="map-contour-interval" value={mapSettings.contourStep}
                placeholder="auto" title={`Contour interval in ${isLengthSurface(displaySurface) ? depthUnit : 'attribute units'}; blank = automatic`}
                onChange={(e) => setSetting('contourStep', e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <span className="w-24 shrink-0">Colour map</span>
              <select className={`${selCls} flex-1 min-w-0`} data-testid="map-colormap" value={mapSettings.colormap}
                onChange={(e) => setSetting('colormap', e.target.value)}>
                {MAP_COLORMAPS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <span className="w-24 shrink-0">Contours from</span>
              <select className={`${selCls} flex-1 min-w-0`} data-testid="map-contour-from" value={contourFromId}
                title="Draw the contours of another surface over this one's colours (structure over amplitude or net sand)"
                onChange={(e) => setContourFromId(e.target.value)}>
                <option value="">this surface</option>
                {surfaces.filter((x) => x.id !== displaySurface?.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300">
              {[
                ['reverse', 'Reverse colours'], ['labels', 'Contour labels'], ['names', 'Well names'],
                ['posted', 'Posted values'], ['legend', 'Legend'], ['scaleBar', 'Scale bar'],
                ['north', 'North arrow'], ['axes', 'Axes'],
              ].map(([key, text]) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" data-testid={`map-show-${key}`} checked={!!mapSettings[key]}
                    onChange={(e) => setSetting(key, e.target.checked)} />
                  <span>{text}</span>
                </label>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Pentagon className="w-3 h-3" /> Polygons</div>
            {!drawMode ? (
              <div className="flex gap-1">
                <button type="button" data-testid="map-draw-fault" disabled={!displayGrid} title="Draw a fault-block polygon: the surface is gridded independently inside and outside it"
                  className="flex-1 px-2 py-1 rounded border border-amber-700/60 text-amber-300 hover:bg-amber-500/10 disabled:opacity-40" onClick={() => startDraw('fault')}>
                  <Pentagon className="w-3.5 h-3.5 inline mr-1" />Fault block
                </button>
                <button type="button" data-testid="map-draw-boundary" disabled={!displayGrid} title="Draw a boundary: gridding can clip to it"
                  className="flex-1 px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40" onClick={() => startDraw('boundary')}>
                  <Square className="w-3.5 h-3.5 inline mr-1" />Boundary
                </button>
              </div>
            ) : null}
            {!drawMode ? (
              <div className="flex gap-1">
                <button type="button" data-testid="map-draw-facies" disabled={!displayGrid} title="Draw a facies polygon (Stratigraphy ST4): name it after a lithology to colour it"
                  className="flex-1 px-2 py-1 rounded border border-orange-700/60 text-orange-300 hover:bg-orange-500/10 disabled:opacity-40" onClick={() => startDraw('facies')}>
                  <Pentagon className="w-3.5 h-3.5 inline mr-1" />Facies
                </button>
                <button type="button" data-testid="map-draw-paleo" disabled={!displayGrid} title="Draw a paleogeography polygon (Stratigraphy ST4): name it after an environment to colour it"
                  className="flex-1 px-2 py-1 rounded border border-sky-700/60 text-sky-300 hover:bg-sky-500/10 disabled:opacity-40" onClick={() => startDraw('paleo')}>
                  <Pentagon className="w-3.5 h-3.5 inline mr-1" />Paleogeography
                </button>
              </div>
            ) : drawMode !== 'guide' ? (
              <div className="space-y-1 rounded border border-amber-700/40 p-1.5" data-testid="map-draw-form">
                <div className="text-slate-300"><span data-testid="map-draw-count">{pending.length}</span> vertices on the map ({drawMode === 'fault' ? 'fault block' : drawMode === 'facies' ? 'facies' : drawMode === 'paleo' ? 'paleogeography' : 'boundary'})</div>
                <input className={selCls} data-testid="map-polygon-name" placeholder="Polygon name" value={polyName} onChange={(e) => setPolyName(e.target.value)} />
                <div className="flex gap-1">
                  <button type="button" data-testid="map-polygon-save" disabled={pending.length < 3 || !polyName.trim()}
                    className="flex-1 px-2 py-1 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40" onClick={savePolygon}>Save</button>
                  <button type="button" data-testid="map-draw-undo" disabled={!pending.length} className="px-2 py-1 rounded border border-slate-700 text-slate-300 disabled:opacity-40" onClick={() => setPending((p) => p.slice(0, -1))}>Undo</button>
                  <button type="button" data-testid="map-draw-cancel" className="px-2 py-1 rounded border border-slate-700 text-slate-300" onClick={cancelDraw}>Cancel</button>
                </div>
              </div>
            ) : null}
            {polygonRows.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 py-0.5 text-slate-300" data-testid={`map-polygon-row-${c.name}`}>
                <button type="button" title={visibleCultureIds.has(c.id) ? 'Hide' : 'Show'} className="text-slate-400" onClick={() => toggleCultureLayer(c)}>
                  {visibleCultureIds.has(c.id) ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.style?.color || '#eab308' }} />
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] text-slate-500">{POLYGON_KIND_LABEL[c.kind] || c.kind}</span>
                {STRAT_POLYGON_KINDS.includes(c.kind) ? (
                  <span className="ml-auto text-[10px] text-slate-500" data-testid={`map-facies-legend-${c.name}`}>legend</span>
                ) : c.kind === POLYGON_KINDS.fault ? (
                  <label className="ml-auto flex items-center gap-1 text-[10px] cursor-pointer" title="Use as a fault block when gridding">
                    <input type="checkbox" data-testid={`map-fault-use-${c.name}`} checked={gridFaultIds.has(c.id)}
                      onChange={(e) => setGridFaultIds((set) => { const n = new Set(set); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                    grid
                  </label>
                ) : (
                  <label className="ml-auto flex items-center gap-1 text-[10px] cursor-pointer" title="Clip gridding to this boundary">
                    <input type="radio" name="map-clip" data-testid={`map-clip-use-${c.name}`} checked={clipBoundaryId === c.id}
                      onChange={() => setClipBoundaryId(clipBoundaryId === c.id ? '' : c.id)} onClick={() => { if (clipBoundaryId === c.id) setClipBoundaryId(''); }} />
                    clip
                  </label>
                )}
                {c.is_own && (
                  <button type="button" title={`Delete ${c.name}`} data-testid={`map-polygon-delete-${c.name}`} className="text-slate-500 hover:text-red-400" onClick={() => deletePolygon(c)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!polygonRows.length && <p className="text-[10px] text-slate-600">No polygons yet. Fault blocks split the gridding; a boundary clips it.</p>}

            <div className="pt-2 border-t border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> Guide points</div>
            {drawMode === 'guide' ? (
              <div className="space-y-1 rounded border border-pink-700/40 p-1.5" data-testid="map-guide-form">
                <div className="text-slate-300">{guideAt ? `At X ${guideAt.x.toFixed(0)}, Y ${guideAt.y.toFixed(0)}` : 'Click the map to place the point'}</div>
                <div className="flex gap-1">
                  <input className={`${selCls} flex-1`} data-testid="map-guide-value" placeholder={`value (${depthUnit}, ${depthPositive ? 'depth' : 'elevation'})`} value={guideValue} onChange={(e) => setGuideValue(e.target.value)} />
                  <button type="button" data-testid="map-guide-add" disabled={!guideAt} className="px-2 py-1 rounded border border-emerald-700/60 text-emerald-300 disabled:opacity-40" onClick={addGuide}>Add</button>
                  <button type="button" data-testid="map-guide-cancel" className="px-2 py-1 rounded border border-slate-700 text-slate-300" onClick={cancelDraw}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" data-testid="map-guide-point" disabled={!displayGrid}
                className="w-full px-2 py-1 rounded border border-pink-700/60 text-pink-300 hover:bg-pink-500/10 disabled:opacity-40" onClick={() => startDraw('guide')}>
                <MapPin className="w-3.5 h-3.5 inline mr-1" />Add a guide point
              </button>
            )}
            {drawMode === 'contour' ? (
              <div className="space-y-1 rounded border border-pink-700/40 p-1.5" data-testid="map-contour-form">
                <div className="text-slate-300">{contourDrag ? `Moving the ${fmtZ(contourDrag.level)} contour` : 'Press on a contour, drag, release'}</div>
                <button type="button" data-testid="map-contour-cancel" className="px-2 py-1 rounded border border-slate-700 text-slate-300" onClick={cancelDraw}>Cancel</button>
              </div>
            ) : (
              <button type="button" data-testid="map-contour-edit" disabled={!displayGrid || !isLengthSurface(displaySurface)}
                title="Drag a contour to a new position; it becomes guide points at its value and the surface re-grids through them"
                className="w-full px-2 py-1 rounded border border-pink-700/60 text-pink-300 hover:bg-pink-500/10 disabled:opacity-40" onClick={() => startDraw('contour')}>
                <Spline className="w-3.5 h-3.5 inline mr-1" />Move a contour
              </button>
            )}
            {guidePoints.length > 0 && (
              <button type="button" data-testid="map-guide-clear" className="w-full px-2 py-0.5 text-[10px] rounded border border-slate-800 text-slate-500 hover:text-slate-300" onClick={() => setGuidePoints([])}>Clear all guide points</button>
            )}
            {guidePoints.map((gp, i) => (
              <div key={gp.label} className="flex items-center gap-1.5 text-slate-300" data-testid={`map-guide-row-${gp.label}`}>
                <span className="text-pink-300">{gp.label}</span>
                <span className="text-[10px] text-slate-500">X {gp.x.toFixed(0)} Y {gp.y.toFixed(0)}</span>
                <span className="ml-auto">{fmtZ(gp.z, { kind: 'structure', z_domain: 'depth' })}</span>
                <button type="button" title="Remove" className="text-slate-500 hover:text-red-400" onClick={() => setGuidePoints((g) => g.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {!guidePoints.length && <p className="text-[10px] text-slate-600">A guide point is a control value you place by hand; it grids with the wells (hand editing, v1).</p>}

            <div className="pt-2 border-t border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Sigma className="w-3 h-3" /> Surface arithmetic</div>
            <select className={selCls} value={arith.op} data-testid="map-arith-op" onChange={(e) => setArith((a) => ({ ...a, op: e.target.value }))}>
              {ARITH_OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <select className={selCls} value={isoPair.a} data-testid="map-iso-a" onChange={(e) => setIsoPair((p) => ({ ...p, a: e.target.value }))}>
              <option value="">{arith.op === 'thickness' ? 'top surface (shallower)…' : 'surface A…'}</option>
              {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {ARITH_OPS.find((o) => o.key === arith.op)?.needsB && (
              <select className={selCls} value={isoPair.b} data-testid="map-iso-b" onChange={(e) => setIsoPair((p) => ({ ...p, b: e.target.value }))}>
                <option value="">{arith.op === 'thickness' ? 'base surface (deeper)…' : 'surface B…'}</option>
                {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {ARITH_OPS.find((o) => o.key === arith.op)?.needsK && (
              <input className={selCls} data-testid="map-arith-k" placeholder="k" value={arith.k} onChange={(e) => setArith((a) => ({ ...a, k: e.target.value }))} />
            )}
            {ARITH_OPS.find((o) => o.key === arith.op)?.needsBoundary && (
              <p className="text-[10px] text-slate-500">Uses the boundary marked clip in the Polygons section.</p>
            )}
            <button type="button" data-testid="map-iso-run"
              className="w-full px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
              disabled={!isoPair.a || (ARITH_OPS.find((o) => o.key === arith.op)?.needsB && (!isoPair.b || isoPair.a === isoPair.b))} onClick={runArith}>
              {arith.op === 'thickness' ? 'Compute isochore' : 'Compute'}
            </button>
            <p className="text-[10px] text-slate-600">Two-surface operations resample B onto A's frame; the isochore subtracts elevations, so the thickness is positive where the base is deeper. Publish to save.</p>

            <div className="pt-2 border-t border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Calculator className="w-3 h-3" /> Quick GRV</div>
            <div className="flex gap-1">
              <input className={`${selCls} flex-1`} data-testid="map-grv-contact" placeholder={`contact (${depthUnit})`} title={`Contact in ${depthUnit}: an elevation (negative below datum) or a depth below datum`}
                value={grvContact} onChange={(e) => setGrvContact(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runGrv(); }} />
              <button type="button" data-testid="map-grv-run" disabled={!displayGrid} className="px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40" onClick={() => runGrv()}>GRV</button>
            </div>
            <button type="button" data-testid="map-grv-pick" disabled={!displayGrid || grvContact === ''}
              title="Click a closure on the map to measure that one instead of the highest"
              className="w-full px-2 py-0.5 text-[11px] rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              onClick={() => { setDrawMode('grvpick'); setStatus('Click inside the closure to measure.'); }}>
              {drawMode === 'grvpick' ? 'Click a closure on the map…' : 'Pick a closure on the map'}
            </button>
            {grvResult && (
              <p className={`text-[11px] ${grvData?.open ? 'text-amber-300' : 'text-slate-300'}`} data-testid="map-grv-result"
                data-open={grvData?.kind === 'closure' ? String(grvData.open) : undefined}>{grvResult}</p>
            )}
            {grvData?.kind === 'closure' && (
              <button type="button" data-testid="map-prospect-card" onClick={exportProspectCard}
                className="w-full px-2 py-0.5 text-[11px] rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10">
                Prospect card (PNG)
              </button>
            )}
            {grvData?.kind === 'closure' && grvData.curve?.length > 0 && (
              <ClosureCurveChart curve={grvData.curve} contactM={grvData.contactM} spillZ={grvData.spill.z}
                toDisplay={(m) => toDisplay(m, depthUnit)} unit={depthUnit} />
            )}
            <p className="text-[10px] text-slate-600">Gross rock volume of one closure above a contact: the highest, or the one you pick. The curve shows area and GRV from the crest down to the spill. ReservoirCalc Pro is the place for fluids and uncertainty.</p>

            {displaySurface?.z_domain === 'time' && (
              <>
                <div className="pt-2 border-t border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Time to depth</div>
                <select className={selCls} value={tdMethod} data-testid="map-td-method" onChange={(e) => setTdMethod(e.target.value)}>
                  <option value="linear">Linear V(z) from a Seismolord velocity model</option>
                  <option value="wells">Average velocity from the wells</option>
                </select>
                <select className={selCls} value={tdTop} data-testid="map-td-top" onChange={(e) => setTdTop(e.target.value)}
                  title="The well top this time horizon marks">
                  <option value="">{tdMethod === 'wells' ? 'top this horizon marks…' : 'tie to a top (optional)…'}</option>
                  {topNames.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {tdMethod === 'linear' && (
                  <>
                    <select className={selCls} value={tdModelId} data-testid="map-td-model" onChange={(e) => setTdModelId(e.target.value)}>
                      <option value="">velocity model (Seismolord volume)…</option>
                      {velocityModels.map((m) => <option key={m.id} value={m.id}>{m.name}{m.kind === 'layercake' ? ' (layer cake)' : ''}</option>)}
                    </select>
                    <select className={selCls} value={tdUnit} data-testid="map-td-unit" onChange={(e) => setTdUnit(e.target.value)}>
                      <option value="ft">depth in feet</option>
                      <option value="m">depth in metres</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-slate-300 text-[11px]" title="Spread the mis-ties at the wells over the map (Franke-Little field, radius three well spacings)">
                      <input type="checkbox" data-testid="map-td-correct" checked={tdCorrect} disabled={!tdTop} onChange={(e) => setTdCorrect(e.target.checked)} /> correct the map to the top
                    </label>
                  </>
                )}
                <button type="button" data-testid="map-td-run" disabled={tdMethod === 'linear' ? !tdModelId : !tdTop}
                  className="w-full px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40" onClick={runTimeDepth}>Convert</button>
                <p className="text-[10px] text-slate-600">{tdMethod === 'wells'
                  ? 'Average velocity (depth over one-way time) at each well carrying the top, gridded over the horizon; the map honours every well.'
                  : "V(z) = v0 + k·z from the volume's velocity model; the result is elevation, negative below datum. Layer cakes convert in Seismolord."}</p>
              </>
            )}

            {residuals && <ResidualTable title={residuals.title} rows={residuals.rows} stats={residuals.stats} fmt={(m) => fmtZ(m, { kind: 'structure', z_domain: 'depth' })} fmtLen={(m) => fmtZ(m, { kind: 'isochore', z_domain: 'depth' })} />}

            <div className="pt-2 border-t border-slate-800/60">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-1">
                <Globe2 className="w-3 h-3" /> Culture layers
              </div>
              {otherCulture.map((c) => (
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
              {!otherCulture.length && (
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
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent data-testid="map-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The surface leaves the registry for everyone it is shared with. Earth Modeling models stacked on it and
              ReservoirCalc Pro links to it will no longer find it. You can undo for {UNDO_MS / 1000} seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="map-delete-cancel">Keep it</AlertDialogCancel>
            <AlertDialogAction data-testid="map-delete-go" className="bg-red-600 hover:bg-red-700" onClick={confirmDel}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SurfaceImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        backend={backend}
        depthUnit={depthUnit}
        onImported={onImported}
      />
    </>
  );
}
