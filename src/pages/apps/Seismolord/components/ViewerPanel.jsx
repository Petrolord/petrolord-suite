import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Route, Box, ScanLine, Save, Map as MapIcon, X, Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  listVolumes, deleteVolume, getManifest, saveManifestVelocity, saveManifestTraverses,
} from '../services/volumesService';
import {
  saveHorizon, listHorizons, loadHorizonGrid, deleteHorizon, updateHorizon,
} from '../services/horizonsService';
import { saveFault, listFaults, deleteFault } from '../services/faultsService';
import { BrickCache, storageBrickFetcher, ABORTED } from '../engine/brickCache';
import {
  assembleSlice, assembleTrace, bricksForSlice, geomFromManifest, brickKey,
} from '../engine/sliceAssembly';
import {
  resampleTraverse, assembleTraverse, traverseEraseCells, sanitizeTraverses,
} from '../engine/traverse';
import {
  extractHorizonAmplitude, bricksForHorizonAmplitude,
} from '../engine/horizonAmplitude';
import { makeTvdssToTwt, buildWellLatticePath } from '../engine/wellSection';
import { surveyAffine } from '../engine/surveyGeometry';
import {
  snapPick, autotrack2D, smoothHorizon, fillHorizonHoles,
} from '../engine/horizonTrack';
import {
  normalizeVelocity, describeVelocity, velocityToManifest, makeDepthConverter,
} from '../engine/velocityModel';
import { NULL_VALUE } from '../engine/manifest';
import { SEISMIC_COLORMAPS } from '../viewer/SliceRenderer';
import SliceView from './SliceView';
import CubeView from './CubeView';
import MapView from './MapView';
import ViewerWindows from './ViewerWindows';
import AiPanel from './AiPanel';
import WorkspaceShell from './workspace/WorkspaceShell';
import Ribbon from './workspace/Ribbon';
import HomeTab from './workspace/ribbonTabs/HomeTab';
import InterpretationTab from './workspace/ribbonTabs/InterpretationTab';
import WellsTab from './workspace/ribbonTabs/WellsTab';
import ExportTab from './workspace/ribbonTabs/ExportTab';
import AiTab from './workspace/ribbonTabs/AiTab';
import VelocityModelEditor from './workspace/VelocityModelEditor';
import ImportSegyDialog from './workspace/dialogs/ImportSegyDialog';
import ExportDialog from './workspace/dialogs/ExportDialog';
import WellImportDialog from './workspace/dialogs/WellImportDialog';
import VelocityModelDialog from './workspace/dialogs/VelocityModelDialog';
import SeismicExplorer from './workspace/SeismicExplorer';
import StatusBar from './workspace/StatusBar';
import RightDock from './workspace/RightDock';
import { horizonColor, faultColor } from './workspace/interpretationColors';
import useWells from '../hooks/useWells';
import useBackendStatus from '../hooks/useBackendStatus';

const NULL_F32 = Math.fround(NULL_VALUE);

const DRAFT_COLOR = '#facc15';

// storage base URL without touching the shared client module
const storageBase = () => supabase.storage.from('seismic')
  .getPublicUrl('x').data.publicUrl.split('/storage/v1/')[0];

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return session.access_token;
}

const newHorizonWorker = () =>
  new Worker(new URL('../workers/horizon.worker.js', import.meta.url), { type: 'module' });

/** Horizon grid cache bound (L4): grids are nIl x nXl float32 each — on a
 *  big survey with many horizons an unbounded map could hold hundreds of
 *  MB. Insertion-order eviction; an evicted grid just reloads on demand. */
const GRID_CACHE_MAX = 32;
const cacheGrid = (map, id, grid) => {
  map.delete(id);
  map.set(id, grid);
  while (map.size > GRID_CACHE_MAX) map.delete(map.keys().next().value);
};

// ViewerPanel is the seismic WORKSPACE CONTROLLER: it owns all viewer,
// interpretation and registry state and renders the workstation layout
// (WorkspaceShell: ribbon strip / explorer tree / viewport windows /
// status bar). Presentational pieces receive grouped props from here.
export default function ViewerPanel() {
  const { toast } = useToast();
  const cacheRef = useRef(null);
  const requestRef = useRef(0);
  const workerRef = useRef(null);
  const jobIdRef = useRef(0);
  const selectSeqRef = useRef(0);               // stale volume-switch guard
  const gridCacheRef = useRef(new Map());       // horizon id -> Float32Array

  // wells are per-user and volume-independent; visible wells carry
  // computed world paths so the viewer windows just draw
  const wellsApi = useWells();
  const wells = wellsApi.visible;
  const backend = useBackendStatus();

  const [volumesRefresh, setVolumesRefresh] = useState(0);
  const [allVolumes, setAllVolumes] = useState([]);  // explorer list (any status)
  const [volumeBusyId, setVolumeBusyId] = useState(null);
  // heavyweight workflows open as modal dialogs over the workspace
  const [openDialog, setOpenDialog] = useState(null); // null|'import'|'wellImport'|'export'|'velocity'
  // AI copilot right dock — the dock panel stays mounted while collapsed
  // so the chat survives open/close
  const [dockOpen, setDockOpen] = useState(false);

  // cursor readout → status bar, entirely ref-driven (no re-renders):
  // the views call handleCursor per pointer move and StatusBar registers
  // a sink that writes straight into the DOM
  const statusSinkRef = useRef(null);
  const handleCursor = useCallback((info) => {
    if (statusSinkRef.current) statusSinkRef.current(info);
  }, []);
  const registerCursorSink = useCallback((sink) => {
    statusSinkRef.current = sink;
  }, []);

  const [volumes, setVolumes] = useState([]);
  const [volume, setVolume] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [orientation, setOrientation] = useState('inline');
  // one slice position PER orientation — the 2D view shows the current
  // orientation's; the 3D window shows all three, so a 2D slider move
  // updates the matching 3D plane and vice versa (Shift+wheel in 3D).
  const [indices, setIndices] = useState({ inline: 0, xline: 0, time: 0 });
  const sliceIndex = indices[orientation];
  const [vexag, setVexag] = useState(1);       // shared 2D/3D exaggeration
  const [colormap, setColormap] = useState(SEISMIC_COLORMAPS[0].key);
  const [gain, setGain] = useState(1);
  const [clipRms, setClipRms] = useState(3);
  const [polarity, setPolarity] = useState(1);
  const [traceBalance, setTraceBalance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sliceMs, setSliceMs] = useState(null);
  const [slice, setSlice] = useState(null);              // assembled slice for SliceView
  const [resolvedHorizons, setResolvedHorizons] = useState([]);

  // traverse: a map-drawn polyline shown as a section in its own window.
  // Assembled ONCE on draw (independent of orientation/sliceIndex); a
  // volume switch clears it.
  const traverseReqRef = useRef(0);
  const traverseBricksRef = useRef(null);       // Set<brickKey> while assembling
  const [traverse, setTraverse] = useState(null);        // {vertices, positions, stepM, lengthM}
  const [traverseSlice, setTraverseSlice] = useState(null);
  const [traverseLoading, setTraverseLoading] = useState(false);
  // which saved line (manifest.traverses) the displayed traverse came
  // from — null for a freshly drawn, unsaved line
  const [traverseSavedId, setTraverseSavedId] = useState(null);
  const [traverseBusy, setTraverseBusy] = useState(false);
  const [winFocus, setWinFocus] = useState(null);        // {key, seq} -> ViewerWindows
  // bricks of an in-flight map amplitude extraction — shielded from the
  // slice scrub's cancellation exactly like an in-flight traverse
  const ampBricksRef = useRef(null);

  // Phase 3: picking + horizons; Phase 4: fault sticks; editing tools:
  // 'manual' (paint picks) and 'erase' (paint nulls) run against the
  // edit session in editRef.
  const [pickMode, setPickMode] = useState(null);   // null|'seed'|'fault'|'manual'|'erase'
  const [seedPick, setSeedPick] = useState(null);   // {ilIdx, xlIdx, sample}
  const [snapMode, setSnapMode] = useState('peak'); // SNAP_OPTIONS key
  // ---- horizon edit session ---------------------------------------------
  // editRef holds the WORKING grid (mutated in place during a paint
  // stroke, cloned on commit so the 3D/map caches rebuild once per op)
  // plus the undo stack; `edit` mirrors the bits the UI renders.
  const editRef = useRef(null);            // {targetId:'new'|id, grid, undo:[]}
  const [editTarget, setEditTarget] = useState('new');
  const [edit, setEdit] = useState({ version: 0, undo: 0, active: false });
  const [editBusy, setEditBusy] = useState(false);
  const [eraseSize, setEraseSize] = useState(1);    // BRUSH_OPTIONS radius
  const [smoothMethod, setSmoothMethod] = useState('mean');   // 'mean'|'median'
  const [smoothRadius, setSmoothRadius] = useState(1);        // 1=3×3, 2=5×5, 4=9×9
  // search half-window (samples) for seed snap, manual picking, ghost
  // preview and BOTH trackers; ±3 preserves the validated tracker default
  const [snapWindow, setSnapWindow] = useState(3);
  // velocity model draft (strings while typing; saved model lives in the
  // manifest and is the ONLY thing depth displays / exports consume)
  const [velMode, setVelMode] = useState('linear');   // 'linear' | 'layercake'
  const [velDraft, setVelDraft] = useState({ v0: '', k: '' });
  // layer-cake rows top-down: all but the last need a base horizon
  const [velLayers, setVelLayers] = useState([]);
  const [velBusy, setVelBusy] = useState(false);
  // well-tie calibration panel (Phase W3) under the velocity editor
  const [calOpen, setCalOpen] = useState(false);
  // boundary pick grids aligned with the saved layer cake's layer bases
  const [velBoundaries, setVelBoundaries] = useState(null);
  const [tracking, setTracking] = useState(null);   // {tracked, total}
  const [horizons, setHorizons] = useState([]);
  const [visibleIds, setVisibleIds] = useState(new Set());
  const [horizonBusyId, setHorizonBusyId] = useState(null);
  const [faults, setFaults] = useState([]);
  const [visibleFaultIds, setVisibleFaultIds] = useState(new Set());
  const [faultBusyId, setFaultBusyId] = useState(null);
  // draft fault: array of sticks; each stick = array of {il, xl, s}
  const [draftSticks, setDraftSticks] = useState([]);

  const volumeIdRef = useRef(null);             // selected id for list-refresh checks

  useEffect(() => {
    listVolumes()
      .then((vs) => {
        setAllVolumes(vs);
        const ready = vs.filter((v) => v.status === 'ready');
        setVolumes(ready);
        // the selected volume was deleted elsewhere: clear the whole
        // viewer instead of letting every brick fetch 404 until the
        // user happens to reselect (L7)
        if (volumeIdRef.current && !ready.some((v) => v.id === volumeIdRef.current)) {
          selectVolume('');
        }
      })
      .catch((e) => setError(e.message));
    // selectVolume intentionally omitted: the '' path only clears state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumesRefresh]);

  const geom = useMemo(() => (manifest ? geomFromManifest(manifest) : null), [manifest]);
  const velocityModel = useMemo(() => normalizeVelocity(manifest?.velocity), [manifest]);
  const savedTraverses = useMemo(() => sanitizeTraverses(manifest?.traverses), [manifest]);

  // drafts follow the saved model (volume switch or a successful save)
  useEffect(() => {
    const m = normalizeVelocity(manifest?.velocity);
    if (m?.kind === 'layercake') {
      setVelMode('layercake');
      setVelLayers(m.layers.map((l) => ({
        baseHorizonId: l.baseHorizonId ?? '', v0: String(l.v0), k: String(l.k),
      })));
      setVelDraft({ v0: '', k: '' });
    } else {
      setVelMode('linear');
      setVelLayers([]);
      setVelDraft({
        v0: m ? String(m.v0) : '',
        k: m ? String(m.k) : '',
      });
    }
  }, [manifest]);

  /** Build the manifest-form model from the current draft, or throw a
   *  user-facing message. null = remove the model. */
  const draftToModel = () => {
    if (velMode === 'linear') {
      if (velDraft.v0.trim() === '') return null;
      const m = normalizeVelocity({
        v0: Number(velDraft.v0),
        k: velDraft.k.trim() === '' ? 0 : Number(velDraft.k),
      });
      if (!m) throw new Error('V0 must be a positive number (m/s) and k a finite number (1/s).');
      return velocityToManifest(m);
    }
    if (velLayers.length === 0) return null;
    if (velLayers.length < 2) {
      throw new Error('A layer cake needs at least two layers — use the single-function model instead.');
    }
    const bounded = velLayers.slice(0, -1);
    if (bounded.some((l) => !l.baseHorizonId)) {
      throw new Error('Every layer except the last needs a base horizon.');
    }
    const ids = bounded.map((l) => l.baseHorizonId);
    if (new Set(ids).size !== ids.length) {
      throw new Error('Each horizon can bound only one layer.');
    }
    // keep the stack geologically ordered: sort bounded layers by their
    // horizon's mid TWT when stats allow (the last, unbounded layer stays
    // last); rows without stats keep their drafted position
    const midTwt = (id) => {
      const s = horizons.find((h) => h.id === id)?.stats;
      return s?.min_twt_ms != null && s?.max_twt_ms != null
        ? (s.min_twt_ms + s.max_twt_ms) / 2 : null;
    };
    const sorted = bounded
      .map((l, idx) => ({ l, idx, t: midTwt(l.baseHorizonId) }))
      .sort((a, b) => ((a.t ?? a.idx) - (b.t ?? b.idx)) || (a.idx - b.idx))
      .map((e) => e.l);
    const rows = [...sorted, velLayers[velLayers.length - 1]];
    const m = normalizeVelocity({
      type: 'layercake',
      layers: rows.map((l, i) => ({
        base_horizon_id: i < rows.length - 1 ? l.baseHorizonId : null,
        v0: Number(l.v0),
        k: l.k.trim() === '' ? 0 : Number(l.k),
      })),
    });
    if (!m) throw new Error('Every layer needs a positive V0 (m/s) and a finite k (1/s).');
    return velocityToManifest(m);
  };

  const saveVelocity = async () => {
    if (!volume || !manifest) return;
    let model;
    try {
      model = draftToModel();
    } catch (e) {
      toast({ title: 'Invalid velocity model', description: e.message, variant: 'destructive' });
      return;
    }
    setVelBusy(true);
    try {
      const next = await saveManifestVelocity(volume, manifest, model);
      setManifest(next);
      toast({
        title: model ? 'Velocity model saved' : 'Velocity model removed',
        description: describeVelocity(model),
      });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setVelBusy(false);
    }
  };

  /** Load a horizon's pick grid by id through the shared cache (well-tie
   *  calibration pairs against ANY saved horizon, visible or not). */
  const loadGridById = useCallback(async (horizonId) => {
    let g = gridCacheRef.current.get(horizonId);
    if (g) return g;
    const row = horizons.find((h) => h.id === horizonId);
    if (!row) throw new Error('That horizon no longer exists.');
    g = await loadHorizonGrid(row);
    cacheGrid(gridCacheRef.current, horizonId, g);
    return g;
  }, [horizons]);

  /** Apply a calibrated model (WellTiePanel's explicit Save — the only
   *  path that rewrites the model outside the editor). The calibration
   *  provenance persists alongside (manifest.velocity_calibration) so
   *  depth exports can record wells_used; a manual editor save clears
   *  it again (saveManifestVelocity's default). */
  const applyCalibratedModel = async (model, calibration) => {
    const next = await saveManifestVelocity(volume, manifest, model, calibration);
    setManifest(next);
    toast({ title: 'Velocity model calibrated', description: describeVelocity(model) });
  };

  // load the layer cake's boundary pick grids (deleted horizons yield a
  // null entry — the layer above then extends, per the engine convention);
  // depth displays stay gated until the grids are in
  useEffect(() => {
    const m = velocityModel;
    if (!m || m.kind !== 'layercake') { setVelBoundaries(null); return undefined; }
    let cancelled = false;
    (async () => {
      const grids = [];
      for (const l of m.layers.slice(0, -1)) {
        const row = horizons.find((h) => h.id === l.baseHorizonId);
        if (!row) { grids.push(null); continue; }
        let g = gridCacheRef.current.get(row.id);
        if (!g) {
          try {
            g = await loadHorizonGrid(row);
            cacheGrid(gridCacheRef.current, row.id, g);
          } catch {
            g = null;
          }
        }
        grids.push(g || null);
      }
      if (!cancelled) setVelBoundaries(grids);
    })();
    return () => { cancelled = true; };
  }, [velocityModel, horizons]);

  // what depth displays consume: a layer cake is only usable once its
  // boundary grids are loaded — never convert with half a model
  const velocityForDisplay = useMemo(() => {
    if (!velocityModel) return null;
    if (velocityModel.kind === 'layercake' && !velBoundaries) return null;
    return velocityModel;
  }, [velocityModel, velBoundaries]);

  // depth-conversion for section/3D cursor readouts and the section depth
  // axis — the same converter family the map's depth domains use (layer
  // cakes convert per column via the loaded boundary grids)
  const depthConv = useMemo(() => (velocityForDisplay && manifest
    ? makeDepthConverter(velocityForDisplay, {
      dtUs: manifest.geometry.dt_us, boundaries: velBoundaries,
    })
    : null), [velocityForDisplay, manifest, velBoundaries]);

  // wells in TWT: per-well T(z) (its own checkshots first, else the
  // volume model inverted — plan decision #4, never mixed) + the dense
  // lattice path with tops; wells without either stay map-only
  const wellSections = useMemo(() => {
    if (!wells || !wells.length || !manifest || !geom) return [];
    const affine = surveyAffine(manifest.geometry);
    if (!affine) return [];
    const dtUs = manifest.geometry.dt_us;
    const maxTwtMs = ((geom.ns - 1) * dtUs) / 1000;
    const out = [];
    for (const w of wells) {
      const timeConv = makeTvdssToTwt({
        checkshots: w.checkshots,
        velocity: velocityForDisplay,
        boundaries: velBoundaries,
        dtUs,
        maxTwtMs,
      });
      if (!timeConv) continue;
      const built = buildWellLatticePath(w, { affine, timeConv, geom, dtUs });
      if (!built) continue;
      out.push({
        id: w.id, name: w.name, color: w.color, source: timeConv.source, ...built,
      });
    }
    return out;
  }, [wells, manifest, geom, velocityForDisplay, velBoundaries]);
  const maxIndex = useMemo(() => {
    if (!geom) return 0;
    return orientation === 'inline' ? geom.nIl - 1
      : orientation === 'xline' ? geom.nXl - 1 : geom.ns - 1;
  }, [geom, orientation]);

  const reloadHorizons = useCallback(async (vol) => {
    if (!vol) { setHorizons([]); return; }
    try {
      setHorizons(await listHorizons(vol.id));
    } catch (e) {
      toast({ title: 'Horizons failed to load', description: e.message, variant: 'destructive' });
    }
  }, [toast]);

  // ---- edit session lifecycle -------------------------------------------

  const closeSession = useCallback(() => {
    editRef.current = null;
    setEdit({ version: 0, undo: 0, active: false });
    setPickMode((p) => (p === 'manual' || p === 'erase' ? null : p));
  }, []);

  /**
   * Open (or switch to) the edit session for `targetId` ('new' = a fresh
   * empty grid; otherwise a WORKING COPY of that horizon's picks —
   * nothing touches storage until Save). Unsaved edits ask before being
   * discarded; returns null if the user declines or the target is gone.
   */
  const openSession = useCallback(async (targetId) => {
    const cur = editRef.current;
    if (cur && cur.targetId === targetId) return cur;
    if (cur && cur.undo.length && !window.confirm('Discard unsaved horizon edits?')) {
      return null;
    }
    if (!geom) return null;
    let grid;
    if (targetId === 'new') {
      grid = new Float32Array(geom.nIl * geom.nXl).fill(NULL_F32);
    } else {
      const h = horizons.find((x) => x.id === targetId);
      if (!h) return null;
      let base = gridCacheRef.current.get(h.id);
      if (!base) {
        try {
          base = await loadHorizonGrid(h);
        } catch (e) {
          toast({ title: 'Horizon failed to load', description: e.message, variant: 'destructive' });
          return null;
        }
        cacheGrid(gridCacheRef.current, h.id, base);
      }
      grid = new Float32Array(base);
      setVisibleIds((s) => (s.has(h.id) ? s : new Set([...s, h.id])));
    }
    editRef.current = { targetId, grid, undo: [] };
    setEdit({ version: 1, undo: 0, active: true });
    return editRef.current;
  }, [geom, horizons, toast]);

  /** Record old values, apply new ones, push an undo op. */
  const applyOp = useCallback((cells, values) => {
    const s = editRef.current;
    if (!s || !cells.length) return;
    const changed = [];
    const old = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const next = Math.fround(values[i]);
      if (s.grid[c] === next) continue;
      changed.push(c);
      old.push(s.grid[c]);
      s.grid[c] = next;
    }
    if (!changed.length) return;
    // typed arrays: a whole-grid op (smoothing) stays a few MB, not tens
    s.undo.push({ cells: Int32Array.from(changed), old: Float32Array.from(old) });
    if (s.undo.length > 40) s.undo.shift();
    setEdit((e) => ({ version: e.version + 1, undo: s.undo.length, active: true }));
  }, []);

  /** End of a paint stroke / one-shot op: clone the grid so the 3D and
   *  map caches (keyed by grid reference) rebuild exactly once. */
  const commitStroke = useCallback(() => {
    const s = editRef.current;
    if (!s) return;
    s.grid = new Float32Array(s.grid);
    setEdit((e) => ({ ...e, version: e.version + 1 }));
  }, []);

  const undoEdit = useCallback(() => {
    const s = editRef.current;
    if (!s || !s.undo.length) return;
    const op = s.undo.pop();
    const g = new Float32Array(s.grid);
    for (let i = 0; i < op.cells.length; i++) g[op.cells[i]] = op.old[i];
    s.grid = g;
    setEdit((e) => ({ version: e.version + 1, undo: s.undo.length, active: true }));
  }, []);

  const selectVolume = async (id) => {
    const seq = ++selectSeqRef.current;           // supersedes any in-flight select
    const v = volumes.find((x) => x.id === id) || null;
    volumeIdRef.current = v?.id || null;
    setVolume(v);
    setManifest(null);
    setSlice(null);
    setSeedPick(null);
    setVisibleIds(new Set());
    setVisibleFaultIds(new Set());
    setDraftSticks([]);
    traverseReqRef.current += 1;                  // supersede in-flight assembly
    traverseBricksRef.current = null;
    ampBricksRef.current = null;
    setTraverse(null);
    setTraverseSlice(null);
    setTraverseLoading(false);
    setTraverseSavedId(null);
    setCalOpen(false);
    editRef.current = null;
    setEdit({ version: 0, undo: 0, active: false });
    setEditTarget('new');
    setPickMode(null);
    gridCacheRef.current.clear();
    setError(null);
    if (!v) { setHorizons([]); setFaults([]); return; }
    setLoading(true);
    try {
      const m = await getManifest(v);
      const [hz, flt] = await Promise.all([
        listHorizons(v.id).catch(() => []),
        listFaults(v.id).catch(() => []),
      ]);
      if (seq !== selectSeqRef.current) return;   // a newer selection won; drop this one
      cacheRef.current = new BrickCache(
        storageBrickFetcher({ supabaseUrl: storageBase(), getToken: accessToken }),
        { maxBytes: 256 * 1024 * 1024 },
      );
      setManifest(m);
      setHorizons(hz);
      setFaults(flt);
      setOrientation('inline');
      setIndices({
        inline: Math.floor(m.geometry.il.count / 2),
        xline: Math.floor(m.geometry.xl.count / 2),
        time: Math.floor(m.geometry.ns / 2),
      });
    } catch (e) {
      if (seq === selectSeqRef.current) setError(e.message);
    } finally {
      if (seq === selectSeqRef.current) setLoading(false);
    }
  };

  /** Explorer context-menu delete (from the retired VolumesPanel). The
   *  refresh bump makes the L7 effect clear the viewer if the deleted
   *  volume was the active one. */
  const deleteVolumeAction = async (v) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${v.name}" and all of its brick data? This cannot be undone.`)) return;
    setVolumeBusyId(v.id);
    try {
      await deleteVolume(v);
      toast({ title: 'Volume deleted', description: v.name });
      setVolumesRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setVolumeBusyId(null);
    }
  };

  const getBrick = useCallback((i, j, k) => cacheRef.current
    .get(brickKey(volume.storage_path, i, j, k)), [volume]);

  // Assemble the slice for the current position. Display params (gain,
  // colormap, clip…) are NOT dependencies — they are shader-side in
  // SliceView and never trigger a re-assembly or brick fetch.
  const loadSlice = useCallback(async () => {
    if (!manifest || !geom || !volume) return;
    const req = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      // scrub cancellation: keep only the bricks this slice needs — plus
      // the bricks of an in-flight traverse assembly or map amplitude
      // extraction, which a scrub must never abort
      const needed = new Set(bricksForSlice(geom, orientation, sliceIndex)
        .map(({ i, j, k }) => brickKey(volume.storage_path, i, j, k)));
      for (const shield of [traverseBricksRef.current, ampBricksRef.current]) {
        if (shield) for (const key of shield) needed.add(key);
      }
      cacheRef.current.cancelPendingExcept(needed);

      const t0 = performance.now();
      const assembled = await assembleSlice(getBrick, geom, orientation, sliceIndex);
      if (req !== requestRef.current) return;          // stale scrub
      // tag orientation AND index: SliceView draws overlays at the
      // DISPLAYED slice's position, so a scrub can never paint horizon
      // lines for index N+1 over the image of index N (ML4)
      setSlice({ ...assembled, orientation, index: sliceIndex });
      setSliceMs(performance.now() - t0);
    } catch (e) {
      if (e.message !== ABORTED && req === requestRef.current) setError(e.message);
    } finally {
      if (req === requestRef.current) setLoading(false);
    }
  }, [manifest, geom, volume, orientation, sliceIndex, getBrick]);

  useEffect(() => { loadSlice(); }, [loadSlice]);

  // resolve the visible horizons to grids + colors for the overlays; a
  // horizon being edited shows its WORKING grid (and is forced visible),
  // and a from-scratch session appears as a yellow draft layer
  useEffect(() => {
    let stale = false;
    (async () => {
      const session = editRef.current;
      const out = [];
      for (let idx = 0; idx < horizons.length; idx++) {
        const h = horizons[idx];
        const isEditing = session && session.targetId === h.id;
        if (!visibleIds.has(h.id) && !isEditing) continue;
        let grid;
        if (isEditing) {
          grid = session.grid;
        } else {
          grid = gridCacheRef.current.get(h.id);
          if (!grid) {
            try {
              grid = await loadHorizonGrid(h);
            } catch (e) {
              toast({ title: `Horizon "${h.name}" failed to load`, description: e.message, variant: 'destructive' });
              continue;
            }
            cacheGrid(gridCacheRef.current, h.id, grid);
          }
        }
        out.push({
          id: h.id,
          name: isEditing ? `${h.name} (editing)` : h.name,
          grid,
          color: horizonColor(idx),
        });
      }
      if (session && session.targetId === 'new') {
        out.push({
          id: '__draft', name: 'New horizon (editing)', grid: session.grid, color: DRAFT_COLOR,
        });
      }
      if (!stale) setResolvedHorizons(out);
    })();
    return () => { stale = true; };
  }, [horizons, visibleIds, toast, edit.version]);

  // ---- picking (horizon seed / fault sticks) ----------------------------
  // SliceView already mapped the click through its view transform.
  // useCallback keeps the memoized SliceView from re-rendering on every
  // ViewerPanel state change (gain/clip slider ticks, list refreshes).
  const handlePick = useCallback(async ({ ilIdx, xlIdx, sample }) => {
    if (!pickMode || !geom || !volume || orientation === 'time') return;

    if (pickMode === 'fault') {
      // fault points are raw picks on visible discontinuities — no snap
      setDraftSticks((sticks) => {
        const next = sticks.map((s) => [...s]);
        if (next.length === 0) next.push([]);
        next[next.length - 1].push({ il: ilIdx, xl: xlIdx, s: sample });
        return next;
      });
      return;
    }

    if (pickMode === 'erase') {
      // brush: the pointed trace ± the brush radius along the line
      const cells = [];
      for (let d = -eraseSize; d <= eraseSize; d++) {
        if (orientation === 'inline') {
          const xl = xlIdx + d;
          if (xl >= 0 && xl < geom.nXl) cells.push(ilIdx * geom.nXl + xl);
        } else {
          const il = ilIdx + d;
          if (il >= 0 && il < geom.nIl) cells.push(il * geom.nXl + xlIdx);
        }
      }
      applyOp(cells, cells.map(() => NULL_VALUE));
      return;
    }

    if (pickMode === 'manual') {
      // snap to the chosen event kind when one is near, else take the
      // click as-is (free manual picking away from clean events)
      const cell = ilIdx * geom.nXl + xlIdx;
      try {
        const traceData = await assembleTrace(getBrick, geom, ilIdx, xlIdx);
        const hit = snapPick(traceData, sample, { mode: snapMode, window: snapWindow });
        applyOp([cell], [hit ? hit.sample : sample]);
      } catch {
        applyOp([cell], [sample]);
      }
      return;
    }

    try {
      const traceData = await assembleTrace(getBrick, geom, ilIdx, xlIdx);
      const hit = snapPick(traceData, sample, { mode: snapMode, window: snapWindow });
      if (!hit) {
        toast({ title: 'No event found', description: 'No event of the selected snap kind near that click — try closer to one.' });
        return;
      }
      setSeedPick({ ilIdx, xlIdx, sample: hit.sample });
    } catch (err) {
      setError(err.message);
    }
  }, [pickMode, geom, volume, orientation, getBrick, toast, snapMode, snapWindow, applyOp, eraseSize]);

  // ---- fault stick editing ----------------------------------------------
  const endStick = () => setDraftSticks((s) => (s.length && s[s.length - 1].length ? [...s, []] : s));

  const discardDraft = () => setDraftSticks([]);

  const saveDraftFault = async () => {
    const sticks = draftSticks.filter((s) => s.length >= 2)
      .map((points) => ({ points }));
    if (!sticks.length) {
      toast({ title: 'Nothing to save', description: 'A fault stick needs at least 2 points.' });
      return;
    }
    // eslint-disable-next-line no-alert
    const name = window.prompt('Fault name:', `Fault ${faults.length + 1}`);
    if (!name) return;
    try {
      const row = await saveFault({ volumeId: volume.id, name, sticks });
      setDraftSticks([]);
      setFaults(await listFaults(volume.id));
      setVisibleFaultIds((s) => new Set([...s, row.id]));
      toast({ title: 'Fault saved', description: `${name}: ${sticks.length} stick(s).` });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const toggleFault = (f) => {
    setVisibleFaultIds((s) => {
      const next = new Set(s);
      if (next.has(f.id)) next.delete(f.id);
      else next.add(f.id);
      return next;
    });
  };

  const onDeleteFault = async (f) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete fault "${f.name}"?`)) return;
    setFaultBusyId(f.id);
    try {
      await deleteFault(f);
      setVisibleFaultIds((s) => { const n = new Set(s); n.delete(f.id); return n; });
      setFaults(await listFaults(volume.id));
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setFaultBusyId(null);
    }
  };

  // ---- horizon editing actions ------------------------------------------

  /** Tracker gates: zero crossings sit at ~0 amplitude, so the RMS-based
   *  amplitude floor only applies to extrema modes. */
  const trackerOpts = useCallback(() => ({
    mode: snapMode,
    window: snapWindow,
    maxJump: 4,
    minAbsAmp: snapMode.startsWith('zero') ? 0 : (manifest?.stats?.rms || 0) * 0.3,
  }), [snapMode, snapWindow, manifest]);

  const toggleEditTool = async (tool) => {
    if (pickMode === tool) { setPickMode(null); return; }
    const s = editRef.current || await openSession(editTarget);
    if (s) setPickMode(tool);
  };

  const changeEditTarget = async (value) => {
    const prev = editRef.current?.targetId;
    setEditTarget(value);
    if (editRef.current && prev !== value) {
      const s = await openSession(value);
      if (!s && prev) setEditTarget(prev);        // user kept unsaved edits
    }
  };

  /** Autotrack along the DISPLAYED section from the seed, into the edit
   *  session (one undoable op). */
  const track2D = async () => {
    if (!seedPick || !slice || !geom || orientation === 'time') return;
    const onLine = orientation === 'inline'
      ? seedPick.ilIdx === sliceIndex : seedPick.xlIdx === sliceIndex;
    if (!onLine) {
      toast({ title: 'Seed is not on this line', description: 'Pick a seed on the displayed section first.' });
      return;
    }
    const s = editRef.current || await openSession(editTarget);
    if (!s) return;
    const startTrace = orientation === 'inline' ? seedPick.xlIdx : seedPick.ilIdx;
    const { picks, tracked } = autotrack2D(slice, startTrace, seedPick.sample, trackerOpts());
    if (!tracked) {
      toast({ title: 'Nothing tracked', description: 'No consistent event from that seed along this line.' });
      return;
    }
    const cells = [];
    const vals = [];
    for (let tr = 0; tr < picks.length; tr++) {
      if (picks[tr] === NULL_F32) continue;
      cells.push(orientation === 'inline' ? sliceIndex * geom.nXl + tr : tr * geom.nXl + sliceIndex);
      vals.push(picks[tr]);
    }
    applyOp(cells, vals);
    commitStroke();
    toast({ title: '2D autotrack', description: `${tracked} traces tracked along this line.` });
  };

  /** Map window region erase (rectangle or polygon outline, already
   *  resolved to cells) — targets the horizon the map displays,
   *  switching the edit session to it if needed. */
  const eraseRegion = useCallback(async ({ horizonId, cells }) => {
    if (!geom) return;
    let s = editRef.current;
    if (horizonId === '__draft') {
      if (!s || s.targetId !== 'new') return;
    } else if (!s || s.targetId !== horizonId) {
      const opened = await openSession(horizonId);
      if (!opened) return;
      setEditTarget(horizonId);
      s = opened;
    }
    const live = [];
    for (const c of cells) if (s.grid[c] !== NULL_F32) live.push(c);
    if (!live.length) return;
    applyOp(live, live.map(() => NULL_VALUE));
    commitStroke();
  }, [geom, openSession, applyOp, commitStroke]);

  /** One null-aware 3x3 smoothing pass over the whole working grid, as a
   *  single undoable op — click again for a stronger result. */
  const smoothEdits = async () => {
    if (!geom) return;
    const s = editRef.current || await openSession(editTarget);
    if (!s) return;
    const sm = smoothHorizon(s.grid, geom.nIl, geom.nXl, {
      radius: smoothRadius, method: smoothMethod,
    });
    const cells = [];
    const vals = [];
    for (let c = 0; c < sm.length; c++) {
      if (sm[c] !== s.grid[c]) { cells.push(c); vals.push(sm[c]); }
    }
    if (!cells.length) {
      toast({ title: 'Nothing to smooth', description: 'The horizon is already smooth (or has no picks).' });
      return;
    }
    applyOp(cells, vals);
    commitStroke();
    const size = 2 * smoothRadius + 1;
    toast({
      title: 'Horizon smoothed',
      description: `${cells.length.toLocaleString()} picks adjusted (${size}×${size} ${smoothMethod}, holes preserved).`,
    });
  };

  /** Membrane-fill INTERIOR holes (exterior never grows), one undoable op. */
  const fillHoles = async () => {
    if (!geom) return;
    const s = editRef.current || await openSession(editTarget);
    if (!s) return;
    const { grid, filled } = fillHorizonHoles(s.grid, geom.nIl, geom.nXl);
    if (!filled) {
      toast({ title: 'No interior holes', description: 'Every null region touches the survey edge — nothing to fill.' });
      return;
    }
    const cells = [];
    const vals = [];
    for (let c = 0; c < grid.length; c++) {
      if (grid[c] !== s.grid[c]) { cells.push(c); vals.push(grid[c]); }
    }
    applyOp(cells, vals);
    commitStroke();
    toast({ title: 'Holes filled', description: `${filled.toLocaleString()} cells interpolated (interior holes only).` });
  };

  const saveEdits = async () => {
    const s = editRef.current;
    if (!s || !volume || !manifest) return;
    setEditBusy(true);
    try {
      if (s.targetId === 'new') {
        const name = window.prompt('Horizon name:', `Horizon ${horizons.length + 1}`);
        if (!name) return;
        const row = await saveHorizon({
          volume,
          name,
          picks: s.grid,
          seed: seedPick || null,
          params: { mode: snapMode, window: 5, source: 'manual/2d' },
          dtUs: manifest.geometry.dt_us,
        });
        cacheGrid(gridCacheRef.current, row.id, s.grid);
        setVisibleIds((v) => new Set([...v, row.id]));
        toast({ title: 'Horizon saved', description: `${name}: ${row.stats.tracked} picks.` });
      } else {
        const h = horizons.find((x) => x.id === s.targetId);
        if (!h) throw new Error('The edited horizon no longer exists.');
        const row = await updateHorizon({
          horizon: h,
          picks: s.grid,
          dtUs: manifest.geometry.dt_us,
          params: { mode: snapMode, edited: true },
        });
        cacheGrid(gridCacheRef.current, h.id, s.grid);
        toast({ title: 'Horizon updated', description: `${h.name}: ${row.stats.tracked} picks.` });
      }
      await reloadHorizons(volume);
      closeSession();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setEditBusy(false);
    }
  };

  const discardEdits = () => {
    if (editRef.current?.undo.length && !window.confirm('Discard horizon edits?')) return;
    closeSession();
  };

  // ---- 3D tracking -----------------------------------------------------
  const trackHorizon = async () => {
    if (!seedPick || !geom || !volume || !manifest) return;
    const id = ++jobIdRef.current;
    setTracking({ tracked: 0, total: geom.nIl * geom.nXl });
    try {
      const token = await accessToken();
      const worker = newHorizonWorker();
      workerRef.current = worker;
      const picks = await new Promise((resolve, reject) => {
        worker.onmessage = async (e) => {
          const msg = e.data;
          if (msg.id !== id) return;
          if (msg.type === 'progress') setTracking({ tracked: msg.tracked, total: msg.total });
          else if (msg.type === 'need-token') {
            worker.postMessage({ type: 'token', nonce: msg.nonce, token: await accessToken() });
          } else if (msg.type === 'done') resolve(new Float32Array(msg.picks));
          else if (msg.type === 'error') reject(new Error(msg.message));
        };
        worker.onerror = (ev) => reject(new Error(ev.message));
        worker.postMessage({
          type: 'track3d',
          id,
          config: {
            supabaseUrl: storageBase(),
            token,
            bucket: 'seismic',
            storagePath: volume.storage_path,
            geom,
            seed: seedPick,
            opts: trackerOpts(),
          },
        });
      }).finally(() => worker.terminate());
      workerRef.current = null;

      // eslint-disable-next-line no-alert
      const name = window.prompt('Horizon name:', `Horizon ${horizons.length + 1}`);
      if (!name) { setTracking(null); return; }
      const row = await saveHorizon({
        volume,
        name,
        picks,
        seed: seedPick,
        params: { ...trackerOpts(), source: 'track3d' },
        dtUs: manifest.geometry.dt_us,
      });
      cacheGrid(gridCacheRef.current, row.id, picks);
      setVisibleIds((s) => new Set([...s, row.id]));
      await reloadHorizons(volume);
      toast({ title: 'Horizon tracked', description: `${name}: ${row.stats.tracked} traces.` });
    } catch (e) {
      if (!/cancelled/i.test(e.message)) {
        toast({ title: 'Tracking failed', description: e.message, variant: 'destructive' });
      }
    } finally {
      setTracking(null);
    }
  };

  const cancelTracking = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel', id: jobIdRef.current });
    }
  };

  const toggleHorizon = (h) => {
    setVisibleIds((s) => {
      const next = new Set(s);
      if (next.has(h.id)) next.delete(h.id);
      else next.add(h.id);
      return next;
    });
  };

  const onDeleteHorizon = async (h) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete horizon "${h.name}"?`)) return;
    setHorizonBusyId(h.id);
    try {
      await deleteHorizon(h);
      if (editRef.current?.targetId === h.id) closeSession();
      if (editTarget === h.id) setEditTarget('new');
      gridCacheRef.current.delete(h.id);
      setVisibleIds((s) => { const n = new Set(s); n.delete(h.id); return n; });
      await reloadHorizons(volume);
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setHorizonBusyId(null);
    }
  };

  useEffect(() => () => {
    if (cacheRef.current) cacheRef.current.clear();
    if (workerRef.current) workerRef.current.terminate();
  }, []);

  // ---- SliceView inputs --------------------------------------------------
  const display = useMemo(() => ({
    colormap,
    gain,
    polarity,
    clip: Math.max((manifest?.stats?.rms || 1) * clipRms, 1e-12),
    traceBalance,
  }), [colormap, gain, polarity, clipRms, traceBalance, manifest]);

  const overlays = useMemo(() => ({
    horizons: resolvedHorizons,
    faults: faults
      .map((f, idx) => ({ sticks: f.sticks, color: faultColor(idx), id: f.id }))
      .filter((f) => visibleFaultIds.has(f.id)),
    draftSticks,
    seedPick,
    wells: wellSections,
  }), [resolvedHorizons, faults, visibleFaultIds, draftSticks, seedPick, wellSections]);

  const stepSlice = useCallback((delta) => {
    setIndices((prev) => ({
      ...prev,
      [orientation]: Math.min(maxIndex, Math.max(0, prev[orientation] + delta)),
    }));
  }, [orientation, maxIndex]);

  /** 3D window edits any orientation's position (Shift+wheel over a plane). */
  const changeIndex = useCallback((o, idx) => {
    setIndices((prev) => (prev[o] === idx ? prev : { ...prev, [o]: idx }));
  }, []);

  /** Clicking a plane in 3D opens that orientation in the 2D viewer. */
  const selectPlane = useCallback((o) => setOrientation(o), []);

  /** Map click: move the shared inline AND crossline positions there. */
  const navigateTo = useCallback(({ ilIdx, xlIdx }) => {
    setIndices((prev) => (prev.inline === ilIdx && prev.xline === xlIdx
      ? prev : { ...prev, inline: ilIdx, xline: xlIdx }));
  }, []);

  /** Map-drawn or saved traverse: resample the polyline to trace
   *  positions, assemble the section, and focus the Traverse window.
   *  null removes; savedId marks which manifest entry the line came
   *  from (null = freshly drawn). */
  const handleTraverse = useCallback(async (vertices, savedId = null) => {
    const req = ++traverseReqRef.current;
    setTraverseSavedId(savedId);
    if (!vertices) {
      traverseBricksRef.current = null;
      setTraverse(null);
      setTraverseSlice(null);
      setTraverseLoading(false);
      return;
    }
    if (!geom || !manifest || !volume) return;
    const path = resampleTraverse(vertices, geom, manifest.geometry);
    if (!path) {
      toast({
        title: 'Traverse too short',
        description: 'The line covers fewer than two traces — draw a longer path across the survey.',
      });
      return;
    }
    setTraverse({ vertices, ...path });
    setTraverseSlice(null);
    setTraverseLoading(true);
    setWinFocus((f) => ({ key: 'traverse', seq: (f?.seq || 0) + 1 }));
    // shield this assembly's bricks from the slice scrub cancellation
    const bs = geom.brickSize;
    const nK = Math.ceil(geom.ns / bs);
    const keys = new Set();
    for (const pos of path.positions) {
      const bi = Math.floor(pos.il / bs);
      const bj = Math.floor(pos.xl / bs);
      for (let bk = 0; bk < nK; bk++) {
        keys.add(brickKey(volume.storage_path, bi, bj, bk));
      }
    }
    traverseBricksRef.current = keys;
    try {
      const assembled = await assembleTraverse(getBrick, geom, path.positions);
      if (req !== traverseReqRef.current) return;       // replaced or cleared
      setTraverseSlice({
        ...assembled,
        orientation: 'traverse',
        positions: path.positions,
        stepM: path.stepM,
        lengthM: path.lengthM,
      });
    } catch (e) {
      if (e.message !== ABORTED && req === traverseReqRef.current) {
        toast({ title: 'Traverse failed', description: e.message, variant: 'destructive' });
        setTraverse(null);
      }
    } finally {
      if (req === traverseReqRef.current) {
        traverseBricksRef.current = null;
        setTraverseLoading(false);
      }
    }
  }, [geom, manifest, volume, getBrick, toast]);

  /** Paint picking on the Traverse window: the hit already carries the
   *  IL/XL resolved through slice.positions plus the path column, so
   *  manual picks write the horizon grid cell directly (snapping on the
   *  already-assembled traverse column — zero fetches, same math as the
   *  ghost preview) and the eraser brushes ALONG THE PATH. */
  const handleTraversePick = useCallback(({ ilIdx, xlIdx, sample, trace }) => {
    if (!geom || !traverse) return;
    if (pickMode === 'erase') {
      const cells = traverseEraseCells(traverse.positions, trace, eraseSize, geom.nXl);
      applyOp(cells, cells.map(() => NULL_VALUE));
      return;
    }
    if (pickMode !== 'manual') return;
    const cell = ilIdx * geom.nXl + xlIdx;
    const ts = traverseSlice;
    if (ts) {
      const trData = ts.data.subarray(trace * ts.width, (trace + 1) * ts.width);
      const hit = snapPick(trData, sample, { mode: snapMode, window: snapWindow });
      applyOp([cell], [hit ? hit.sample : sample]);
    } else {
      applyOp([cell], [sample]);
    }
  }, [geom, traverse, traverseSlice, pickMode, eraseSize, snapMode, snapWindow, applyOp]);

  /** Map amplitude-attribute extraction along a horizon grid. The
   *  needed brick keys are registered up front so a concurrent slice
   *  scrub cannot abort the extraction's fetches (traverse pattern). */
  const extractAmplitude = useCallback(async (grid, opts) => {
    if (!geom || !volume) throw new Error('No volume selected');
    const keys = new Set(bricksForHorizonAmplitude(geom, grid, opts.window || 0)
      .map(({ i, j, k }) => brickKey(volume.storage_path, i, j, k)));
    ampBricksRef.current = keys;
    try {
      return await extractHorizonAmplitude(getBrick, geom, grid, opts);
    } finally {
      if (ampBricksRef.current === keys) ampBricksRef.current = null;
    }
  }, [geom, volume, getBrick]);

  /** Persist the drawn line under a name (manifest.traverses — the same
   *  owner-path manifest upsert as the velocity model). */
  const saveTraverseAs = async () => {
    if (!traverse || !volume || !manifest) return;
    // eslint-disable-next-line no-alert
    const name = window.prompt('Traverse name:', `Traverse ${savedTraverses.length + 1}`);
    if (!name) return;
    setTraverseBusy(true);
    try {
      const entry = { id: crypto.randomUUID(), name, vertices: traverse.vertices };
      const next = await saveManifestTraverses(volume, manifest, [...savedTraverses, entry]);
      setManifest(next);
      setTraverseSavedId(entry.id);
      toast({ title: 'Traverse saved', description: `${name}: ${traverse.positions.length} traces.` });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setTraverseBusy(false);
    }
  };

  /** Load a saved line into the Traverse window ('' keeps the current
   *  drawn line and just clears the selection). */
  const selectSavedTraverse = (id) => {
    if (!id) { setTraverseSavedId(null); return; }
    const entry = savedTraverses.find((s) => s.id === id);
    if (entry) handleTraverse(entry.vertices, entry.id);
  };

  /** Delete a saved line (defaults to the selected one — the traverse
   *  window's X button; the explorer passes an explicit entry). */
  const deleteSavedTraverse = async (target = null) => {
    const entry = target || savedTraverses.find((s) => s.id === traverseSavedId);
    if (!entry || !volume || !manifest) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete saved traverse "${entry.name}"?`)) return;
    setTraverseBusy(true);
    try {
      const next = await saveManifestTraverses(
        volume, manifest, savedTraverses.filter((s) => s.id !== entry.id),
      );
      setManifest(next);
      // the drawn line stays on screen
      setTraverseSavedId((id) => (id === entry.id ? null : id));
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setTraverseBusy(false);
    }
  };

  const lineLabel = useMemo(() => {
    if (!manifest) return '';
    const g = manifest.geometry;
    if (orientation === 'inline') return `IL ${g.il.min + sliceIndex * g.il.step}`;
    if (orientation === 'xline') return `XL ${g.xl.min + sliceIndex * g.xl.step}`;
    return `${(sliceIndex * g.dt_us) / 1000} ms`;
  }, [manifest, orientation, sliceIndex]);

  // ---- workspace tree model + actions (explorer props) -------------------
  const tree = {
    volumes: allVolumes,
    activeVolumeId: volume?.id || null,
    volumeBusyId,
    horizons,
    visibleIds,
    horizonBusyId,
    editTargetId: editTarget !== 'new' ? editTarget : null,
    faults,
    visibleFaultIds,
    faultBusyId,
    wells: wellsApi.wells,
    visibleWellIds: wellsApi.visibleIds,
    wellBusyId: wellsApi.busyId,
    wellsError: wellsApi.error,
    savedTraverses,
    traverseSavedId,
  };

  const treeActions = {
    selectVolume,
    deleteVolume: deleteVolumeAction,
    openImport: () => setOpenDialog('import'),
    openWellImport: () => setOpenDialog('wellImport'),
    openExport: () => setOpenDialog('export'),
    refresh: () => { setVolumesRefresh((k) => k + 1); wellsApi.reload(); },
    toggleHorizon,
    deleteHorizon: onDeleteHorizon,
    setEditTarget: changeEditTarget,
    toggleFault,
    deleteFault: onDeleteFault,
    toggleWell: wellsApi.toggle,
    deleteWell: wellsApi.remove,
    openTraverse: (t) => handleTraverse(t.vertices, t.id),
    deleteTraverse: (t) => deleteSavedTraverse(t),
  };

  // ---- ribbon (Petrel-style tabbed top chrome) ----------------------------
  const ribbon = (
    <Ribbon
      corner={(
        <span className="text-sm font-bold text-white mr-3 pb-0.5">Seismolord</span>
      )}
      trailing={(
        <button
          type="button"
          title="Toggle the interpretation copilot dock"
          onClick={() => setDockOpen((o) => !o)}
          className={`p-1 rounded ${dockOpen
            ? 'text-cyan-300 bg-cyan-500/10' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Bot className="w-4 h-4" />
        </button>
      )}
      tabs={[
        {
          key: 'home',
          label: 'Home',
          content: (
            <HomeTab
              volumes={volumes}
              volume={volume}
              selectVolume={selectVolume}
              manifest={manifest}
              orientation={orientation}
              setOrientation={setOrientation}
              lineLabel={lineLabel}
              sliceIndex={sliceIndex}
              maxIndex={maxIndex}
              changeIndex={changeIndex}
              colormap={colormap}
              setColormap={setColormap}
              gain={gain}
              setGain={setGain}
              clipRms={clipRms}
              setClipRms={setClipRms}
              polarity={polarity}
              setPolarity={setPolarity}
              traceBalance={traceBalance}
              setTraceBalance={setTraceBalance}
            />
          ),
        },
        {
          key: 'interpretation',
          label: 'Interpretation',
          content: (
            <InterpretationTab
              manifest={manifest}
              orientation={orientation}
              slice={slice}
              pickMode={pickMode}
              setPickMode={setPickMode}
              seedPick={seedPick}
              snapMode={snapMode}
              setSnapMode={setSnapMode}
              snapWindow={snapWindow}
              setSnapWindow={setSnapWindow}
              tracking={tracking}
              trackHorizon={trackHorizon}
              cancelTracking={cancelTracking}
              track2D={track2D}
              editTarget={editTarget}
              changeEditTarget={changeEditTarget}
              horizons={horizons}
              toggleEditTool={toggleEditTool}
              eraseSize={eraseSize}
              setEraseSize={setEraseSize}
              edit={edit}
              editBusy={editBusy}
              undoEdit={undoEdit}
              saveEdits={saveEdits}
              discardEdits={discardEdits}
              smoothEdits={smoothEdits}
              smoothMethod={smoothMethod}
              setSmoothMethod={setSmoothMethod}
              smoothRadius={smoothRadius}
              setSmoothRadius={setSmoothRadius}
              fillHoles={fillHoles}
              draftSticks={draftSticks}
              endStick={endStick}
              saveDraftFault={saveDraftFault}
              discardDraft={discardDraft}
              openVelocity={() => setOpenDialog('velocity')}
              velocityModel={velocityModel}
            />
          ),
        },
        {
          key: 'wells',
          label: 'Wells',
          content: (
            <WellsTab
              openWellImport={() => setOpenDialog('wellImport')}
              setAllWellsVisible={wellsApi.setAllVisible}
              wellsCount={wellsApi.wells.length}
              openCalibrate={() => { setCalOpen(true); setOpenDialog('velocity'); }}
              velocityForDisplay={velocityForDisplay}
              visibleWells={wells}
              horizons={horizons}
            />
          ),
        },
        {
          key: 'export',
          label: 'Export',
          content: (
            <ExportTab volume={volume} openExport={() => setOpenDialog('export')} />
          ),
        },
        {
          key: 'ai',
          label: 'AI',
          content: (
            <AiTab
              copilotOpen={dockOpen}
              toggleCopilot={() => setDockOpen((o) => !o)}
            />
          ),
        },
      ]}
    />
  );

  return (
    <>
      <WorkspaceShell
        ribbon={ribbon}
        explorer={<SeismicExplorer tree={tree} actions={treeActions} />}
        dockOpen={dockOpen}
        onDockOpenChange={setDockOpen}
        dock={(
          <RightDock
            title="Interpretation copilot"
            onClose={() => setDockOpen(false)}
          >
            <AiPanel docked volume={volume} manifest={manifest} />
          </RightDock>
        )}
        statusBar={(
          <StatusBar
            volumeName={volume?.name || null}
            lineLabel={manifest ? lineLabel : ''}
            sliceMs={sliceMs}
            tracking={tracking}
            error={error}
            backend={backend}
            registerCursorSink={registerCursorSink}
          />
        )}
        center={(
          <div className="h-full min-h-0 p-2">
        <ViewerWindows
          fill
          defaultOpen={['section']}
          focus={winFocus}
          windows={[
            {
              key: 'section',
              title: 'Section',
              icon: ScanLine,
              content: (
                <SliceView
                  // only hand over a slice that matches the current
                  // orientation — an orientation switch must not render the
                  // old slice under the new axes while the new one assembles.
                  // sliceIndex follows the DISPLAYED slice while a scrub's
                  // assembly is in flight so overlays and image agree (ML4)
                  slice={manifest && slice && slice.orientation === orientation ? slice : null}
                  geom={geom}
                  manifest={manifest}
                  orientation={orientation}
                  sliceIndex={manifest && slice && slice.orientation === orientation
                    ? slice.index : sliceIndex}
                  display={display}
                  overlays={overlays}
                  pickMode={pickMode}
                  ghost={pickMode === 'manual' ? { mode: snapMode, window: snapWindow } : null}
                  loading={loading}
                  depthConv={depthConv}
                  onPick={handlePick}
                  onPickEnd={commitStroke}
                  onStepSlice={stepSlice}
                  onCursor={handleCursor}
                  height="fill"
                  vexag={vexag}
                  onVexagChange={setVexag}
                />
              ),
            },
            {
              key: '3d',
              title: '3D',
              icon: Box,
              content: (
                <CubeView
                  geom={geom}
                  manifest={manifest}
                  getBrick={getBrick}
                  indices={indices}
                  onChangeIndex={changeIndex}
                  display={display}
                  vexag={vexag}
                  horizons={resolvedHorizons}
                  faults={overlays.faults}
                  wells={wellSections}
                  depthConv={depthConv}
                  onSelectPlane={selectPlane}
                  height="fill"
                />
              ),
            },
            {
              key: 'traverse',
              title: 'Traverse',
              icon: Route,
              content: (
                <div className="h-full min-h-0 flex flex-col">
                  <div className="shrink-0 flex flex-wrap items-center gap-2 mb-1">
                    <select
                      className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs max-w-[180px]"
                      value={traverseSavedId || ''}
                      onChange={(e) => selectSavedTraverse(e.target.value)}
                      disabled={!manifest || (!savedTraverses.length && !traverse)}
                      title="Saved traverse lines on this volume"
                    >
                      <option value="">— drawn line —</option>
                      {savedTraverses.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <Button
                      variant="outline" size="sm"
                      onClick={saveTraverseAs}
                      disabled={!traverse || traverseBusy}
                      title="Save the current line on this volume (survives reloads and volume switches)"
                    >
                      {traverseBusy
                        ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        : <Save className="w-4 h-4 mr-1" />}
                      Save line
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="text-slate-400 hover:text-red-400"
                      onClick={() => deleteSavedTraverse()}
                      disabled={!traverseSavedId || traverseBusy}
                      title="Delete the selected saved traverse (the section stays until replaced)"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    {traverse && (
                      <span className="text-xs text-slate-500">
                        {`A → A′: ${traverse.positions.length} traces`}
                        {traverse.lengthM != null
                          && ` · ${(traverse.lengthM / 1000).toFixed(2)} km`}
                        {' · pick with Manual / Erase'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-h-0">
                  <SliceView
                    slice={traverseSlice}
                    geom={geom}
                    manifest={manifest}
                    orientation="traverse"
                    sliceIndex={0}
                    display={display}
                    overlays={overlays}
                    pickMode={pickMode === 'manual' || pickMode === 'erase' ? pickMode : null}
                    ghost={pickMode === 'manual' ? { mode: snapMode, window: snapWindow } : null}
                    loading={traverseLoading}
                    depthConv={depthConv}
                    onPick={handleTraversePick}
                    onPickEnd={commitStroke}
                    onCursor={handleCursor}
                    height="fill"
                    vexag={vexag}
                    onVexagChange={setVexag}
                    emptyHint={manifest
                      ? 'Draw a traverse in the Map window (traverse tool: click vertices, double-click to finish) or load a saved line above.'
                      : undefined}
                  />
                  </div>
                </div>
              ),
            },
            {
              key: 'map',
              title: 'Map',
              icon: MapIcon,
              content: (
                <MapView
                  manifest={manifest}
                  geom={geom}
                  horizons={resolvedHorizons}
                  faults={overlays.faults}
                  velocity={velocityForDisplay}
                  velocityBoundaries={velBoundaries}
                  onNavigate={navigateTo}
                  onEraseRegion={eraseRegion}
                  traverse={traverse ? traverse.vertices : null}
                  onTraverse={handleTraverse}
                  savedTraverses={savedTraverses}
                  onAmplitude={extractAmplitude}
                  wells={wells}
                  onCursor={handleCursor}
                  height="fill"
                />
              ),
            },
          ]}
        />
          </div>
        )}
      />

      {/* Heavyweight workflows live in modal dialogs over the workspace. */}
      <ImportSegyDialog
        open={openDialog === 'import'}
        onOpenChange={(o) => setOpenDialog(o ? 'import' : null)}
        onIngested={() => setVolumesRefresh((k) => k + 1)}
      />

      <ExportDialog
        open={openDialog === 'export'}
        onOpenChange={(o) => setOpenDialog(o ? 'export' : null)}
        volume={volume}
        manifest={manifest}
      />

      <WellImportDialog
        open={openDialog === 'wellImport'}
        onOpenChange={(o) => setOpenDialog(o ? 'wellImport' : null)}
        onSave={async (draft) => {
          await wellsApi.save(draft);
          setOpenDialog(null);
        }}
      />

      <VelocityModelDialog
        open={openDialog === 'velocity'}
        onOpenChange={(o) => setOpenDialog(o ? 'velocity' : null)}
      >
        {manifest && (
          <VelocityModelEditor
            velMode={velMode}
            setVelMode={setVelMode}
            velDraft={velDraft}
            setVelDraft={setVelDraft}
            velLayers={velLayers}
            setVelLayers={setVelLayers}
            velBusy={velBusy}
            saveVelocity={saveVelocity}
            velocityModel={velocityModel}
            velocityForDisplay={velocityForDisplay}
            velBoundaries={velBoundaries}
            calOpen={calOpen}
            setCalOpen={setCalOpen}
            horizons={horizons}
            wells={wells}
            manifest={manifest}
            geom={geom}
            loadGridById={loadGridById}
            applyCalibratedModel={applyCalibratedModel}
          />
        )}
      </VelocityModelDialog>

    </>
  );
}
