import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye, Loader2, XCircle, Crosshair, Route, Ban, Box, ScanLine,
  Pencil, Eraser, Undo2, Save, Spline, Wand2, PaintBucket, Map as MapIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { listVolumes, getManifest } from '../services/volumesService';
import {
  saveHorizon, listHorizons, loadHorizonGrid, deleteHorizon, updateHorizon,
} from '../services/horizonsService';
import { saveFault, listFaults, deleteFault } from '../services/faultsService';
import { BrickCache, storageBrickFetcher, ABORTED } from '../engine/brickCache';
import {
  assembleSlice, assembleTrace, bricksForSlice, geomFromManifest, brickKey,
} from '../engine/sliceAssembly';
import {
  snapPick, autotrack2D, smoothHorizon, fillHorizonHoles,
} from '../engine/horizonTrack';
import { NULL_VALUE } from '../engine/manifest';
import { SEISMIC_COLORMAPS } from '../viewer/SliceRenderer';
import SliceView from './SliceView';
import CubeView from './CubeView';
import MapView from './MapView';
import ViewerWindows from './ViewerWindows';
import HorizonsList, { horizonColor } from './HorizonsList';
import FaultsList, { faultColor } from './FaultsList';

const ORIENTATIONS = [
  { key: 'inline', label: 'Inline' },
  { key: 'xline', label: 'Crossline' },
  { key: 'time', label: 'Time slice' },
];

const NULL_F32 = Math.fround(NULL_VALUE);

/** Event kinds a horizon can snap/track to (engine SNAP_MODES + labels). */
const SNAP_OPTIONS = [
  { key: 'peak', label: 'Peak (+)' },
  { key: 'trough', label: 'Trough (−)' },
  { key: 'zero_pos', label: 'Zero cross − → +' },
  { key: 'zero_neg', label: 'Zero cross + → −' },
];

const DRAFT_COLOR = '#facc15';

/** Section eraser widths (traces): radius r erases 2r+1 traces per pass. */
const BRUSH_OPTIONS = [
  { radius: 0, label: '1' },
  { radius: 1, label: '3' },
  { radius: 2, label: '5' },
  { radius: 5, label: '11' },
  { radius: 10, label: '21' },
];

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

export default function ViewerPanel({ refreshKey, onVolumeChange }) {
  const { toast } = useToast();
  const cacheRef = useRef(null);
  const requestRef = useRef(0);
  const workerRef = useRef(null);
  const jobIdRef = useRef(0);
  const selectSeqRef = useRef(0);               // stale volume-switch guard
  const gridCacheRef = useRef(new Map());       // horizon id -> Float32Array

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
  const [tracking, setTracking] = useState(null);   // {tracked, total}
  const [horizons, setHorizons] = useState([]);
  const [visibleIds, setVisibleIds] = useState(new Set());
  const [horizonBusyId, setHorizonBusyId] = useState(null);
  const [faults, setFaults] = useState([]);
  const [visibleFaultIds, setVisibleFaultIds] = useState(new Set());
  const [faultBusyId, setFaultBusyId] = useState(null);
  // draft fault: array of sticks; each stick = array of {il, xl, s}
  const [draftSticks, setDraftSticks] = useState([]);

  useEffect(() => {
    listVolumes()
      .then((vs) => setVolumes(vs.filter((v) => v.status === 'ready')))
      .catch((e) => setError(e.message));
  }, [refreshKey]);

  const geom = useMemo(() => (manifest ? geomFromManifest(manifest) : null), [manifest]);
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
        gridCacheRef.current.set(h.id, base);
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
    setVolume(v);
    setManifest(null);
    setSlice(null);
    setSeedPick(null);
    setVisibleIds(new Set());
    setVisibleFaultIds(new Set());
    setDraftSticks([]);
    editRef.current = null;
    setEdit({ version: 0, undo: 0, active: false });
    setEditTarget('new');
    setPickMode(null);
    gridCacheRef.current.clear();
    setError(null);
    if (onVolumeChange) onVolumeChange(null, null);
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
      if (onVolumeChange) onVolumeChange(v, m);
    } catch (e) {
      if (seq === selectSeqRef.current) setError(e.message);
    } finally {
      if (seq === selectSeqRef.current) setLoading(false);
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
      // scrub cancellation: keep only the bricks this slice needs
      const needed = new Set(bricksForSlice(geom, orientation, sliceIndex)
        .map(({ i, j, k }) => brickKey(volume.storage_path, i, j, k)));
      cacheRef.current.cancelPendingExcept(needed);

      const t0 = performance.now();
      const assembled = await assembleSlice(getBrick, geom, orientation, sliceIndex);
      if (req !== requestRef.current) return;          // stale scrub
      setSlice({ ...assembled, orientation });         // tag: see SliceView prop
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
            gridCacheRef.current.set(h.id, grid);
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
        gridCacheRef.current.set(row.id, s.grid);
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
        gridCacheRef.current.set(h.id, s.grid);
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
      gridCacheRef.current.set(row.id, picks);
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
  }), [resolvedHorizons, faults, visibleFaultIds, draftSticks, seedPick]);

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

  const lineLabel = useMemo(() => {
    if (!manifest) return '';
    const g = manifest.geometry;
    if (orientation === 'inline') return `IL ${g.il.min + sliceIndex * g.il.step}`;
    if (orientation === 'xline') return `XL ${g.xl.min + sliceIndex * g.xl.step}`;
    return `${(sliceIndex * g.dt_us) / 1000} ms`;
  }, [manifest, orientation, sliceIndex]);

  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Eye className="w-5 h-5 mr-2 text-cyan-400" />
          Section viewer &amp; horizon picking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-slate-300">Volume</Label>
            <select
              className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
              value={volume?.id || ''}
              onChange={(e) => selectVolume(e.target.value)}
            >
              <option value="">Select a volume…</option>
              {volumes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-slate-300">Orientation</Label>
            <select
              className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
              disabled={!manifest}
            >
              {ORIENTATIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-slate-300">Colormap</Label>
            <select
              className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
              value={colormap}
              onChange={(e) => setColormap(e.target.value)}
              disabled={!manifest}
            >
              {SEISMIC_COLORMAPS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-slate-300">Polarity / balance</Label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                className={`px-2 py-1.5 text-xs rounded border ${polarity === 1
                  ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
                onClick={() => setPolarity((p) => -p)}
                disabled={!manifest}
              >
                {polarity === 1 ? 'SEG normal' : 'Reversed'}
              </button>
              <button
                type="button"
                className={`px-2 py-1.5 text-xs rounded border ${traceBalance
                  ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
                onClick={() => setTraceBalance((t) => !t)}
                disabled={!manifest}
              >
                Trace balance
              </button>
            </div>
          </div>
        </div>

        {manifest && (
          <>
            <div className="flex items-center gap-4">
              <Label className="text-slate-300 whitespace-nowrap w-24">{lineLabel}</Label>
              <input
                type="range" min="0" max={maxIndex} value={sliceIndex}
                onChange={(e) => changeIndex(orientation, Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
            <div className="flex items-center gap-4">
              <Label className="text-slate-300 whitespace-nowrap w-24">Gain ×{gain.toFixed(1)}</Label>
              <input
                type="range" min="0.1" max="10" step="0.1" value={gain}
                onChange={(e) => setGain(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <Label className="text-slate-300 whitespace-nowrap">Clip ×{clipRms.toFixed(1)} RMS</Label>
              <input
                type="range" min="0.5" max="10" step="0.5" value={clipRms}
                onChange={(e) => setClipRms(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline" size="sm"
                className={pickMode === 'seed' ? 'border-yellow-500/60 text-yellow-300' : ''}
                onClick={() => setPickMode((p) => (p === 'seed' ? null : 'seed'))}
                disabled={orientation === 'time'}
              >
                <Crosshair className="w-4 h-4 mr-2" />
                {pickMode === 'seed' ? 'Picking: click an event' : 'Pick seed'}
              </Button>
              <Button
                variant="outline" size="sm"
                className={pickMode === 'fault' ? 'border-orange-500/60 text-orange-300' : ''}
                onClick={() => setPickMode((p) => (p === 'fault' ? null : 'fault'))}
                disabled={orientation === 'time'}
              >
                <Crosshair className="w-4 h-4 mr-2" />
                {pickMode === 'fault' ? 'Picking fault points…' : 'Pick fault'}
              </Button>
              {pickMode === 'fault' && (
                <>
                  <Button variant="outline" size="sm" onClick={endStick}>
                    End stick
                  </Button>
                  <Button
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-500 text-white"
                    onClick={saveDraftFault}
                    disabled={!draftSticks.some((s) => s.length >= 2)}
                  >
                    Save fault
                  </Button>
                  <Button variant="outline" size="sm" onClick={discardDraft}
                    disabled={!draftSticks.length}
                  >
                    Discard
                  </Button>
                </>
              )}
              <Button
                size="sm"
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                onClick={trackHorizon}
                disabled={!seedPick || tracking !== null}
              >
                <Route className="w-4 h-4 mr-2" />
                Track 3D
              </Button>
              {tracking && (
                <>
                  <span className="text-sm text-slate-300 flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Tracking… {tracking.tracked.toLocaleString()} / {tracking.total.toLocaleString()}
                  </span>
                  <Button variant="outline" size="sm" onClick={cancelTracking}>
                    <Ban className="w-4 h-4 mr-1" />Cancel
                  </Button>
                </>
              )}
              {seedPick && !tracking && (
                <span className="text-xs text-slate-400">
                  Seed: IL idx {seedPick.ilIdx}, XL idx {seedPick.xlIdx},
                  sample {seedPick.sample.toFixed(2)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-slate-400 text-xs">Snap</Label>
              <select
                className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
                value={snapMode}
                onChange={(e) => setSnapMode(e.target.value)}
                title="Event kind for seed snapping and 2D/3D autotracking"
              >
                {SNAP_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <select
                className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
                value={String(snapWindow)}
                onChange={(e) => setSnapWindow(Number(e.target.value))}
                title="Search half-window (samples) for snapping and tracking — wider follows rougher events but can jump reflectors"
              >
                {[2, 3, 5, 8, 12].map((w) => (
                  <option key={w} value={String(w)}>{`±${w}`}</option>
                ))}
              </select>

              <Label className="text-slate-400 text-xs ml-2">Edit</Label>
              <select
                className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs max-w-[170px]"
                value={editTarget}
                onChange={(e) => changeEditTarget(e.target.value)}
                title="Horizon that manual picking / erasing / 2D tracking edits"
              >
                <option value="new">New horizon…</option>
                {horizons.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>

              <Button
                variant="outline" size="sm"
                className={pickMode === 'manual' ? 'border-yellow-500/60 text-yellow-300' : ''}
                onClick={() => toggleEditTool('manual')}
                disabled={orientation === 'time'}
                title="Click or drag on the section to pick (snaps to the selected event)"
              >
                <Pencil className="w-4 h-4 mr-2" />
                {pickMode === 'manual' ? 'Manual: picking…' : 'Manual pick'}
              </Button>
              <Button
                variant="outline" size="sm"
                className={pickMode === 'erase' ? 'border-red-500/60 text-red-300' : ''}
                onClick={() => toggleEditTool('erase')}
                disabled={orientation === 'time'}
                title="Drag on the section to delete picks (map window has rectangle / polygon erase)"
              >
                <Eraser className="w-4 h-4 mr-2" />
                {pickMode === 'erase' ? 'Erasing…' : 'Erase'}
              </Button>
              <select
                className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
                value={String(eraseSize)}
                onChange={(e) => setEraseSize(Number(e.target.value))}
                title="Eraser width (traces per pass)"
              >
                {BRUSH_OPTIONS.map((b) => (
                  <option key={b.radius} value={String(b.radius)}>{`brush ${b.label}`}</option>
                ))}
              </select>
              <Button
                variant="outline" size="sm"
                onClick={track2D}
                disabled={!seedPick || !slice || orientation === 'time'}
                title="Autotrack the seed along the displayed line only"
              >
                <Spline className="w-4 h-4 mr-2" />
                Track 2D
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={smoothEdits}
                disabled={editBusy}
                title="One null-aware smoothing pass over the edited horizon (undoable; click again for more)"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Smooth
              </Button>
              <select
                className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
                value={smoothMethod}
                onChange={(e) => setSmoothMethod(e.target.value)}
                title="Mean smooths gently; median kills single-pick spikes"
              >
                <option value="mean">mean</option>
                <option value="median">median</option>
              </select>
              <select
                className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
                value={String(smoothRadius)}
                onChange={(e) => setSmoothRadius(Number(e.target.value))}
                title="Smoothing filter size"
              >
                {[1, 2, 4].map((r) => (
                  <option key={r} value={String(r)}>{`${2 * r + 1}×${2 * r + 1}`}</option>
                ))}
              </select>
              <Button
                variant="outline" size="sm"
                onClick={fillHoles}
                disabled={editBusy}
                title="Interpolate across interior holes of the edited horizon (the uninterpreted exterior never grows; undoable)"
              >
                <PaintBucket className="w-4 h-4 mr-2" />
                Fill holes
              </Button>

              {edit.active && (
                <>
                  <Button variant="outline" size="sm" onClick={undoEdit} disabled={!edit.undo}>
                    <Undo2 className="w-4 h-4 mr-1" />
                    Undo{edit.undo ? ` (${edit.undo})` : ''}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    onClick={saveEdits}
                    disabled={!edit.undo || editBusy}
                  >
                    {editBusy
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Save className="w-4 h-4 mr-2" />}
                    {editTarget === 'new' ? 'Save as horizon' : 'Save edits'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={discardEdits} disabled={editBusy}>
                    Discard
                  </Button>
                </>
              )}
            </div>
          </>
        )}

        <ViewerWindows
          defaultOpen={['section']}
          windows={[
            {
              key: 'section',
              title: 'Section',
              icon: ScanLine,
              content: (
                <SliceView
                  // only hand over a slice that matches the current
                  // orientation — an orientation switch must not render the
                  // old slice under the new axes while the new one assembles
                  slice={manifest && slice && slice.orientation === orientation ? slice : null}
                  geom={geom}
                  manifest={manifest}
                  orientation={orientation}
                  sliceIndex={sliceIndex}
                  display={display}
                  overlays={overlays}
                  pickMode={pickMode}
                  ghost={pickMode === 'manual' ? { mode: snapMode, window: snapWindow } : null}
                  loading={loading}
                  onPick={handlePick}
                  onPickEnd={commitStroke}
                  onStepSlice={stepSlice}
                  height={560}
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
                  onSelectPlane={selectPlane}
                  height={560}
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
                  onNavigate={navigateTo}
                  onEraseRegion={eraseRegion}
                  height={560}
                />
              ),
            },
          ]}
        />

        {manifest && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-slate-300 text-sm font-medium mb-2">Horizons</div>
              <HorizonsList
                horizons={horizons}
                visibleIds={visibleIds}
                busyId={horizonBusyId}
                onToggle={toggleHorizon}
                onDelete={onDeleteHorizon}
              />
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-slate-300 text-sm font-medium mb-2">Faults</div>
              <FaultsList
                faults={faults}
                visibleIds={visibleFaultIds}
                busyId={faultBusyId}
                onToggle={toggleFault}
                onDelete={onDeleteFault}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Amplitudes rendered from stored float32 — colormap, gain, polarity and
            balance are shader-only. Time increases downward; nulls (1.0E+30) draw as gray.
          </span>
          {sliceMs != null && <span>slice {sliceMs.toFixed(0)} ms</span>}
        </div>

        {error && (
          <div className="flex items-start text-red-400 text-sm">
            <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
