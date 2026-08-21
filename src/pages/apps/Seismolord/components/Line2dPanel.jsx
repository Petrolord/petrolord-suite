// 2D Line window (W5.3/W5.4): import, display and pick 2D lines, and
// run the mistie workflow. The section renders through SliceView in
// traverse mode — when a 3D volume is open, the line's navigation
// projects into its lattice (lineToLattice), so the ENTIRE 3D overlay
// stack (horizons, surfaces, fault sticks, wells) draws on the line
// exactly as it does on traverses; without a volume the line stands
// alone on pseudo-coordinates. Line picks are per-trace arrays grouped
// across lines by horizon NAME (the mistie join key).

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Upload, Loader2, Play, Crosshair, Save, Ban, Route, Scissors,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import CrsPicker from '@/components/crs/CrsPicker';
import { getProjectCrs, addCustomDef } from '@/lib/crs/settingsService';
import SliceView from './SliceView';
import {
  ingestLine2d, getLineManifest, loadLineNav,
  loadLineSection, listLinePicks, loadLinePicks, saveLinePicks,
  updateLinePicks, setLineBulkShift,
} from '../services/linesService';
import { MAPPING_2D_PRESETS } from '../engine/line2d';
import {
  lineToLattice, lineIntersections, solveMisties,
} from '../engine/line2dIntegration';
import { snapPick, autotrack2D } from '../engine/horizonTrack';
import { NULL_VALUE } from '../engine/manifest';
import { horizonColor } from './workspace/interpretationColors';

const NULL_F32 = Math.fround(NULL_VALUE);
const inputCls = 'rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

/**
 * @param {Object} p
 * @param {Object[]} p.lines seismic_lines rows (ViewerPanel owns the list)
 * @param {() => void} p.refreshLines
 * @param {?Object} p.volumeManifest the OPEN 3D volume's manifest (null ok)
 * @param {?Object} p.affine the open volume's survey affine
 * @param {?Object} p.geom the open volume's lattice geometry
 * @param {Object} p.overlays ViewerPanel's overlay bundle (horizons etc.)
 * @param {{supabaseUrl: string, getToken: Function}} p.storageCfg
 */
export default function Line2dPanel({
  lines, refreshLines, volumeManifest, affine, geom, overlays, storageCfg,
}) {
  const { toast } = useToast();
  const [activeLineId, setActiveLineId] = useState('');
  const [manifest, setManifest] = useState(null);
  const [nav, setNav] = useState(null);
  const [section, setSection] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // picks
  const [pickSets, setPickSets] = useState([]);
  const [pickGrids, setPickGrids] = useState(new Map()); // id -> Float32Array
  const [visiblePickIds, setVisiblePickIds] = useState(new Set());
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(null);              // Float32Array while picking
  const [draftName, setDraftName] = useState('');
  const [snapMode] = useState('peak');

  // import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [presetKey, setPresetKey] = useState(MAPPING_2D_PRESETS[0].key);
  const [crsTag, setCrsTag] = useState(null);
  const [projectCrs, setProjectCrs] = useState(null);

  // stored custom defs resolve display names; refreshed when the dialog
  // opens so defs added elsewhere (3D importer) are listed here too
  useEffect(() => {
    if (!importOpen) return;
    getProjectCrs().then(setProjectCrs).catch(() => {});
  }, [importOpen]);

  // A pasted definition arrives as onChange(null, {customDef}) per the
  // CrsPicker contract: register it in settings and select its CUSTOM
  // tag (the 3D importer's flow). Wiring setCrsTag directly here used
  // to clear the selection and drop the pasted definition.
  const onCrsPick = useCallback(async (tag, meta) => {
    if (meta?.customDef) {
      try {
        const customTag = await addCustomDef(meta.customDef);
        setCrsTag(customTag);
        setProjectCrs(await getProjectCrs());
      } catch (e) {
        toast({ title: 'Custom CRS not saved', description: e.message, variant: 'destructive' });
      }
    } else {
      setCrsTag(tag);
    }
  }, [toast]);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(null);

  // misties
  const [mistieOpen, setMistieOpen] = useState(false);
  const [mistieName, setMistieName] = useState('');
  const [mistieResult, setMistieResult] = useState(null);
  const [mistieBusy, setMistieBusy] = useState(false);

  const line = lines.find((l) => l.id === activeLineId) || null;
  const readyLines = lines.filter((l) => l.status === 'ready');

  // ---- load the active line --------------------------------------------
  useEffect(() => {
    if (!line) {
      setManifest(null); setNav(null); setSection(null);
      setPickSets([]); setPickGrids(new Map()); setVisiblePickIds(new Set());
      setDraft(null); setPicking(false);
      return undefined;
    }
    let stale = false;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const m = await getLineManifest(line);
        const n = await loadLineNav(line);
        const s = await loadLineSection(line, m, storageCfg);
        const ps = await listLinePicks(line.id);
        if (stale) return;
        setManifest(m);
        setNav(n);
        setSection(s);
        setPickSets(ps);
        setPickGrids(new Map());
        setVisiblePickIds(new Set(ps.slice(0, 3).map((p) => p.id)));
        setDraft(null);
        setPicking(false);
      } catch (e) {
        if (!stale) setError(e.message);
      } finally {
        if (!stale) setBusy(false);
      }
    })();
    return () => { stale = true; };
    // bulk_shift_ms is part of the row: a mistie apply refreshes lines,
    // swaps the row reference and reloads the shifted section
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id, line?.bulk_shift_ms]);

  // resolve visible pick sets to grids
  useEffect(() => {
    if (!line) return undefined;
    let stale = false;
    (async () => {
      const next = new Map(pickGrids);
      let changed = false;
      for (const p of pickSets) {
        if (!visiblePickIds.has(p.id) || next.has(p.id)) continue;
        try {
          next.set(p.id, await loadLinePicks(p));
          changed = true;
        } catch { /* unloadable set: skip */ }
      }
      if (!stale && changed) setPickGrids(next);
    })();
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickSets, visiblePickIds, line?.id]);

  // ---- the SliceView package -------------------------------------------
  // 3D overlays draw y = VOLUME sample index — only honest on the line
  // when the sample rates match (recorded limitation; resample later)
  const dtMatches = Boolean(volumeManifest && manifest
    && volumeManifest.geometry.dt_us === manifest.geometry.dt_us);

  /** Lattice projection: real (il, xl) when a volume is open, pseudo
   *  trace coordinates otherwise (readout shows trace numbers). */
  const positions = useMemo(() => {
    if (!nav || !manifest) return null;
    if (affine && geom && dtMatches) {
      const proj = lineToLattice(nav, affine, geom);
      if (proj.inside > 1) return proj.positions;
    }
    return Array.from({ length: manifest.geometry.ntraces }, (_, i) => ({ il: i, xl: 0 }));
  }, [nav, manifest, affine, geom, dtMatches]);

  const sectionSlice = useMemo(() => {
    if (!section || !positions || !manifest) return null;
    const stepM = manifest.geometry.length_m / Math.max(1, manifest.geometry.ntraces - 1);
    return {
      data: section.data,
      width: section.width,
      height: section.height,
      positions,
      stepM,
      orientation: 'traverse',
      index: 0,
    };
  }, [section, positions, manifest]);

  /** A minimal manifest so SliceView's axes/readout work without a 3D
   *  volume (dt from the line; IL/XL read as trace numbers then). */
  const sliceManifest = useMemo(() => {
    if (!manifest) return null;
    if (volumeManifest && affine && geom && dtMatches) return volumeManifest;
    return {
      geometry: {
        dt_us: manifest.geometry.dt_us,
        il: { min: 0, step: 1 }, xl: { min: 0, step: 1 },
      },
    };
  }, [manifest, volumeManifest, affine, geom]);

  const sliceGeom = useMemo(() => {
    if (!manifest) return null;
    if (geom && affine && volumeManifest && dtMatches) return { ...geom, ns: manifest.geometry.ns };
    return { nIl: manifest.geometry.ntraces, nXl: 1, ns: manifest.geometry.ns };
  }, [manifest, geom, affine, volumeManifest]);

  const lineOverlays = useMemo(() => {
    const tracePicks = [];
    if (draft) {
      tracePicks.push({
        name: 'draft', color: '#facc15', picks: draft, markers: true,
      });
    }
    pickSets.forEach((p, idx) => {
      if (!visiblePickIds.has(p.id)) return;
      const grid = pickGrids.get(p.id);
      if (!grid) return;
      tracePicks.push({
        name: p.name, color: horizonColor(idx), picks: grid,
      });
    });
    // the 3D overlay bundle projects through positions ONLY when the
    // lattice is real AND the sample rates match (its y values are
    // volume sample indices); otherwise it stays out
    const base = (affine && geom && volumeManifest && dtMatches) ? overlays : {
      horizons: [], surfaces: [], faults: [], draftSticks: [], seedPick: null, wells: [],
    };
    return { ...base, tracePicks };
  }, [overlays, draft, pickSets, visiblePickIds, pickGrids, affine, geom, volumeManifest, dtMatches]);

  // ---- picking on the line ---------------------------------------------
  const traceAt = useCallback((tr) => {
    if (!section) return null;
    return section.data.subarray(tr * section.width, (tr + 1) * section.width);
  }, [section]);

  const onPick = useCallback((hit) => {
    if (!picking || !section || hit.trace == null) return;
    const tr = Math.max(0, Math.min(section.height - 1, Math.round(hit.trace)));
    const trace = traceAt(tr);
    const s = snapPick(trace, hit.sample, { mode: snapMode, window: 3 });
    setDraft((d) => {
      const next = d ? Float32Array.from(d)
        : new Float32Array(section.height).fill(NULL_F32);
      next[tr] = s ? s.sample : hit.sample;
      return next;
    });
  }, [picking, section, snapMode, traceAt]);

  const trackAlongLine = () => {
    if (!draft || !section) return;
    let seedTr = -1;
    for (let t = 0; t < draft.length; t++) if (draft[t] !== NULL_F32) { seedTr = t; break; }
    if (seedTr < 0) {
      toast({ title: 'Pick a seed first', description: 'Click an event on the line, then track.' });
      return;
    }
    const { picks, tracked } = autotrack2D(
      { data: section.data, width: section.width, height: section.height },
      seedTr, draft[seedTr], { mode: snapMode, window: 3, maxJump: 4 },
    );
    // keep manual picks where the tracker lost the event
    const merged = Float32Array.from(picks);
    for (let t = 0; t < draft.length; t++) {
      if (draft[t] !== NULL_F32 && merged[t] === NULL_F32) merged[t] = draft[t];
    }
    setDraft(merged);
    toast({ title: '2D line autotrack', description: `${tracked} traces tracked along the line.` });
  };

  const saveDraft = async () => {
    if (!draft || !line) return;
    const name = draftName.trim();
    if (!name) {
      toast({ title: 'Name the horizon', description: 'Misties join picks across lines by this name.' });
      return;
    }
    setBusy(true);
    try {
      const existing = pickSets.find((p) => p.name === name && p.is_own !== false);
      if (existing) {
        await updateLinePicks(existing, draft);
      } else {
        await saveLinePicks({ line, name, picks: draft, params: { mode: snapMode } });
      }
      const ps = await listLinePicks(line.id);
      setPickSets(ps);
      setPickGrids(new Map());
      setVisiblePickIds((v) => new Set([...v, ...ps.filter((p) => p.name === name).map((p) => p.id)]));
      setDraft(null);
      setPicking(false);
      toast({ title: 'Line picks saved', description: `${name} on ${line.name}.` });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  // ---- import -----------------------------------------------------------
  const startImport = async () => {
    if (!file) return;
    const preset = MAPPING_2D_PRESETS.find((p) => p.key === presetKey);
    cancelRef.current = { cancelled: false };
    setBusy(true);
    setError(null);
    try {
      const { row } = await ingestLine2d({
        file,
        mapping: preset.mapping,
        nativeCrs: crsTag,
        onProgress: setProgress,
        cancelToken: cancelRef.current,
      });
      toast({ title: '2D line imported', description: `${row.name} is ready.` });
      setImportOpen(false);
      setFile(null);
      setProgress(null);
      refreshLines();
      setActiveLineId(row.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- misties ----------------------------------------------------------
  const pickNames = useMemo(() => {
    const names = new Set();
    for (const p of pickSets) names.add(p.name);
    return [...names];
  }, [pickSets]);

  const runMisties = async () => {
    const name = mistieName.trim();
    if (!name) return;
    setMistieBusy(true);
    setMistieResult(null);
    try {
      // every ready line carrying THIS horizon name joins the solve
      const participants = [];
      for (const l of readyLines) {
        const ps = await listLinePicks(l.id);
        const p = ps.find((q) => q.name === name);
        if (!p) continue;
        const [picks, n] = await Promise.all([loadLinePicks(p), loadLineNav(l)]);
        participants.push({ line: l, picks, nav: n });
      }
      if (participants.length < 2) {
        throw new Error(`"${name}" is picked on ${participants.length} line(s) — misties need at least two.`);
      }
      const crossings = [];
      for (let a = 0; a < participants.length; a++) {
        for (let b = a + 1; b < participants.length; b++) {
          for (const c of lineIntersections(participants[a].nav, participants[b].nav)) {
            crossings.push({ a, b, ia: c.ia, ib: c.ib, x: c.x, y: c.y });
          }
        }
      }
      const dt = (manifest?.geometry.dt_us ?? 4000) / 1000;
      const res = solveMisties(
        participants.map((p) => ({ id: p.line.id, picks: p.picks })),
        crossings, dt,
      );
      setMistieResult({ ...res, participants, horizon: name, crossings: crossings.length });
    } catch (e) {
      toast({ title: 'Mistie analysis failed', description: e.message, variant: 'destructive' });
    } finally {
      setMistieBusy(false);
    }
  };

  const applyShifts = async () => {
    if (!mistieResult) return;
    setMistieBusy(true);
    try {
      for (let i = 0; i < mistieResult.participants.length; i++) {
        const l = mistieResult.participants[i].line;
        await setLineBulkShift(l, (l.bulk_shift_ms || 0) + mistieResult.shiftsMs[i]);
      }
      toast({
        title: 'Mistie shifts applied',
        description: `${mistieResult.participants.length} line statics stored (display-side; stored samples untouched).`,
      });
      setMistieOpen(false);
      setMistieResult(null);
      refreshLines();
    } catch (e) {
      toast({ title: 'Apply failed', description: e.message, variant: 'destructive' });
    } finally {
      setMistieBusy(false);
    }
  };

  // ---- render -----------------------------------------------------------
  return (
    <div className="h-full min-h-0 flex flex-col gap-2 p-1" data-testid="line2d">
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-400 flex items-center gap-1">
          Line
          <select
            className={inputCls}
            value={activeLineId}
            onChange={(e) => setActiveLineId(e.target.value)}
            data-testid="line2d-select"
          >
            <option value="">—</option>
            {readyLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}{l.is_own === false ? ' (teammate)' : ''}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} data-testid="line2d-import">
          <Upload className="w-4 h-4 mr-1" />
          Import 2D line…
        </Button>
        {line && line.is_own !== false && (
          <>
            <Button
              variant="outline" size="sm"
              className={picking ? 'border-yellow-600 text-yellow-400' : ''}
              onClick={() => {
                setPicking((p) => !p);
                if (!draft && section) setDraft(new Float32Array(section.height).fill(NULL_F32));
              }}
              data-testid="line2d-pick"
            >
              <Crosshair className="w-4 h-4 mr-1" />
              {picking ? 'Picking…' : 'Pick horizon'}
            </Button>
            {picking && (
              <>
                <Button variant="outline" size="sm" onClick={trackAlongLine} data-testid="line2d-track">
                  <Route className="w-4 h-4 mr-1" />
                  Track along line
                </Button>
                <input
                  className={`${inputCls} w-32`}
                  placeholder="Horizon name"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  title="Misties and joint mapping join picks across lines by this name"
                  data-testid="line2d-pickname"
                />
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white"
                  onClick={saveDraft} disabled={!draft || busy} data-testid="line2d-save"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save picks
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => { setDraft(null); setPicking(false); }}
                >
                  <Ban className="w-4 h-4 mr-1" />
                  Discard
                </Button>
              </>
            )}
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => setMistieOpen(true)}
          disabled={readyLines.length < 2} data-testid="line2d-misties"
          title={readyLines.length < 2 ? 'Misties need at least two imported lines' : undefined}
        >
          <Scissors className="w-4 h-4 mr-1" />
          Misties…
        </Button>
        {line && (line.bulk_shift_ms || 0) !== 0 && (
          <span className="text-xs text-amber-400" data-testid="line2d-shift">
            {`static ${line.bulk_shift_ms > 0 ? '+' : ''}${line.bulk_shift_ms.toFixed(1)} ms applied`}
          </span>
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>

      {error && <div className="text-xs text-red-400 shrink-0" data-testid="line2d-error">{error}</div>}
      {!line && !error && (
        <p className="text-xs text-slate-500 p-2" data-testid="line2d-empty">
          Import a 2D SEG-Y line or pick one from the list. With a 3D volume open,
          horizons, faults and wells project onto the line automatically.
        </p>
      )}

      {sectionSlice && sliceManifest && sliceGeom && (
        <div className="flex-1 min-h-0">
          <SliceView
            slice={sectionSlice}
            geom={sliceGeom}
            manifest={sliceManifest}
            orientation="traverse"
            sliceIndex={0}
            display={{
              colormap: 'seismic_rwb',
              gain: 1,
              polarity: 1,
              clip: Math.max((manifest?.stats?.rms || 1) * 3, 1e-12),
              traceBalance: false,
              wiggle: 'off',
            }}
            overlays={lineOverlays}
            pickMode={picking ? 'manual' : null}
            onPick={onPick}
            height="fill"
            emptyHint="Loading line…"
          />
        </div>
      )}

      {/* ---- import dialog ---- */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle>Import 2D line (SEG-Y)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <input
              type="file"
              accept=".sgy,.segy"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-xs"
              data-testid="line2d-file"
            />
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Header mapping
              <select className={inputCls} value={presetKey} onChange={(e) => setPresetKey(e.target.value)}>
                {MAPPING_2D_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </label>
            <div>
              <div className="text-xs text-slate-400 mb-1">
                Coordinate reference system of this file (navigation converts
                to the Project CRS; the native declaration is kept)
              </div>
              <CrsPicker value={crsTag} onChange={onCrsPick} customDefs={projectCrs?.customDefs || {}} />
            </div>
            {progress && (
              <div className="text-xs text-slate-400">
                {`${progress.phase}: ${progress.done}${progress.total ? ` / ${progress.total}` : ''}`}
              </div>
            )}
            {error && <div className="text-xs text-red-400">{error}</div>}
            <div className="flex gap-2">
              <Button
                onClick={startImport}
                disabled={!file || busy || !crsTag}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                data-testid="line2d-start"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                Import
              </Button>
              {busy && (
                <Button variant="outline" onClick={() => { if (cancelRef.current) cancelRef.current.cancelled = true; }}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- misties dialog ---- */}
      <Dialog open={mistieOpen} onOpenChange={setMistieOpen}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle>Mistie analysis</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Horizon name</span>
              <input
                className={`${inputCls} w-44`}
                list="line2d-mistie-names"
                value={mistieName}
                onChange={(e) => setMistieName(e.target.value)}
                data-testid="line2d-mistie-name"
              />
              <datalist id="line2d-mistie-names">
                {pickNames.map((n) => <option key={n} value={n} />)}
              </datalist>
              <Button size="sm" onClick={runMisties} disabled={mistieBusy || !mistieName.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="line2d-mistie-run"
              >
                {mistieBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Analyze
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Every imported line carrying this horizon name joins. Shifts are
              least-squares line statics (relative, mean zero) applied
              display-side; stored samples never change.
            </p>
            {mistieResult && (
              <div className="space-y-2" data-testid="line2d-mistie-result">
                <div className="text-xs text-slate-300">
                  {`${mistieResult.tied} tied crossing(s) of ${mistieResult.crossings} · `}
                  {`RMS ${mistieResult.rmsBeforeMs.toFixed(1)} ms -> ${mistieResult.rmsAfterMs.toFixed(1)} ms`}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="pr-2">Line</th>
                      <th className="pr-2">Shift (ms)</th>
                      <th>Already applied (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mistieResult.participants.map((p, i) => (
                      <tr key={p.line.id} className="text-slate-300">
                        <td className="pr-2">{p.line.name}</td>
                        <td className="pr-2 font-mono">{mistieResult.shiftsMs[i].toFixed(1)}</td>
                        <td className="font-mono">{(p.line.bulk_shift_ms || 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button size="sm" onClick={applyShifts} disabled={mistieBusy}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white"
                  data-testid="line2d-mistie-apply"
                >
                  Apply shifts to the lines
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
