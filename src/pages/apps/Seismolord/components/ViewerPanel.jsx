import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Route, Box, ScanLine, Save, Map as MapIcon, X, Bot, Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  listVolumes, deleteVolume, getManifest, setVolumeShared,
  listProjects, createProject, deleteProject, assignVolumeProject,
} from '../services/volumesService';
import {
  resolveInterpState, interpNeedsMigration, composeManifest,
  applyVelocityToManifest, applyTraversesToManifest,
  getVolumeRow, saveVolumeVelocity, saveVolumeTraverses, migrateInterpState,
} from '../services/interpState';
import {
  saveHorizon, listHorizons, loadHorizonGrid, deleteHorizon, updateHorizon,
  loadHorizonConfidence,
  updateHorizonMeta,
} from '../services/horizonsService';
import { saveFault, listFaults, deleteFault } from '../services/faultsService';
import { placeWellsForHost } from '@/lib/crs/guards';
import { faultSticksToRows, writeCharismaFaultSticks } from '../engine/pickExport';
import { faultHorizonIntersection } from '../engine/faultObjects';
import { faultSurfaceXyz, faultPolygonCsv, barriersFromFaults } from '../lib/faultObjectsExport';
import {
  listVolumeSurfaces, exportStoredSurface, loadSurfaceMapLayer,
  surfaceSectionGrid, setSurfaceShared,
  deleteSurface as deleteRegistrySurface,
} from '../services/surfacesService';
import {
  listLogs, downloadCurve, effectiveCheckshots, saveDerivedCheckshots,
} from '../services/wellsService';
import { BrickCache, storageBrickFetcher, ABORTED } from '../engine/brickCache';
import {
  assembleSlice, assembleTrace, bricksForSlice, geomFromManifest, brickKey,
} from '../engine/sliceAssembly';
import {
  resampleTraverse, assembleTraverse, traverseEraseCells, sanitizeTraverses,
} from '../engine/traverse';
import {
  extractHorizonAmplitude, bricksForHorizonAmplitude,
  extractIntervalAttribute, bricksForIntervalAttribute, extractHorizonIsofrequency,
} from '../engine/horizonAmplitude';
import { makeTvdssToTwt, buildWellLatticePath } from '../engine/wellSection';
import {
  depthAxisFor, depthStretchSlice, depthRowGrid, depthRowOfSample,
} from '../engine/depthConvert';
import { surveyAffine, sameLattice } from '../engine/surveyGeometry';
import {
  snapPick, autotrack2D, smoothHorizon, fillHorizonHoles,
} from '../engine/horizonTrack';
import {
  normalizeVelocity, describeVelocity, velocityToManifest, makeDepthConverter,
} from '../engine/velocityModel';
import { NULL_VALUE } from '../engine/manifest';
import { amplitudePercentile } from '../engine/displayEnhance';
import { UndoStack } from '../lib/undoStack';
import { captureLocal, applyLocal, clampIndices } from '../lib/sessionSnapshot';
import SessionsDialog from './workspace/dialogs/SessionsDialog';
import CultureImportDialog from '@/components/culture/CultureImportDialog';
import {
  listCulture, downloadCultureFeatures, deleteCulture, setCultureShared,
} from '@/lib/cultureRegistry';
import { reprojectFeatures } from '@/lib/cultureImport';
import { transformPoint, crsDisplayName } from '@/lib/crs';
import { normalizeTag, isTransformableTag, LOCAL } from '@/lib/crs/tags';
import PlotDialog from './workspace/dialogs/PlotDialog';
import ComputeAttributeDialog from './workspace/dialogs/ComputeAttributeDialog';
import { SEISMIC_COLORMAPS } from '../viewer/SliceRenderer';
import SliceView from './SliceView';
import SyntheticsPanel from './SyntheticsPanel';
import CubeView from './CubeView';
import MapView from './MapView';
import ViewerWindows from './ViewerWindows';
import AiPanel from './AiPanel';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import Ribbon from './workspace/Ribbon';
import HomeTab from './workspace/ribbonTabs/HomeTab';
import InterpretationTab from './workspace/ribbonTabs/InterpretationTab';
import WellsTab from './workspace/ribbonTabs/WellsTab';
import ExportTab from './workspace/ribbonTabs/ExportTab';
import AiTab from './workspace/ribbonTabs/AiTab';
import VelocityModelEditor from './workspace/VelocityModelEditor';
import ImportSegyDialog from './workspace/dialogs/ImportSegyDialog';
import ExportDialog from './workspace/dialogs/ExportDialog';
import ImportSurfaceDialog from './workspace/dialogs/ImportSurfaceDialog';
import WellImportDialog from './workspace/dialogs/WellImportDialog';
import VelocityModelDialog from './workspace/dialogs/VelocityModelDialog';
import HorizonSettingsDialog from './workspace/dialogs/HorizonSettingsDialog';
import SeismicExplorer from './workspace/SeismicExplorer';
import StatusBar from './workspace/StatusBar';
import RightDock from './workspace/RightDock';
import { horizonColor, faultColor, surfaceColor } from './workspace/interpretationColors';
import useWells from '../hooks/useWells';
import useBackendStatus from '../hooks/useBackendStatus';

const NULL_F32 = Math.fround(NULL_VALUE);

const DRAFT_COLOR = '#facc15';

// Explorer slice-plane visibility (Feature: volume tree children). Same
// localStorage idiom as the map/cube layer prefs — a display preference,
// not project data.
const SLICE_VIS_KEY = 'seismolord.sliceVis.v1';
const DEFAULT_SLICE_VIS = { inline: false, xline: false, time: false };
const loadSliceVis = () => {
  try {
    return { ...DEFAULT_SLICE_VIS, ...JSON.parse(localStorage.getItem(SLICE_VIS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SLICE_VIS };
  }
};

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
  // computed world paths so the viewer windows just draw. The CRS
  // guard (placeWellsForHost, below the volume state) converts or
  // flags them against the active volume's frame before any window
  // draws them.
  const wellsApi = useWells();
  const rawWells = wellsApi.visible;
  const backend = useBackendStatus();

  const [volumesRefresh, setVolumesRefresh] = useState(0);
  const [projects, setProjects] = useState([]);      // W4.2 explorer grouping
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
  // Effective manifest: the frozen storage manifest composed with the
  // row's interpretation state (velocity / calibration / traverses).
  // Storage manifest.json is never rewritten after ingest (W0.2).
  const [manifest, setManifest] = useState(null);
  // seismic_volumes.interp_rev this session read; every save is a CAS
  // against it and adopts the bumped value from the returned row.
  const [interpRev, setInterpRev] = useState(0);
  // W1.2 global interpretation undo/redo. Commands read CURRENT values
  // through refs (interpRevRef, draftSticksRef) because they execute
  // long after the closures that created them.
  const [, setUndoTick] = useState(0);
  const [undoStack] = useState(() => new UndoStack(60, () => setUndoTick((t) => t + 1)));
  const interpRevRef = useRef(0);
  const draftSticksRef = useRef([]);
  // W1.2b sessions/bookmarks: camera access into the section + map
  // windows, the pending restore applied once the volume opens, and an
  // epoch key that remounts the window tree so localStorage-backed
  // layout/prefs re-read after a session restore.
  const sectionCameraApi = useRef(null);
  const mapCameraApi = useRef(null);
  const pendingRestoreRef = useRef(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // CRS guard: wells convert into the active volume's frame when both
  // tags are known, render flagged when either is unknown, and drop
  // (with a toast) when a local grid meets a georeferenced frame.
  const wellsPlacement = useMemo(
    () => placeWellsForHost(rawWells, volume?.crs),
    [rawWells, volume?.crs],
  );
  const wells = wellsPlacement.wells;
  const skippedWellNames = wellsPlacement.skipped.map((s) => s.name).join(', ');
  useEffect(() => {
    if (!skippedWellNames) return;
    toast({
      title: 'Wells not shown on this volume',
      description: `${skippedWellNames}: local grid data cannot be placed on a georeferenced survey.`,
      variant: 'destructive',
    });
  }, [skippedWellNames, toast]);
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
  // W1.1 display upgrades: amplitude scaling mode (global-RMS multiple /
  // per-slice percentile / manual absolute), windowed AGC, wiggle/VA
  // rendering, colormap reversal
  const [scaleMode, setScaleMode] = useState('rms');
  const [clipPct, setClipPct] = useState(98);
  const [manualClip, setManualClip] = useState(0);   // 0 = unset (rms fallback)
  const [agcOn, setAgcOn] = useState(false);
  const [agcWindowMs, setAgcWindowMs] = useState(120);
  const [wiggleMode, setWiggleMode] = useState('off');
  const [reverseCmap, setReverseCmap] = useState(false);
  // W2.4 co-render: second same-lattice volume blended over the primary
  // in the section window; its bricks live in their own 128 MiB cache so
  // primary scrubs never abort overlay fetches (and vice versa)
  const [overlayVolumeId, setOverlayVolumeId] = useState(null);
  const [overlayInfo, setOverlayInfo] = useState(null);   // {row, manifest}
  const [overlayColormap, setOverlayColormap] = useState('viridis');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [overlayBlend, setOverlayBlend] = useState('mix');
  const [overlaySlice, setOverlaySlice] = useState(null);
  const cacheBRef = useRef(null);
  const overlayReqRef = useRef(0);
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

  // explorer slice-plane toggles + the assembled time slice the Map
  // window rasters (independent of the Section window's slice)
  const [sliceVis, setSliceVis] = useState(loadSliceVis);
  const [mapTimeSlice, setMapTimeSlice] = useState(null);
  const mapSliceReqRef = useRef(0);
  const mapSliceBricksRef = useRef(null);       // Set<brickKey> while assembling

  // per-horizon display settings: session overrides layered over the
  // persisted row params.display; the settings dialog edits live and a
  // debounced updateHorizonMeta writes them back to the row
  const [horizonDisplay, setHorizonDisplay] = useState({});
  const [settingsId, setSettingsId] = useState(null);   // horizon settings dialog target
  const [settingsSaving, setSettingsSaving] = useState(false);
  const settingsTimersRef = useRef(new Map());  // horizon id -> debounce timer
  const horizonsRef = useRef([]);

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
  // W3.2 Tracker 2.0: correlation threshold (ncc mode) + fault-aware
  // growth toggle (barriers from the fault surfaces at the seed level)
  const [corrThreshold, setCorrThreshold] = useState(0.7);
  const [stopAtFaults, setStopAtFaults] = useState(false);
  // seed clicks and manual picks still snap to an EVENT in ncc mode —
  // correlation needs a waveform anchor, not a raw click position
  const eventSnapMode = snapMode === 'ncc' ? 'peak' : snapMode;
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
  // per-render mirrors for undo commands (see undoStack above)
  draftSticksRef.current = draftSticks;
  interpRevRef.current = interpRev;

  const volumeIdRef = useRef(null);             // selected id for list-refresh checks

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setProjects([]));
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
      const row = await saveVolumeVelocity(volume, model, null, interpRev);
      setInterpRev(row.interp_rev);
      setManifest((m) => applyVelocityToManifest(m, model, null));
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
   *  provenance persists alongside (velocity_calibration) so depth
   *  exports can record wells_used; a manual editor save clears it
   *  again (saveVolumeVelocity with null calibration). */
  const applyCalibratedModel = async (model, calibration) => {
    const row = await saveVolumeVelocity(volume, model, calibration, interpRev);
    setInterpRev(row.interp_rev);
    setManifest((m) => applyVelocityToManifest(m, model, calibration));
    toast({ title: 'Velocity model calibrated', description: describeVelocity(model) });
  };

  /** W3.3: persist a tie warp as the well's DERIVED checkshot set (the
   *  imported set is never overwritten), then refresh wells so every
   *  T(z) consumer picks it up. */
  const commitDerivedCheckshots = async (well, payload) => {
    payload.provenance = { ...payload.provenance, volume_id: volume?.id || null };
    await saveDerivedCheckshots(well.id, payload);
    wellsApi.reload();
    toast({
      title: 'Derived checkshots saved',
      description: `${well.name}: ${payload.rows.length} rows from the tie warp — synthetics and well displays now use them.`,
    });
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

  // resolved survey affine (well overlays + the synthetics window)
  const affine = useMemo(
    () => (manifest ? surveyAffine(manifest.geometry) : null),
    [manifest],
  );

  // wells in TWT: per-well T(z) (its own checkshots first, else the
  // volume model inverted — plan decision #4, never mixed) + the dense
  // lattice path with tops; wells without either stay map-only
  const wellSections = useMemo(() => {
    if (!wells || !wells.length || !manifest || !geom) return [];
    if (!affine) return [];
    const dtUs = manifest.geometry.dt_us;
    const maxTwtMs = ((geom.ns - 1) * dtUs) / 1000;
    const out = [];
    for (const w of wells) {
      // W3.3: a committed tie-derived checkshot set wins over imported
      const timeConv = makeTvdssToTwt({
        checkshots: effectiveCheckshots(w).rows,
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
  }, [wells, manifest, geom, affine, velocityForDisplay, velBoundaries]);

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

  // ---- W1.2 global undo/redo router ------------------------------------
  // An active horizon edit session keeps its own cell-level undo and
  // takes priority; everything else runs through the command stack.
  const undoAction = useCallback(async () => {
    if (editRef.current?.undo.length) { undoEdit(); return; }
    try {
      const c = await undoStack.undo();
      if (c) toast({ title: 'Undone', description: c.label });
    } catch (e) {
      toast({ title: 'Undo failed', description: e.message, variant: 'destructive' });
    }
  }, [undoEdit, undoStack, toast]);

  const redoAction = useCallback(async () => {
    try {
      const c = await undoStack.redo();
      if (c) toast({ title: 'Redone', description: c.label });
    } catch (e) {
      toast({ title: 'Redo failed', description: e.message, variant: 'destructive' });
    }
  }, [undoStack, toast]);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), skipped while typing
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (!mod || (k !== 'z' && k !== 'y')) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
        || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      if (k === 'z' && !e.shiftKey) undoAction();
      else redoAction();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoAction, redoAction]);

  // ---- W1.2b sessions & bookmarks --------------------------------------
  // Cameras restore once the right slice is on screen (the transforms
  // re-fit on slice arrival, which would wipe an earlier set()).
  useEffect(() => {
    const pr = pendingRestoreRef.current;
    if (!pr || !slice) return;
    if (pr.camera && sectionCameraApi.current) sectionCameraApi.current.set(pr.camera);
    if (pr.mapCamera && mapCameraApi.current) mapCameraApi.current.set(pr.mapCamera);
    pendingRestoreRef.current = null;
  }, [slice]);

  const captureBookmark = () => ({
    v: 1,
    volume_id: volume?.id || null,
    orientation,
    indices,
    vexag,
    camera: sectionCameraApi.current ? sectionCameraApi.current.get() : null,
    mapCamera: mapCameraApi.current ? mapCameraApi.current.get() : null,
  });

  const captureSession = () => ({
    ...captureBookmark(),
    display: {
      colormap,
      gain,
      clipRms,
      polarity,
      traceBalance,
      scaleMode,
      clipPct,
      manualClip,
      agcOn,
      agcWindowMs,
      wiggleMode,
      reverseCmap,
    },
    visibleIds: [...visibleIds],
    visibleFaultIds: [...visibleFaultIds],
    visibleSurfaceIds: [...visibleSurfaceIds],
    sliceVis,
    local: captureLocal(window.localStorage),
  });

  /** Bookmark restore: navigation only. */
  const restoreBookmark = async (payload) => {
    if (!payload?.volume_id) throw new Error('This entry points at no volume.');
    if (!volumes.some((x) => x.id === payload.volume_id)) {
      throw new Error('The volume this entry points at no longer exists.');
    }
    pendingRestoreRef.current = payload;
    await selectVolume(payload.volume_id);
  };

  /** Session restore: local layout/prefs first (the window tree remounts
   *  via the epoch key to re-read them), then display state, then
   *  navigation through the same pending-restore path. */
  const restoreSession = async (payload) => {
    applyLocal(payload?.local, window.localStorage);
    setSessionEpoch((e) => e + 1);
    const d = payload?.display || {};
    if (SEISMIC_COLORMAPS.some((c) => c.key === d.colormap)) setColormap(d.colormap);
    if (Number.isFinite(d.gain)) setGain(d.gain);
    if (Number.isFinite(d.clipRms)) setClipRms(d.clipRms);
    if (d.polarity === 1 || d.polarity === -1) setPolarity(d.polarity);
    if (typeof d.traceBalance === 'boolean') setTraceBalance(d.traceBalance);
    if (['rms', 'pct', 'manual'].includes(d.scaleMode)) setScaleMode(d.scaleMode);
    if (Number.isFinite(d.clipPct)) setClipPct(d.clipPct);
    if (Number.isFinite(d.manualClip)) setManualClip(d.manualClip);
    if (typeof d.agcOn === 'boolean') setAgcOn(d.agcOn);
    if (Number.isFinite(d.agcWindowMs)) setAgcWindowMs(d.agcWindowMs);
    if (['off', 'overlay', 'only'].includes(d.wiggle ?? d.wiggleMode)) {
      setWiggleMode(d.wiggle ?? d.wiggleMode);
    }
    if (typeof d.reverseCmap === 'boolean') setReverseCmap(d.reverseCmap);
    if (payload?.volume_id) await restoreBookmark(payload);
    else pendingRestoreRef.current = null;
  };

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
    mapSliceReqRef.current += 1;                  // supersede in-flight time slice
    mapSliceBricksRef.current = null;
    setMapTimeSlice(null);
    setHorizonDisplay({});
    setSettingsId(null);
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
    undoStack.clear();               // commands reference the old volume
    // the co-render overlay is per-primary-volume state
    setOverlayVolumeId(null);
    setOverlayInfo(null);
    setOverlaySlice(null);
    cacheBRef.current?.clear();
    cacheBRef.current = null;
    setError(null);
    if (!v) { setHorizons([]); setFaults([]); return; }
    setLoading(true);
    try {
      const [m, row, hz, flt] = await Promise.all([
        getManifest(v),
        // the list snapshot's interp_rev may be stale; CAS needs fresh
        getVolumeRow(v.id).catch(() => v),
        listHorizons(v.id).catch(() => []),
        listFaults(v.id).catch(() => []),
      ]);
      let interp = resolveInterpState(row, m);
      if (interp.rev === 0 && interpNeedsMigration(m)) {
        // one-time write-through of legacy manifest interp state; a
        // failure (offline, race) just keeps the manifest fallback
        try {
          interp = resolveInterpState(await migrateInterpState(v, m), m);
        } catch { /* fallback already in place */ }
      }
      if (seq !== selectSeqRef.current) return;   // a newer selection won; drop this one
      cacheRef.current = new BrickCache(
        storageBrickFetcher({ supabaseUrl: storageBase(), getToken: accessToken }),
        { maxBytes: 256 * 1024 * 1024 },
      );
      setInterpRev(interp.rev);
      setManifest(composeManifest(m, interp));
      setHorizons(hz);
      setFaults(flt);
      // a session/bookmark restore lands its navigation state here, once
      // the manifest is in (indices clamp against the live geometry;
      // stale layer ids are filtered against the fresh lists)
      const pr = pendingRestoreRef.current;
      if (pr && pr.volume_id === v.id) {
        setOrientation(['inline', 'xline', 'time'].includes(pr.orientation)
          ? pr.orientation : 'inline');
        setIndices(clampIndices(pr.indices, m.geometry));
        if (Array.isArray(pr.visibleIds)) {
          setVisibleIds(new Set(pr.visibleIds.filter((id) => hz.some((h) => h.id === id))));
        }
        if (Array.isArray(pr.visibleFaultIds)) {
          setVisibleFaultIds(new Set(pr.visibleFaultIds.filter((id) => flt.some((f) => f.id === id))));
        }
        if (Array.isArray(pr.visibleSurfaceIds)) {
          setVisibleSurfaceIds(new Set(pr.visibleSurfaceIds));
        }
        if (pr.sliceVis) setSliceVis(pr.sliceVis);
        if (Number.isFinite(pr.vexag)) setVexag(pr.vexag);
      } else {
        setOrientation('inline');
        setIndices({
          inline: Math.floor(m.geometry.il.count / 2),
          xline: Math.floor(m.geometry.xl.count / 2),
          time: Math.floor(m.geometry.ns / 2),
        });
      }
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

  /** W4.1: share/unshare an own volume with the caller's organization —
   *  read-only for members (bricks, manifest, everyone's horizons and
   *  faults included). */
  const onShareVolume = async (v) => {
    setVolumeBusyId(v.id);
    try {
      await setVolumeShared(v, !v.organization_id);
      toast(v.organization_id
        ? { title: 'Volume is private again', description: `${v.name} is no longer visible to your organization.` }
        : { title: 'Volume shared', description: `${v.name} is now read-only visible to your organization (interpretations included).` });
      setVolumesRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Share failed', description: e.message, variant: 'destructive' });
    } finally {
      setVolumeBusyId(null);
    }
  };

  // ---- W4.2 projects ----------------------------------------------------
  const onCreateProject = async () => {
    // eslint-disable-next-line no-alert
    const name = window.prompt('Project name:');
    if (!name) return;
    try {
      await createProject(name);
      setVolumesRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Could not create project', description: e.message, variant: 'destructive' });
    }
  };

  const onDeleteProject = async (p) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete project "${p.name}"? Its volumes stay — they return to the flat list.`)) return;
    try {
      await deleteProject(p);
      setVolumesRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Could not delete project', description: e.message, variant: 'destructive' });
    }
  };

  const onMoveVolumeToProject = async (v, projectId) => {
    try {
      await assignVolumeProject(v, projectId);
      setVolumesRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Could not move volume', description: e.message, variant: 'destructive' });
    }
  };

  // W4.1 read-only gating: on a teammate's shared volume, MY tracking /
  // fault picking works (own rows under my storage path), but volume-row
  // interpretation state (velocity, traverses) is owner-only
  const volumeReadOnly = Boolean(volume && volume.is_own === false);

  const getBrick = useCallback((i, j, k) => cacheRef.current
    .get(brickKey(volume.storage_path, i, j, k)), [volume]);

  // ---- W2.4 co-render overlay ------------------------------------------

  /** Same-lattice candidates for the overlay picker, judged from the
   *  registered survey_meta (no manifest fetch needed); the ACTIVE
   *  volume's own derived attributes list first. */
  const overlayCandidates = useMemo(() => {
    if (!volume || !manifest) return [];
    const pm = { geometry: manifest.geometry };
    return volumes
      .filter((v) => v.id !== volume.id && v.status === 'ready'
        && v.survey_meta?.il && sameLattice(pm, { geometry: v.survey_meta }))
      .sort((a, b) => (b.parent_volume_id === volume.id ? 1 : 0)
        - (a.parent_volume_id === volume.id ? 1 : 0));
  }, [volumes, volume, manifest]);

  const selectOverlayVolume = useCallback(async (id) => {
    setOverlayVolumeId(id || null);
    setOverlayInfo(null);
    setOverlaySlice(null);
    cacheBRef.current?.clear();
    cacheBRef.current = null;
    if (!id) return;
    const row = volumes.find((x) => x.id === id);
    if (!row) return;
    try {
      const m = await getManifest(row);
      if (!sameLattice(manifest, m)) {
        throw new Error('The volumes are not on the same survey lattice.');
      }
      cacheBRef.current = new BrickCache(
        storageBrickFetcher({ supabaseUrl: storageBase(), getToken: accessToken }),
        { maxBytes: 128 * 1024 * 1024 },
      );
      setOverlayInfo({ row, manifest: m });
    } catch (e) {
      toast({ title: 'Co-render unavailable', description: e.message, variant: 'destructive' });
      setOverlayVolumeId(null);
    }
  }, [volumes, manifest, toast]);

  // Assemble the overlay's matching slice AFTER the primary lands (the
  // overlay lags one beat on scrub by design); errors degrade to a toast
  // and turn the overlay off rather than wedging the section window.
  useEffect(() => {
    if (!slice || !overlayInfo || !cacheBRef.current) {
      setOverlaySlice(null);
      return undefined;
    }
    let stale = false;
    const req = ++overlayReqRef.current;
    const geomB = geomFromManifest(overlayInfo.manifest);
    const needed = new Set(bricksForSlice(geomB, slice.orientation, slice.index)
      .map(({ i, j, k }) => brickKey(overlayInfo.row.storage_path, i, j, k)));
    cacheBRef.current.cancelPendingExcept(needed);
    const getB = (i, j, k) => cacheBRef.current
      .get(brickKey(overlayInfo.row.storage_path, i, j, k));
    assembleSlice(getB, geomB, slice.orientation, slice.index)
      .then((s) => {
        if (!stale && req === overlayReqRef.current) {
          setOverlaySlice({ ...s, orientation: slice.orientation, index: slice.index });
        }
      })
      .catch((e) => {
        if (stale || req !== overlayReqRef.current || e.message === ABORTED) return;
        toast({ title: 'Co-render overlay unavailable', description: e.message, variant: 'destructive' });
        setOverlayVolumeId(null);
        setOverlayInfo(null);
        setOverlaySlice(null);
      });
    return () => { stale = true; };
  }, [slice, overlayInfo, toast]);

  /** Overlay display params: its OWN volume's rms drives the clip (the
   *  shared RMS-multiple), sequential-map default, no trace balance. */
  const overlayDisplay = useMemo(() => {
    if (!overlayInfo) return null;
    const statsRms = overlayInfo.manifest?.stats?.rms || 1;
    return {
      colormap: overlayColormap,
      reverse: false,
      gain: 1,
      polarity: 1,
      clip: Math.max(statsRms * clipRms, 1e-12),
      traceBalance: false,
      opacity: overlayOpacity,
      mode: overlayBlend,
    };
  }, [overlayInfo, overlayColormap, overlayOpacity, overlayBlend, clipRms]);

  // ---- synthetics window (G5) -------------------------------------------
  // pipeline runs in a dedicated worker (big sonic logs never block the
  // UI); one persistent worker, job-id-matched replies
  const synthWorkerRef = useRef(null);
  const synthJobRef = useRef(0);
  const synthesize = useCallback((params) => new Promise((resolve, reject) => {
    if (!synthWorkerRef.current) {
      synthWorkerRef.current = new Worker(
        new URL('../workers/synthetics.worker.js', import.meta.url), { type: 'module' },
      );
    }
    const worker = synthWorkerRef.current;
    const id = ++synthJobRef.current;
    const onMessage = (e) => {
      if (!e.data || e.data.id !== id) return;
      worker.removeEventListener('message', onMessage);
      if (e.data.type === 'error') reject(new Error(e.data.message));
      else resolve(e.data.result);
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'synthesize', id, params });
  }), []);
  useEffect(() => () => {
    if (synthWorkerRef.current) synthWorkerRef.current.terminate();
  }, []);

  // seismic corridor at the well: centre trace ± half crosslines
  const getSyntheticTraces = useCallback(async (ilIdx, xlIdx, half = 2) => {
    if (!geom || !volume) throw new Error('Load a seismic volume first.');
    const traces = [];
    for (let d = -half; d <= half; d++) {
      const xl = Math.min(geom.nXl - 1, Math.max(0, xlIdx + d));
      // eslint-disable-next-line no-await-in-loop
      traces.push(await assembleTrace(getBrick, geom, ilIdx, xl));
    }
    return traces;
  }, [geom, volume, getBrick]);

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
      for (const shield of [traverseBricksRef.current, ampBricksRef.current,
        mapSliceBricksRef.current]) {
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
        // per-horizon display settings (params.display + session edits):
        // color/lineWidth feed every viewport, the rest styles the map
        const disp = { ...(h.params?.display || {}), ...(horizonDisplay[h.id] || {}) };
        out.push({
          id: h.id,
          name: isEditing ? `${h.name} (editing)` : h.name,
          grid,
          color: disp.color || horizonColor(idx),
          lineWidth: disp.lineWidth,
          display: disp,
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
  }, [horizons, visibleIds, toast, edit.version, horizonDisplay]);

  // ---- picking (horizon seed / fault sticks) ----------------------------
  // SliceView already mapped the click through its view transform.
  // useCallback keeps the memoized SliceView from re-rendering on every
  // ViewerPanel state change (gain/clip slider ticks, list refreshes).
  const handlePick = useCallback(async ({ ilIdx, xlIdx, sample }) => {
    if (!pickMode || !geom || !volume || orientation === 'time') return;

    if (pickMode === 'fault') {
      // fault points are raw picks on visible discontinuities — no snap
      const prev = draftSticksRef.current;
      const next = prev.map((s) => [...s]);
      if (next.length === 0) next.push([]);
      next[next.length - 1].push({ il: ilIdx, xl: xlIdx, s: sample });
      setDraftSticks(next);
      undoStack.push({
        label: 'fault stick point',
        undo: () => setDraftSticks(prev),
        redo: () => setDraftSticks(next),
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
        const hit = snapPick(traceData, sample, { mode: eventSnapMode, window: snapWindow });
        applyOp([cell], [hit ? hit.sample : sample]);
      } catch {
        applyOp([cell], [sample]);
      }
      return;
    }

    try {
      const traceData = await assembleTrace(getBrick, geom, ilIdx, xlIdx);
      const hit = snapPick(traceData, sample, { mode: eventSnapMode, window: snapWindow });
      if (!hit) {
        toast({ title: 'No event found', description: 'No event of the selected snap kind near that click — try closer to one.' });
        return;
      }
      setSeedPick({ ilIdx, xlIdx, sample: hit.sample });
    } catch (err) {
      setError(err.message);
    }
  }, [pickMode, geom, volume, orientation, getBrick, toast, snapMode, snapWindow, applyOp,
    eraseSize, undoStack]);

  // ---- fault stick editing ----------------------------------------------
  const endStick = () => {
    const prev = draftSticksRef.current;
    if (!(prev.length && prev[prev.length - 1].length)) return;
    const next = [...prev, []];
    setDraftSticks(next);
    undoStack.push({
      label: 'end fault stick',
      undo: () => setDraftSticks(prev),
      redo: () => setDraftSticks(next),
    });
  };

  const discardDraft = () => {
    const prev = draftSticksRef.current;
    if (!prev.length) return;
    setDraftSticks([]);
    undoStack.push({
      label: 'discard fault draft',
      undo: () => setDraftSticks(prev),
      redo: () => setDraftSticks([]),
    });
  };

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
      const prevDraft = draftSticksRef.current;
      setDraftSticks([]);
      setFaults(await listFaults(volume.id));
      setVisibleFaultIds((s) => new Set([...s, row.id]));
      const box = { row };            // redo re-creates under a NEW id
      undoStack.push({
        label: `save fault "${name}"`,
        undo: async () => {
          await deleteFault(box.row);
          setVisibleFaultIds((s) => { const n = new Set(s); n.delete(box.row.id); return n; });
          setFaults(await listFaults(volume.id));
          setDraftSticks(prevDraft);
        },
        redo: async () => {
          box.row = await saveFault({ volumeId: volume.id, name, sticks });
          setDraftSticks([]);
          setFaults(await listFaults(volume.id));
          setVisibleFaultIds((s) => new Set([...s, box.row.id]));
        },
      });
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

  // Charisma fault-stick download from the stored sticks (the fault
  // mirror of pick export; sign per the pickExport convention — suite
  // negative-down, Petrel-bound files positive-down)
  const onExportFaultSticks = (f, zSign) => {
    try {
      if (!manifest || !affine) throw new Error('The volume has no usable survey coordinates.');
      const geo = manifest.geometry;
      const dtMs = geo.dt_us / 1000;
      const lines = {
        il0: geo.il.min, ilStep: geo.il.step, xl0: geo.xl.min, xlStep: geo.xl.step,
      };
      const sign = zSign === 'positive' ? 1 : -1;
      const rows = faultSticksToRows(f.sticks, affine, (s) => sign * s * dtMs, lines);
      const text = writeCharismaFaultSticks([{ name: f.name, rows }]);
      const safeName = f.name.replace(/[^\w-]+/g, '_').toLowerCase();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}_sticks.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Fault sticks exported', description: `${safeName}_sticks.txt` });
    } catch (e) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
  };

  // W3.1 fault objects: the persisted lofted surface as XYZ, and the
  // horizon-intersection polygon + throw map as CSV (per chosen horizon)
  const downloadText = (text, filename, title, description) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title, description });
  };

  const onExportFaultSurface = (f, zSign) => {
    try {
      if (!manifest || !affine) throw new Error('The volume has no usable survey coordinates.');
      const dtMs = manifest.geometry.dt_us / 1000;
      const out = faultSurfaceXyz(f, affine, dtMs, zSign);
      if (!out) throw new Error('A fault surface needs at least two sticks.');
      const safeName = f.name.replace(/[^\w-]+/g, '_').toLowerCase();
      downloadText(out.text, `${safeName}_surface.xyz`,
        'Fault surface exported', `${out.points} points (TWT ms, ${zSign} down).`);
    } catch (e) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
  };

  const onExportFaultPolygon = async (f, h) => {
    try {
      if (!manifest || !affine || !geom) throw new Error('The volume has no usable survey coordinates.');
      const picks = gridCacheRef.current?.get?.(h.id) || await loadHorizonGrid(h);
      const x = faultHorizonIntersection(f, picks, geom);
      if (!x) {
        toast({
          title: 'No intersection',
          description: `"${f.name}" needs at least two sticks crossing "${h.name}".`,
        });
        return;
      }
      const dtMs = manifest.geometry.dt_us / 1000;
      const { text, segments } = faultPolygonCsv({
        intersection: x, affine, dtMs, faultName: f.name, horizonName: h.name,
      });
      const safe = (v) => v.replace(/[^\w-]+/g, '_').toLowerCase();
      downloadText(text, `${safe(f.name)}_vs_${safe(h.name)}_polygon.csv`,
        'Fault polygon exported',
        `${segments} throw segment(s); cutoff walls + throw/heave per stick.`);
    } catch (e) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
  };

  const onDeleteFault = async (f) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete fault "${f.name}"? (Undo restores it)`)) return;
    setFaultBusyId(f.id);
    try {
      await deleteFault(f);
      setVisibleFaultIds((s) => { const n = new Set(s); n.delete(f.id); return n; });
      setFaults(await listFaults(volume.id));
      // delete-with-restore: the row carries its sticks + params, so a
      // full re-create is possible (under a new id, tracked in the box)
      const box = { row: f };
      undoStack.push({
        label: `delete fault "${f.name}"`,
        undo: async () => {
          box.row = await saveFault({
            volumeId: volume.id, name: f.name, sticks: f.sticks, params: f.params,
          });
          setFaults(await listFaults(volume.id));
          setVisibleFaultIds((s) => new Set([...s, box.row.id]));
        },
        redo: async () => {
          await deleteFault(box.row);
          setVisibleFaultIds((s) => { const n = new Set(s); n.delete(box.row.id); return n; });
          setFaults(await listFaults(volume.id));
        },
      });
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setFaultBusyId(null);
    }
  };

  // ---- horizon editing actions ------------------------------------------

  /** Tracker gates: zero crossings sit at ~0 amplitude, so the RMS-based
   *  amplitude floor only applies to extrema modes. In ncc mode the
   *  snap window doubles as the correlation lag search and the
   *  threshold replaces the amplitude floor. */
  const trackerOpts = useCallback(() => (snapMode === 'ncc'
    ? {
      mode: 'ncc',
      corrHalf: 8,
      corrSearch: snapWindow,
      corrThreshold,
      maxJump: 4,
    }
    : {
      mode: snapMode,
      window: snapWindow,
      maxJump: 4,
      minAbsAmp: snapMode.startsWith('zero') ? 0 : (manifest?.stats?.rms || 0) * 0.3,
    }), [snapMode, snapWindow, corrThreshold, manifest]);

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

  /** W3.2 fault-aware barriers: each visible fault's surface trace at
   *  the tracking level, rasterized. Null when off or nothing reaches. */
  const trackingBarriers = (sampleLevel) => {
    if (!stopAtFaults || !geom) return null;
    return barriersFromFaults(faults, sampleLevel, geom);
  };

  /** Run the region-grow worker and return {picks, confidence}. */
  const runTracker = async ({ seed, extraOpts }) => {
    const id = ++jobIdRef.current;
    setTracking({ tracked: 0, total: geom.nIl * geom.nXl });
    const token = await accessToken();
    const worker = newHorizonWorker();
    workerRef.current = worker;
    try {
      return await new Promise((resolve, reject) => {
        worker.onmessage = async (e) => {
          const msg = e.data;
          if (msg.id !== id) return;
          if (msg.type === 'progress') setTracking({ tracked: msg.tracked, total: msg.total });
          else if (msg.type === 'need-token') {
            worker.postMessage({ type: 'token', nonce: msg.nonce, token: await accessToken() });
          } else if (msg.type === 'done') {
            resolve({
              picks: new Float32Array(msg.picks),
              confidence: msg.confidence ? new Float32Array(msg.confidence) : null,
            });
          } else if (msg.type === 'error') reject(new Error(msg.message));
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
            seed,
            opts: { ...trackerOpts(), ...extraOpts },
          },
        });
      });
    } finally {
      worker.terminate();
      workerRef.current = null;
    }
  };

  const trackHorizon = async () => {
    if (!seedPick || !geom || !volume || !manifest) return;
    try {
      const barriers = trackingBarriers(seedPick.sample);
      const { picks, confidence } = await runTracker({
        seed: seedPick,
        extraOpts: barriers ? { barriers } : {},
      });

      // eslint-disable-next-line no-alert
      const name = window.prompt('Horizon name:', `Horizon ${horizons.length + 1}`);
      if (!name) { setTracking(null); return; }
      const row = await saveHorizon({
        volume,
        name,
        picks,
        seed: seedPick,
        params: { ...trackerOpts(), source: 'track3d', stop_at_faults: Boolean(barriers) },
        dtUs: manifest.geometry.dt_us,
        confidence,
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

  /** W3.2 grow-from-existing: the edit target's live picks all seed the
   *  region grow (values kept bit-exact), new cells fill outward; the
   *  horizon row is UPDATED in place. A picked seed joins in. */
  const growHorizon = async () => {
    if (editTarget === 'new' || !geom || !volume || !manifest) return;
    const h = horizons.find((x) => x.id === editTarget);
    if (!h) return;
    try {
      const initialPicks = gridCacheRef.current.get(h.id) || await loadHorizonGrid(h);
      const level = seedPick?.sample
        ?? (h.stats?.min_twt_ms != null && h.stats?.max_twt_ms != null
          ? ((h.stats.min_twt_ms + h.stats.max_twt_ms) / 2) / (manifest.geometry.dt_us / 1000)
          : null);
      const barriers = level != null ? trackingBarriers(level) : null;
      const { picks, confidence } = await runTracker({
        seed: seedPick || null,
        extraOpts: { initialPicks, ...(barriers ? { barriers } : {}) },
      });
      const row = await updateHorizon({
        horizon: h,
        picks,
        dtUs: manifest.geometry.dt_us,
        params: { ...trackerOpts(), source: 'grow3d', stop_at_faults: Boolean(barriers) },
        confidence,
      });
      cacheGrid(gridCacheRef.current, h.id, picks);
      await reloadHorizons(volume);
      toast({ title: 'Horizon grown', description: `${h.name}: ${row.stats.tracked} traces.` });
    } catch (e) {
      if (!/cancelled/i.test(e.message)) {
        toast({ title: 'Growing failed', description: e.message, variant: 'destructive' });
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

  // ---- explorer slice planes + the map's time slice ----------------------

  horizonsRef.current = horizons;

  useEffect(() => {
    try { localStorage.setItem(SLICE_VIS_KEY, JSON.stringify(sliceVis)); } catch { /* private mode */ }
  }, [sliceVis]);

  const toggleSlicePlane = useCallback((o) => {
    setSliceVis((v) => ({ ...v, [o]: !v[o] }));
  }, []);

  // Assemble the map's time slice whenever its toggle is on and the time
  // position moves. Bricks are shielded from the slice scrub's
  // cancellation (traverse/amplitude pattern); a volume switch bumps the
  // request counter so a stale assembly can never land.
  useEffect(() => {
    if (!sliceVis.time || !manifest || !geom || !volume) {
      setMapTimeSlice(null);
      return;
    }
    const idx = Math.min(geom.ns - 1, Math.max(0, indices.time));
    const req = ++mapSliceReqRef.current;
    const keys = new Set(bricksForSlice(geom, 'time', idx)
      .map(({ i, j, k }) => brickKey(volume.storage_path, i, j, k)));
    mapSliceBricksRef.current = keys;
    (async () => {
      try {
        const assembled = await assembleSlice(getBrick, geom, 'time', idx);
        if (req !== mapSliceReqRef.current) return;    // superseded
        setMapTimeSlice({
          ...assembled, index: idx, ms: (idx * manifest.geometry.dt_us) / 1000,
        });
      } catch (e) {
        if (e.message !== ABORTED && req === mapSliceReqRef.current) {
          toast({ title: 'Time slice failed', description: e.message, variant: 'destructive' });
        }
      } finally {
        if (mapSliceBricksRef.current === keys) mapSliceBricksRef.current = null;
      }
    })();
  }, [sliceVis.time, manifest, geom, volume, indices.time, getBrick, toast]);

  // ---- per-horizon display settings --------------------------------------

  /** Effective display settings: persisted row params.display overlaid
   *  with this session's (possibly not-yet-persisted) edits. */
  const displayFor = useCallback(
    (h) => ({ ...(h.params?.display || {}), ...(horizonDisplay[h.id] || {}) }),
    [horizonDisplay],
  );

  /** Live settings change: apply to the session immediately, persist to
   *  the row (params.display merge) after an 800 ms debounce. The saved
   *  row replaces the state row so a later pick-save can't clobber the
   *  display with stale params. */
  const changeHorizonDisplay = useCallback((h, partial) => {
    const merged = { ...displayFor(h), ...partial };
    for (const k of Object.keys(merged)) {
      if (merged[k] === undefined) delete merged[k];
    }
    setHorizonDisplay((prev) => ({ ...prev, [h.id]: merged }));
    const timers = settingsTimersRef.current;
    clearTimeout(timers.get(h.id));
    timers.set(h.id, setTimeout(async () => {
      timers.delete(h.id);
      const row = horizonsRef.current.find((x) => x.id === h.id);
      if (!row) return;
      setSettingsSaving(true);
      try {
        const saved = await updateHorizonMeta({ horizon: row, display: merged });
        setHorizons((hs) => hs.map((r) => (r.id === saved.id ? saved : r)));
      } catch (e) {
        toast({ title: 'Settings not saved', description: e.message, variant: 'destructive' });
      } finally {
        setSettingsSaving(false);
      }
    }, 800));
  }, [displayFor, toast]);

  useEffect(() => () => {
    for (const t of settingsTimersRef.current.values()) clearTimeout(t);
  }, []);

  const renameHorizon = useCallback(async (h, name) => {
    try {
      const saved = await updateHorizonMeta({ horizon: h, name });
      setHorizons((hs) => hs.map((r) => (r.id === saved.id ? saved : r)));
      toast({ title: 'Horizon renamed', description: name });
    } catch (e) {
      toast({ title: 'Rename failed', description: e.message, variant: 'destructive' });
    }
  }, [toast]);

  const settingsHorizon = useMemo(
    () => horizons.find((h) => h.id === settingsId) || null,
    [horizons, settingsId],
  );

  const openHorizonSettings = useCallback((h) => setSettingsId(h.id), []);

  // explorer swatches for ALL horizons (visible or not): custom color
  // when set, else the index-keyed house color
  const horizonColorById = useMemo(() => {
    const out = {};
    horizons.forEach((h, idx) => {
      out[h.id] = displayFor(h).color || horizonColor(idx);
    });
    return out;
  }, [horizons, displayFor]);

  const onDeleteHorizon = async (h) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete horizon "${h.name}"? (Undo restores it)`)) return;
    setHorizonBusyId(h.id);
    try {
      // capture the pick grid BEFORE the blob goes away, so undo can
      // re-create the horizon in full (new id, tracked in the box)
      const grid = gridCacheRef.current.get(h.id) || await loadHorizonGrid(h);
      await deleteHorizon(h);
      if (editRef.current?.targetId === h.id) closeSession();
      if (editTarget === h.id) setEditTarget('new');
      gridCacheRef.current.delete(h.id);
      setVisibleIds((s) => { const n = new Set(s); n.delete(h.id); return n; });
      await reloadHorizons(volume);
      const dtUs = manifest.geometry.dt_us;
      const box = { row: h };
      undoStack.push({
        label: `delete horizon "${h.name}"`,
        undo: async () => {
          box.row = await saveHorizon({
            volume, name: h.name, picks: grid, seed: h.seed, params: h.params, dtUs,
          });
          await reloadHorizons(volume);
        },
        redo: async () => {
          await deleteHorizon(box.row);
          gridCacheRef.current.delete(box.row.id);
          setVisibleIds((s) => { const n = new Set(s); n.delete(box.row.id); return n; });
          await reloadHorizons(volume);
        },
      });
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setHorizonBusyId(null);
    }
  };

  // ---- surfaces: first-class converted horizons (geo_surfaces rows
  // with Seismolord provenance for the active volume) -----------------
  const [surfaces, setSurfaces] = useState([]);
  const [surfaceBusyId, setSurfaceBusyId] = useState(null);
  const [surfacesRefresh, setSurfacesRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!volume) { setSurfaces([]); return undefined; }
    listVolumeSurfaces(volume.id)
      .then((rows) => { if (alive) setSurfaces(rows); })
      .catch(() => { if (alive) setSurfaces([]); });
    return () => { alive = false; };
  }, [volume, surfacesRefresh]);

  // ---- culture / GIS layers (shared geo_culture registry, W1.3) ------
  // Volume-independent rows; features download once per eye toggle and
  // convert into the ACTIVE volume's frame for the map (CRS-honest:
  // transformable tags convert, LOCAL vs georeferenced never draws).
  const [culture, setCulture] = useState([]);
  const [cultureBusyId, setCultureBusyId] = useState(null);
  const [cultureRefresh, setCultureRefresh] = useState(0);
  const [visibleCultureIds, setVisibleCultureIds] = useState(new Set());
  const [cultureFeatures, setCultureFeatures] = useState(new Map());

  useEffect(() => {
    let alive = true;
    listCulture()
      .then((rows) => { if (alive) setCulture(rows); })
      .catch(() => { if (alive) setCulture([]); });
    return () => { alive = false; };
  }, [cultureRefresh]);

  const toggleCulture = async (c) => {
    if (visibleCultureIds.has(c.id)) {
      setVisibleCultureIds((set) => { const n = new Set(set); n.delete(c.id); return n; });
      return;
    }
    if (!cultureFeatures.has(c.id)) {
      setCultureBusyId(c.id);
      try {
        const feats = await downloadCultureFeatures(c);
        setCultureFeatures((m) => new Map(m).set(c.id, feats));
      } catch (e) {
        toast({ title: 'Cannot load culture layer', description: e.message, variant: 'destructive' });
        return;
      } finally {
        setCultureBusyId(null);
      }
    }
    setVisibleCultureIds((set) => new Set([...set, c.id]));
  };

  const onShareCulture = async (c) => {
    setCultureBusyId(c.id);
    try {
      await setCultureShared(c, !c.organization_id);
      toast(c.organization_id
        ? { title: 'Culture layer is private again', description: `${c.name} is no longer visible to your organization.` }
        : { title: 'Culture layer shared', description: `${c.name} is now read-only visible to your organization.` });
      setCultureRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Share failed', description: e.message, variant: 'destructive' });
    } finally {
      setCultureBusyId(null);
    }
  };

  const onDeleteCulture = async (c) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete culture layer "${c.name}"? This removes it for every app that uses it.`)) return;
    setCultureBusyId(c.id);
    try {
      await deleteCulture(c);
      setVisibleCultureIds((set) => { const n = new Set(set); n.delete(c.id); return n; });
      setCultureRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setCultureBusyId(null);
    }
  };

  const mapCulture = useMemo(() => {
    if (!visibleCultureIds.size || !volume) return [];
    const volTag = normalizeTag(volume.crs);
    const out = [];
    for (const row of culture) {
      if (!visibleCultureIds.has(row.id)) continue;
      const feats = cultureFeatures.get(row.id);
      if (!feats) continue;
      const rowTag = normalizeTag(row.crs);
      let features = feats;
      if (rowTag !== volTag) {
        if (isTransformableTag(rowTag) && isTransformableTag(volTag)) {
          try {
            features = reprojectFeatures(feats, (x, y) => {
              const p = transformPoint(rowTag, volTag, x, y);
              return [p.x, p.y];
            });
          } catch {
            continue;                    // unresolvable custom def etc.
          }
        } else if (rowTag === LOCAL || volTag === LOCAL) {
          continue;                      // never guess a local grid's placement
        }
        // UNKNOWN on either side draws as-is (legacy frames, badged in the tree)
      }
      out.push({ id: row.id, name: row.name, style: row.style || {}, features });
    }
    return out;
  }, [culture, visibleCultureIds, cultureFeatures, volume]);

  // map display: eye-toggled surfaces, downloaded once and resampled
  // onto the volume lattice (positive-down, surface's own unit)
  const [visibleSurfaceIds, setVisibleSurfaceIds] = useState(new Set());
  const [surfaceLayers, setSurfaceLayers] = useState(new Map()); // id -> {values, unit}
  const sectionGridCacheRef = useRef(new Map()); // id -> {values, conv, grid}

  useEffect(() => {
    setVisibleSurfaceIds(new Set());
    setSurfaceLayers(new Map());
    sectionGridCacheRef.current.clear();
  }, [volume?.id]);

  const toggleSurface = async (s) => {
    if (visibleSurfaceIds.has(s.id)) {
      setVisibleSurfaceIds((set) => {
        const n = new Set(set);
        n.delete(s.id);
        return n;
      });
      return;
    }
    if (!surfaceLayers.has(s.id)) {
      if (!affine || !geom) {
        toast({
          title: 'Cannot map surface',
          description: 'The volume has no usable survey coordinates.',
          variant: 'destructive',
        });
        return;
      }
      setSurfaceBusyId(s.id);
      try {
        const layer = await loadSurfaceMapLayer(s, affine, geom, volume);
        setSurfaceLayers((m) => new Map(m).set(s.id, layer));
      } catch (e) {
        toast({ title: 'Cannot map surface', description: e.message, variant: 'destructive' });
        return;
      } finally {
        setSurfaceBusyId(null);
      }
    }
    setVisibleSurfaceIds((set) => new Set(set).add(s.id));
  };

  // MapView takes the visible, resampled layers; Float32Array refs stay
  // stable across renders so the map's layer cache holds
  const mapSurfaces = useMemo(() => surfaces
    .filter((s) => visibleSurfaceIds.has(s.id) && surfaceLayers.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      values: surfaceLayers.get(s.id).values,
      unit: surfaceLayers.get(s.id).unit,
    })), [surfaces, visibleSurfaceIds, surfaceLayers]);

  // section windows draw the same visible surfaces as dashed sample-index
  // polylines (the horizon overlay contract). Time surfaces convert by the
  // sample rate; depth surfaces invert the volume velocity model
  // (makeTvdssToTwt) and stay map-only without one. Grids are cached per
  // (surface, resample, converter) — the conversion is O(cells) and, for
  // layer cakes, bisects per cell.
  const surfaceTimeConv = useMemo(() => {
    if (!manifest || !geom) return null;
    const dtUs = manifest.geometry.dt_us;
    return makeTvdssToTwt({
      checkshots: null,
      velocity: velocityForDisplay,
      boundaries: velBoundaries,
      dtUs,
      maxTwtMs: ((geom.ns - 1) * dtUs) / 1000,
    });
  }, [manifest, geom, velocityForDisplay, velBoundaries]);

  const sectionSurfaces = useMemo(() => {
    if (!manifest || !geom) return [];
    const dtMs = manifest.geometry.dt_us / 1000;
    const out = [];
    surfaces.forEach((s, idx) => {
      if (!visibleSurfaceIds.has(s.id)) return;
      if (s.z_domain === 'attribute') return; // amplitude maps are map-only
      const layer = surfaceLayers.get(s.id);
      if (!layer) return;
      const conv = s.z_domain === 'time' ? null : surfaceTimeConv;
      if (s.z_domain !== 'time' && !conv) return; // depth surface, no model
      const cached = sectionGridCacheRef.current.get(s.id);
      let grid;
      if (cached && cached.values === layer.values && cached.conv === conv) {
        grid = cached.grid;
      } else {
        grid = surfaceSectionGrid(s, layer, geom, dtMs, conv);
        sectionGridCacheRef.current.set(s.id, { values: layer.values, conv, grid });
      }
      if (grid) {
        out.push({
          id: s.id, name: s.name, grid, color: surfaceColor(idx), lineWidth: 1, dash: true,
        });
      }
    });
    return out;
  }, [surfaces, visibleSurfaceIds, surfaceLayers, surfaceTimeConv, geom, manifest]);

  const onExportSurface = async (s, formatKey) => {
    setSurfaceBusyId(s.id);
    try {
      const { text, fileName } = await exportStoredSurface(s, formatKey);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Surface exported', description: fileName });
    } catch (e) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    } finally {
      setSurfaceBusyId(null);
    }
  };

  const onShareSurface = async (s) => {
    setSurfaceBusyId(s.id);
    try {
      await setSurfaceShared(s, !s.organization_id);
      toast(s.organization_id
        ? { title: 'Surface is private again', description: `${s.name} is no longer visible to your organization.` }
        : { title: 'Surface shared', description: `${s.name} is now read-only visible to your organization (Mapping & Surface Studio included).` });
      setSurfacesRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Share failed', description: e.message, variant: 'destructive' });
    } finally {
      setSurfaceBusyId(null);
    }
  };

  const onDeleteSurface = async (s) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete surface "${s.name}"? This removes it from the shared `
      + 'surface registry (Mapping & Surface Studio included).')) return;
    setSurfaceBusyId(s.id);
    try {
      await deleteRegistrySurface(s);
      setVisibleSurfaceIds((set) => {
        const n = new Set(set);
        n.delete(s.id);
        return n;
      });
      setSurfaceLayers((m) => {
        const n = new Map(m);
        n.delete(s.id);
        return n;
      });
      sectionGridCacheRef.current.delete(s.id);
      setSurfacesRefresh((k) => k + 1);
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setSurfaceBusyId(null);
    }
  };

  useEffect(() => () => {
    if (cacheRef.current) cacheRef.current.clear();
    if (cacheBRef.current) cacheBRef.current.clear();
    if (workerRef.current) workerRef.current.terminate();
  }, []);

  // ---- SliceView inputs --------------------------------------------------
  // Percentile scaling reads the ACTIVE section slice (one deterministic
  // strided sort per slice change — engine amplitudePercentile); the
  // traverse / map / 3D windows share the resulting clip, exactly as
  // they always shared the global-RMS clip.
  const pctClip = useMemo(() => (
    scaleMode === 'pct' && slice
      ? amplitudePercentile(slice.data, clipPct, { cap: 1 << 18 })
      : null
  ), [scaleMode, slice, clipPct]);

  const display = useMemo(() => {
    const rmsClip = Math.max((manifest?.stats?.rms || 1) * clipRms, 1e-12);
    let clip = rmsClip;
    if (scaleMode === 'pct' && pctClip > 0) clip = pctClip;
    else if (scaleMode === 'manual' && manualClip > 0) clip = manualClip;
    const dtMs = manifest ? manifest.geometry.dt_us / 1000 : 4;
    return {
      colormap,
      gain,
      polarity,
      clip,
      traceBalance,
      reverse: reverseCmap,
      wiggle: wiggleMode,
      // window length in ms -> half-window in samples (AGC is display-only)
      agc: agcOn
        ? { halfWindow: Math.max(1, Math.round(agcWindowMs / 2 / dtMs)) }
        : null,
    };
  }, [colormap, gain, polarity, clipRms, traceBalance, manifest, scaleMode,
    pctClip, manualClip, reverseCmap, wiggleMode, agcOn, agcWindowMs]);

  const overlays = useMemo(() => ({
    horizons: resolvedHorizons,
    surfaces: sectionSurfaces,
    faults: faults
      .map((f, idx) => ({ sticks: f.sticks, color: faultColor(idx), id: f.id }))
      .filter((f) => visibleFaultIds.has(f.id)),
    draftSticks,
    seedPick,
    wells: wellSections,
  }), [resolvedHorizons, sectionSurfaces, faults, visibleFaultIds, draftSticks, seedPick,
    wellSections]);

  // ---- W3.4 depth section display ---------------------------------------
  // CPU per-column stretch of the section through the velocity model
  // (engine depthConvert; layer cakes stretch per column). Cached by the
  // memo key: the slice reference and the velocity model/boundaries —
  // exactly "per slice keyed on velocityKey" from the plan. Overlays
  // convert through the SAME converter closure; wells plot native TVD.
  const [sectionDomain, setSectionDomain] = useState('twt');
  const isDepthSection = sectionDomain === 'depth'
    && (orientation === 'inline' || orientation === 'xline');

  const depthSection = useMemo(() => {
    if (!isDepthSection || !slice || !geom || !manifest || !depthConv) return null;
    if (slice.orientation !== orientation) return null;
    const dtMs = manifest.geometry.dt_us / 1000;
    const line = slice.index;
    const cellOf = orientation === 'inline'
      ? (t) => line * geom.nXl + t
      : (t) => t * geom.nXl + line;
    try {
      // axis from a coarse sweep of this section's columns (the axis
      // only needs the deepest bottom; nz = ns keeps vertical detail)
      const cells = [];
      const step = Math.max(1, Math.floor(slice.height / 32));
      for (let t = 0; t < slice.height; t += step) cells.push(cellOf(t));
      const axis = depthAxisFor(depthConv, cells, (geom.ns - 1) * dtMs, geom.ns);
      const stretched = depthStretchSlice(slice, cellOf, depthConv, dtMs, axis);
      return {
        slice: { ...slice, ...stretched },
        axis,
        dtMs,
      };
    } catch {
      return null;                 // no usable depth: stay in time
    }
  }, [isDepthSection, slice, geom, manifest, orientation, depthConv]);

  const depthOverlays = useMemo(() => {
    if (!depthSection || !geom || !manifest) return null;
    const { axis, dtMs } = depthSection;
    const cellAt = (il, xl) => Math.min(geom.nIl - 1, Math.max(0, Math.round(il))) * geom.nXl
      + Math.min(geom.nXl - 1, Math.max(0, Math.round(xl)));
    const cvPoint = (p) => {
      if (p.s == null) return { ...p, s: null };
      // wells carry native tvdss (plan rule); everything else converts
      // through the section's own closure
      const row = Number.isFinite(p.tvdss)
        ? (p.tvdss - axis.z0) / axis.dz
        : depthRowOfSample(depthConv, cellAt(p.il, p.xl), p.s, dtMs, axis);
      return { ...p, s: row == null || row < 0 ? null : row };
    };
    return {
      horizons: overlays.horizons.map((h) => ({
        ...h, grid: depthRowGrid(h.grid, depthConv, dtMs, axis),
      })),
      surfaces: overlays.surfaces.map((s) => ({
        ...s, grid: depthRowGrid(s.grid, depthConv, dtMs, axis),
      })),
      faults: overlays.faults.map((f) => ({
        ...f,
        sticks: f.sticks.map((stick) => ({
          points: (stick.points || stick).map(cvPoint).filter((p) => p.s != null),
        })),
      })),
      draftSticks: [],             // picking is disabled in depth mode v1
      seedPick: null,
      wells: overlays.wells.map((w) => ({
        ...w,
        points: w.points.map(cvPoint),
        tops: (w.tops || []).map(cvPoint).filter((p) => p.s != null),
      })),
    };
  }, [depthSection, overlays, geom, manifest, depthConv]);

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
      const hit = snapPick(trData, sample, { mode: eventSnapMode, window: snapWindow });
      applyOp([cell], [hit ? hit.sample : sample]);
    } else {
      applyOp([cell], [sample]);
    }
  }, [geom, traverse, traverseSlice, pickMode, eraseSize, snapMode, snapWindow, applyOp]);

  /** Map amplitude-attribute extraction along a horizon grid — single
   *  horizon, A-to-B interval (opts.picksB, W2.5) or isofrequency
   *  (opts.freqHz, W2.5). The needed brick keys are registered up front
   *  so a concurrent slice scrub cannot abort the extraction's fetches
   *  (traverse pattern). */
  const extractAmplitude = useCallback(async (grid, opts) => {
    if (!geom || !volume) throw new Error('No volume selected');
    // W3.2 confidence pseudo-attribute: not a brick extraction at all —
    // the horizon's stored companion layer, resolved by grid identity
    if (opts.mode === 'confidence') {
      const h = (horizonsRef.current || [])
        .find((x) => gridCacheRef.current.get(x.id) === grid);
      const conf = h ? await loadHorizonConfidence(h) : null;
      if (!conf || conf.length !== grid.length) {
        throw new Error('This horizon has no tracking-confidence layer (NCC tracking writes one).');
      }
      return conf;
    }
    let preflight;
    let run;
    if (opts.picksB) {
      preflight = bricksForIntervalAttribute(geom, grid, opts.picksB);
      run = () => extractIntervalAttribute(getBrick, geom, grid, opts.picksB, { mode: opts.mode });
    } else if (opts.freqHz) {
      preflight = bricksForHorizonAmplitude(geom, grid, opts.window || 0);
      run = () => extractHorizonIsofrequency(getBrick, geom, grid, {
        freqHz: opts.freqHz, window: opts.window, dtUs: manifest.geometry.dt_us,
      });
    } else {
      preflight = bricksForHorizonAmplitude(geom, grid, opts.window || 0);
      run = () => extractHorizonAmplitude(getBrick, geom, grid, opts);
    }
    const keys = new Set(preflight.map(({ i, j, k }) => brickKey(volume.storage_path, i, j, k)));
    ampBricksRef.current = keys;
    try {
      return await run();
    } finally {
      if (ampBricksRef.current === keys) ampBricksRef.current = null;
    }
  }, [geom, volume, manifest, getBrick]);

  /** Persist the drawn line under a name (seismic_volumes.traverses,
   *  CAS-guarded — the same revision the velocity model saves under). */
  const saveTraverseAs = async () => {
    if (!traverse || !volume || !manifest) return;
    if (volumeReadOnly) {
      toast({ title: 'Read-only volume', description: 'Named traverses are owner-only on a shared volume — draw and view freely, saving is disabled.' });
      return;
    }
    // eslint-disable-next-line no-alert
    const name = window.prompt('Traverse name:', `Traverse ${savedTraverses.length + 1}`);
    if (!name) return;
    setTraverseBusy(true);
    try {
      const entry = { id: crypto.randomUUID(), name, vertices: traverse.vertices };
      const prevList = savedTraverses;
      const nextList = [...savedTraverses, entry];
      const row = await saveVolumeTraverses(volume, nextList, interpRev);
      setInterpRev(row.interp_rev);
      setManifest((m) => applyTraversesToManifest(m, nextList));
      setTraverseSavedId(entry.id);
      const applyList = async (list) => {
        const r = await saveVolumeTraverses(volume, list, interpRevRef.current);
        setInterpRev(r.interp_rev);
        setManifest((m) => applyTraversesToManifest(m, list));
      };
      undoStack.push({
        label: `save traverse "${name}"`,
        undo: async () => {
          await applyList(prevList);
          setTraverseSavedId((cur) => (cur === entry.id ? null : cur));
        },
        redo: () => applyList(nextList),
      });
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
      const prevList = savedTraverses;
      const nextList = savedTraverses.filter((s) => s.id !== entry.id);
      const row = await saveVolumeTraverses(volume, nextList, interpRev);
      setInterpRev(row.interp_rev);
      setManifest((m) => applyTraversesToManifest(m, nextList));
      // the drawn line stays on screen
      setTraverseSavedId((id) => (id === entry.id ? null : id));
      const applyList = async (list) => {
        const r = await saveVolumeTraverses(volume, list, interpRevRef.current);
        setInterpRev(r.interp_rev);
        setManifest((m) => applyTraversesToManifest(m, list));
      };
      undoStack.push({
        label: `delete traverse "${entry.name}"`,
        undo: () => applyList(prevList),
        redo: async () => {
          await applyList(nextList);
          setTraverseSavedId((id) => (id === entry.id ? null : id));
        },
      });
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

  // the active volume's slice-plane children in the explorer, labeled
  // with the CURRENT positions (they follow scrubbing and map clicks)
  const slicePlanes = useMemo(() => {
    if (!manifest) return [];
    const g = manifest.geometry;
    return [
      {
        key: 'inline',
        label: `Inline ${g.il.min + indices.inline * g.il.step}`,
        visible: sliceVis.inline,
      },
      {
        key: 'xline',
        label: `Crossline ${g.xl.min + indices.xline * g.xl.step}`,
        visible: sliceVis.xline,
      },
      {
        key: 'time',
        label: `Time slice ${(indices.time * g.dt_us) / 1000} ms`,
        visible: sliceVis.time,
      },
    ];
  }, [manifest, indices, sliceVis]);

  // ---- workspace tree model + actions (explorer props) -------------------
  const tree = {
    slicePlanes,
    horizonColorById,
    volumes: allVolumes,
    projects,
    activeVolumeId: volume?.id || null,
    volumeBusyId,
    horizons,
    visibleIds,
    horizonBusyId,
    editTargetId: editTarget !== 'new' ? editTarget : null,
    surfaces,
    surfaceBusyId,
    visibleSurfaceIds,
    culture,
    cultureBusyId,
    visibleCultureIds,
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
    shareVolume: onShareVolume,
    createProject: onCreateProject,
    deleteProject: onDeleteProject,
    moveVolumeToProject: onMoveVolumeToProject,
    openImport: () => setOpenDialog('import'),
    openWellImport: () => setOpenDialog('wellImport'),
    openExport: () => setOpenDialog('export'),
    openAttribute: () => setOpenDialog('attribute'),
    refresh: () => {
      setVolumesRefresh((k) => k + 1);
      setSurfacesRefresh((k) => k + 1);
      wellsApi.reload();
    },
    toggleHorizon,
    deleteHorizon: onDeleteHorizon,
    openHorizonSettings,
    exportSurface: onExportSurface,
    deleteSurface: onDeleteSurface,
    shareSurface: onShareSurface,
    toggleSurface,
    openSurfaceImport: () => setOpenDialog('importSurface'),
    toggleCulture,
    shareCulture: onShareCulture,
    deleteCulture: onDeleteCulture,
    openCultureImport: () => setOpenDialog('importCulture'),
    toggleSlicePlane,
    selectPlane,
    setEditTarget: changeEditTarget,
    toggleFault,
    deleteFault: onDeleteFault,
    exportFaultSticks: onExportFaultSticks,
    exportFaultSurface: onExportFaultSurface,
    exportFaultPolygon: onExportFaultPolygon,
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
              sectionDomain={sectionDomain}
              setSectionDomain={setSectionDomain}
              depthReady={Boolean(depthConv)}
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
              scaleMode={scaleMode}
              setScaleMode={setScaleMode}
              clipPct={clipPct}
              setClipPct={setClipPct}
              manualClip={manualClip}
              setManualClip={setManualClip}
              agcOn={agcOn}
              setAgcOn={setAgcOn}
              agcWindowMs={agcWindowMs}
              setAgcWindowMs={setAgcWindowMs}
              wiggleMode={wiggleMode}
              setWiggleMode={setWiggleMode}
              reverseCmap={reverseCmap}
              setReverseCmap={setReverseCmap}
              overlayCandidates={overlayCandidates}
              overlayVolumeId={overlayVolumeId}
              selectOverlayVolume={selectOverlayVolume}
              overlayColormap={overlayColormap}
              setOverlayColormap={setOverlayColormap}
              overlayOpacity={overlayOpacity}
              setOverlayOpacity={setOverlayOpacity}
              overlayBlend={overlayBlend}
              setOverlayBlend={setOverlayBlend}
              onUndo={undoAction}
              onRedo={redoAction}
              canUndo={edit.undo > 0 || undoStack.canUndo}
              canRedo={undoStack.canRedo}
              undoLabel={edit.undo > 0 ? 'horizon edit step' : undoStack.peekUndo()}
              redoLabel={undoStack.peekRedo()}
              onOpenSessions={() => setSessionsOpen(true)}
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
              corrThreshold={corrThreshold}
              setCorrThreshold={setCorrThreshold}
              stopAtFaults={stopAtFaults}
              setStopAtFaults={setStopAtFaults}
              hasFaults={faults.length > 0}
              tracking={tracking}
              trackHorizon={trackHorizon}
              growHorizon={growHorizon}
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
              openAttribute={() => setOpenDialog('attribute')}
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
              openSynthetics={() => setWinFocus((f) => ({ key: 'synthetic', seq: (f?.seq || 0) + 1 }))}
              hasVolume={!!manifest}
            />
          ),
        },
        {
          key: 'export',
          label: 'Export',
          content: (
            <ExportTab
              volume={volume}
              openExport={() => setOpenDialog('export')}
              openSurfaceImport={() => setOpenDialog('importSurface')}
              openPlot={() => setOpenDialog('plot')}
            />
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
          key={`epoch-${sessionEpoch}`}
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
                  slice={depthSection ? depthSection.slice
                    : (manifest && slice && slice.orientation === orientation ? slice : null)}
                  geom={geom}
                  manifest={manifest}
                  orientation={orientation}
                  sliceIndex={manifest && slice && slice.orientation === orientation
                    ? slice.index : sliceIndex}
                  display={display}
                  overlays={depthSection && depthOverlays ? depthOverlays : overlays}
                  overlaySlice={!depthSection && overlaySlice
                    && overlaySlice.orientation === orientation ? overlaySlice : null}
                  overlayDisplay={overlayDisplay}
                  pickMode={depthSection ? null : pickMode}
                  ghost={!depthSection && pickMode === 'manual'
                    ? { mode: eventSnapMode, window: snapWindow } : null}
                  loading={loading}
                  depthConv={depthSection ? null : depthConv}
                  depthAxisInfo={depthSection
                    ? { z0: depthSection.axis.z0, dz: depthSection.axis.dz } : null}
                  onPick={handlePick}
                  onPickEnd={commitStroke}
                  onStepSlice={stepSlice}
                  onCursor={handleCursor}
                  height="fill"
                  vexag={vexag}
                  onVexagChange={setVexag}
                  cameraApi={sectionCameraApi}
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
                    ghost={pickMode === 'manual' ? { mode: eventSnapMode, window: snapWindow } : null}
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
              key: 'synthetic',
              title: 'Synthetics',
              icon: Waves,
              content: (
                <SyntheticsPanel
                  wells={wellsApi.wells}
                  listLogs={listLogs}
                  downloadCurve={downloadCurve}
                  synthesize={synthesize}
                  getTraces={volume ? getSyntheticTraces : null}
                  horizons={horizons}
                  loadGrid={loadGridById}
                  affine={affine}
                  geom={geom}
                  dtUs={manifest ? manifest.geometry.dt_us : null}
                  velocity={velocityForDisplay}
                  boundaries={velBoundaries}
                  onApplyVelocity={applyCalibratedModel}
                  onCommitCheckshots={commitDerivedCheckshots}
                />
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
                  timeSlice={mapTimeSlice}
                  sliceVis={sliceVis}
                  indices={indices}
                  display={display}
                  onHorizonSettings={setSettingsId}
                  onToggleHorizon={(id) => {
                    const h = horizons.find((x) => x.id === id);
                    if (h) toggleHorizon(h);
                  }}
                  surfaces={mapSurfaces}
                  height="fill"
                  cameraApi={mapCameraApi}
                  cultureLayers={mapCulture}
                />
              ),
            },
          ]}
        />
          </div>
        )}
      />

      {/* Heavyweight workflows live in modal dialogs over the workspace. */}
      <CultureImportDialog
        open={openDialog === 'importCulture'}
        onOpenChange={(o) => setOpenDialog(o ? 'importCulture' : null)}
        onImported={() => setCultureRefresh((k) => k + 1)}
      />

      <PlotDialog
        open={openDialog === 'plot'}
        onOpenChange={(o) => setOpenDialog(o ? 'plot' : null)}
        sectionCameraApi={sectionCameraApi}
        mapCameraApi={mapCameraApi}
        volume={volume}
        crsName={volume?.crs ? crsDisplayName(volume.crs) : null}
      />

      <ComputeAttributeDialog
        open={openDialog === 'attribute'}
        onOpenChange={(o) => setOpenDialog(o ? 'attribute' : null)}
        volume={volume}
        manifest={manifest}
        onComputed={() => setVolumesRefresh((k) => k + 1)}
      />

      <SessionsDialog
        open={sessionsOpen}
        onOpenChange={setSessionsOpen}
        captureSession={captureSession}
        restoreSession={restoreSession}
        captureBookmark={captureBookmark}
        restoreBookmark={restoreBookmark}
        hasVolume={Boolean(volume)}
      />

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
        onSurfaceSaved={() => setSurfacesRefresh((k) => k + 1)}
        extractAmplitude={extractAmplitude}
      />

      <ImportSurfaceDialog
        open={openDialog === 'importSurface'}
        onOpenChange={(o) => setOpenDialog(o ? 'importSurface' : null)}
        volume={volume}
        manifest={manifest}
        onSurfaceImported={() => setSurfacesRefresh((k) => k + 1)}
        onHorizonImported={() => reloadHorizons(volume)}
        onFaultsImported={async (saved) => {
          setFaults(await listFaults(volume.id).catch(() => []));
          // imported faults show immediately (the fault-save behavior)
          setVisibleFaultIds((s) => new Set([...s, ...saved.map((f) => f.id)]));
        }}
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
            readOnly={volumeReadOnly}
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

      <HorizonSettingsDialog
        open={Boolean(settingsHorizon)}
        onOpenChange={(o) => { if (!o) setSettingsId(null); }}
        horizon={settingsHorizon}
        display={settingsHorizon ? displayFor(settingsHorizon) : {}}
        onChange={(partial) => settingsHorizon && changeHorizonDisplay(settingsHorizon, partial)}
        onRename={(name) => settingsHorizon && renameHorizon(settingsHorizon, name)}
        saving={settingsSaving}
      />

    </>
  );
}
