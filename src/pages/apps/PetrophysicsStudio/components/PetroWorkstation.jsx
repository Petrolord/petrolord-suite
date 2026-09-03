// Petrophysics Studio workspace controller (G2.3) on the shared
// WorkspaceShell: registry wells + curve inventory on the left, the
// multi-track viewer in the center, parameters + zones in the right
// dock, status bar below. Owns all state; every data touch goes
// through the injected backend so /dev/petrophysics-studio runs the
// identical app on makeInMemoryBackend (no auth/DB).
//
// Compute is a pure preview: curves + params -> engine/pipeline.js on
// the main thread (closed-form per-sample math; ~100k samples in low
// ms). Publishing results to the registry is G2.5.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { FlaskConical, Loader2, UploadCloud, Save, Layers, PenLine, FileDown, Database, HelpCircle } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { ScrollArea } from '@/components/ui/scroll-area';
import WellExplorer from './WellExplorer';
import ParameterPanel from './ParameterPanel';
import ZoneManager from './ZoneManager';
import TrackViewer from './TrackViewer';
import CrossplotPanel from './CrossplotPanel';
import BatchRunDialog from './BatchRunDialog';
import DigitizerDialog from './DigitizerDialog';
import ExportDialog from './ExportDialog';
import InterpretationBar from './InterpretationBar';
import LayoutPanel from './LayoutPanel';
import RwToolsDialog from './RwToolsDialog';
import HistogramPanel from './HistogramPanel';
import ConditioningDialog from './ConditioningDialog';
import FieldViewPanel from './FieldViewPanel';
import { useWellCurvesCache } from '../hooks/useWellCurvesCache';
import {
  computeWellZoned, zoneSummary, DEFAULT_PARAMS,
  preparePublishLogs, zonePropertiesSnapshot,
} from '../engine/pipeline';
import { faciesCurve } from '../engine/crossplot';
import { buildDefaultLayouts, migrateLayouts, activeTemplate, getTopStyles, setTopStyle, setShowAllTops } from '../layout/layoutSchema';
import TopsPanel from './TopsPanel';
import { validateZoneWindow } from '../services/zonePlanner';
import { nameKey, digitizedCurveName } from '@/lib/curveNames';
import { resolveTracks } from '../layout/resolveTracks';
import { mapLogs } from '../services/curveMap';
import { makeTvdLookup, depthLabel } from '../viewer/depthModes';

/** @param {string} [p.wellDataManagerPath] route of the Well Data Manager
 *  the explorer's "Edit well data" link opens (the harness points at its
 *  own harness route)
 *  @param {string} [p.wellCorrelationPath] route of Well Correlation for the
 *  explorer's "Open in Well Correlation" link */
export default function PetroWorkstation({
  backend,
  wellDataManagerPath = '/dashboard/apps/geoscience/well-data-manager',
  wellCorrelationPath = '/dashboard/apps/geoscience/well-correlation',
}) {
  // deep link (cross-app navigation, 2026-09-03): ?well=<id> selects the
  // well once the registry list has loaded (Well Data Manager links here)
  const [searchParams] = useSearchParams();
  const deepLinkRef = useRef({ well: searchParams.get('well'), done: false });
  const [wells, setWells] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [wellData, setWellData] = useState(null); // {wellId, curves, inventory, tops}
  const [zones, setZones] = useState([]);
  const [zonesBusy, setZonesBusy] = useState(false);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);
  const [view, setView] = useState('tracks');     // 'tracks' | 'crossplot'
  const [facies, setFacies] = useState([]);       // ND-space polygons for the selected well
  const [faciesByWell, setFaciesByWell] = useState({}); // persisted per-well workspace state
  const [zoneParams, setZoneParams] = useState({});     // zoneId -> override patch (PS3)
  const [projectId, setProjectId] = useState('project-dev');
  const [projectName, setProjectName] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [digitizerOpen, setDigitizerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [noDepthWell, setNoDepthWell] = useState(null); // {inventory} — C2 empty state
  const [layouts, setLayouts] = useState(buildDefaultLayouts); // PS4 templates
  const [pickMode, setPickMode] = useState(null);                // PT3: 'top' | 'zone' | null
  const [topsBusy, setTopsBusy] = useState(false);
  const [layoutFocus, setLayoutFocus] = useState(null);        // {index, nonce}
  const [depthUnit, setDepthUnit] = useState('m');             // display only
  const [rwToolsOpen, setRwToolsOpen] = useState(false);       // PS5 quicklooks
  const curvesCache = useWellCurvesCache(backend);             // PS7 cross-well curves
  const [condOpen, setCondOpen] = useState(false);             // PS8 conditioning
  const [lastNormFit, setLastNormFit] = useState(null);        // PS7 fit -> PS8 apply
  // PS8: explicit input picks — a conditioned curve is never
  // substituted silently; the user selects it per input key
  const curvePicksRef = useRef({ wellId: null, picks: {} });
  const [selection, setSelection] = useState(null);            // PS10 crossplot brush (Set of sample idx)
  const [depthMode, setDepthMode] = useState('md');            // 'md' | 'tvd' labels
  const [crossplotCfg, setCrossplotCfg] = useState(null);      // persisted to petro_projects.crossplots

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = await backend.listWells();
        if (!live) return;
        setWells(list);
        const project = await backend.loadProject();
        if (!live || !project) return;
        setProjectId(project.id || 'project-dev');
        setProjectName(project.name || null);
        if (project.params) setParams((p) => ({ ...p, ...project.params }));
        if (project.facies) setFaciesByWell(project.facies);
        if (project.zone_params) setZoneParams(project.zone_params);
        if (project.crossplots && Object.keys(project.crossplots).length) setCrossplotCfg(project.crossplots);
        setLayouts(migrateLayouts(project.layouts));
        setStatus(`Restored ${project.name || 'saved project'}.`);
      } catch (e) {
        if (live) { setStatus(e.message); setWells((w) => w || []); }
      }
    })();
    return () => { live = false; };
  }, [backend]);

  const selected = (wells || []).find((w) => w.id === selectedId) || null;

  const refreshZones = useCallback(async (wellId) => {
    setZonesBusy(true);
    try {
      setZones(await backend.listZones(wellId));
    } catch (e) {
      setStatus(e.message);
      setZones([]);
    } finally {
      setZonesBusy(false);
    }
  }, [backend]);

  const select = useCallback(async (wellId) => {
    setSelectedId(wellId);
    setPickMode(null);
    setLoadingId(wellId);
    setWellData(null);
    setNoDepthWell(null);
    setSelection(null);
    setZones([]);
    setFacies(faciesByWell[wellId] || []);
    try {
      const [logs, tops] = await Promise.all([backend.listLogs(wellId), backend.listTops(wellId)]);
      if (curvePicksRef.current.wellId !== wellId) curvePicksRef.current = { wellId, picks: {} };
      const mapped = mapLogs(logs);
      for (const [key, logId] of Object.entries(curvePicksRef.current.picks)) {
        const log = logs.find((l) => l.id === logId);
        if (log) mapped[key] = log;
      }
      if (!mapped.DEPT) {
        // C2: a registry well without a depth curve is an empty state,
        // not an exception path — the center panel points at the
        // single import door
        setNoDepthWell({ inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })) });
        setStatus('This well has no depth curve yet.');
        return;
      }
      // every registry curve comes down once, keyed by exact mnemonic;
      // the pipeline inputs are views onto the same arrays, and any
      // other mnemonic can be drawn through a `log:` layout address
      const rawLogs = {};
      for (const log of logs) rawLogs[log.mnemonic] = await backend.downloadCurve(log);
      const curves = {};
      for (const [key, log] of Object.entries(mapped)) {
        if (log) curves[key] = rawLogs[log.mnemonic];
      }
      setWellData({
        wellId,
        curves,
        logs: rawLogs,
        inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })),
        tops,
        allLogs: logs,
      });
      await refreshZones(wellId);
      setStatus(`Loaded ${logs.length} curves (${Object.keys(curves).length} mapped to pipeline inputs).`);
    } catch (e) {
      setStatus(e.message);
      setWellData(null);
    } finally {
      setLoadingId(null);
    }
  }, [backend, refreshZones, faciesByWell]);

  useEffect(() => {
    const dl = deepLinkRef.current;
    if (dl.done || !dl.well || !wells) return;
    dl.done = true;
    if (wells.some((w) => w.id === dl.well)) select(dl.well);
    else setStatus('The linked well is not in your registry.');
  }, [wells, select]);

  // explicit input pick (PS8): remember the choice for this well and
  // reload so every consumer sees the same mapping
  const pickCurve = useCallback(async (key, logId) => {
    curvePicksRef.current = {
      wellId: selectedId,
      picks: { ...curvePicksRef.current.picks, [key]: logId },
    };
    await select(selectedId);
  }, [selectedId, select]);

  // keep the per-well facies map in sync with the live editor
  const setFaciesForWell = useCallback((next) => {
    setFacies(next);
    if (selectedId) setFaciesByWell((m) => ({ ...m, [selectedId]: next }));
  }, [selectedId]);

  // per-zone override patches -> the zoned pipeline's window list;
  // zones sorted by top, first match wins (engine contract)
  const zoneParamList = useMemo(() => zones
    .filter((z) => zoneParams[z.id] && Object.keys(zoneParams[z.id]).length)
    .map((z) => ({ top: z.top_md_m, base: z.base_md_m, params: zoneParams[z.id] }))
    .sort((a, b) => a.top - b.top), [zones, zoneParams]);

  const overlapWarning = useMemo(() => {
    const zs = zones.filter((z) => zoneParams[z.id] && Object.keys(zoneParams[z.id]).length)
      .sort((a, b) => a.top_md_m - b.top_md_m);
    for (let i = 1; i < zs.length; i++) {
      if (zs[i].top_md_m <= zs[i - 1].base_md_m) {
        return `zones ${zs[i - 1].name} and ${zs[i].name} overlap — the shallower zone's overrides win in the overlap`;
      }
    }
    return null;
  }, [zones, zoneParams]);

  const computed = useMemo(() => {
    if (!wellData) return null;
    try {
      return computeWellZoned(wellData.curves, params, zoneParamList);
    } catch (e) {
      setStatus(e.message);
      return null;
    }
  }, [wellData, params, zoneParamList]);

  const summaries = useMemo(() => {
    if (!wellData || !computed) return {};
    const out = {};
    for (const z of zones) {
      const merged = { ...params, ...(zoneParams[z.id] || {}) };
      out[z.id] = zoneSummary(wellData.curves, computed.outputs, merged, z);
    }
    return out;
  }, [wellData, computed, params, zones, zoneParams]);

  const applyZoneParams = useCallback((zoneId, patch) => {
    setZoneParams((m) => {
      const next = { ...m };
      if (Object.keys(patch).length) next[zoneId] = patch;
      else delete next[zoneId];
      return next;
    });
    const zone = zones.find((z) => z.id === zoneId);
    setStatus(Object.keys(patch).length
      ? `Applied ${Object.keys(patch).length} override(s) for ${zone?.name || 'zone'}.`
      : `Cleared overrides for ${zone?.name || 'zone'}.`);
  }, [zones]);

  const faciesData = useMemo(() => (
    wellData?.curves.NPHI && wellData?.curves.RHOB && facies.length
      ? faciesCurve(wellData.curves.NPHI, wellData.curves.RHOB, facies)
      : null
  ), [wellData, facies]);

  // PS4: the track set comes from the active layout template — the
  // PS1 hardcoded set lives on as the std-triple-combo built-in
  const tracks = useMemo(() => {
    if (!wellData || !computed) return [];
    return resolveTracks(activeTemplate(layouts), {
      curves: wellData.curves,
      logs: wellData.logs,
      outputs: computed.outputs,
      faciesData,
      facies,
      params,
    });
  }, [wellData, computed, faciesData, facies, params, layouts]);

  const addZone = async (z) => {
    const zone = await backend.saveZone(wellData.wellId, z);
    setStatus(`Added zone ${zone.name} (${depthLabel(zone.top_md_m ?? z.topMdM, depthUnit)} to ${depthLabel(zone.base_md_m ?? z.baseMdM, depthUnit)}).`);
    await refreshZones(wellData.wellId);
  };
  // PT4: several zones at once (between consecutive tops), sequential saves
  const addZonesMany = async (list) => {
    if (!wellData || !list.length) return;
    setZonesBusy(true);
    let n = 0;
    try {
      for (const z of list) { await backend.saveZone(wellData.wellId, z); n++; }
      setStatus(`Created ${n} zone${n === 1 ? '' : 's'} from tops.`);
    } catch (e) {
      setStatus(`Created ${n} zone${n === 1 ? '' : 's'}, then: ${e.message}`);
    } finally {
      await refreshZones(wellData.wellId);
    }
  };
  // PT4: two-click pick on the track (TrackViewer pickMode 'zone')
  const onZonePick = async (topMdM, baseMdM, name) => {
    const bad = validateZoneWindow(topMdM, baseMdM, depthUnit);
    if (bad) { setStatus(bad); return; }
    try { await addZone({ name, topMdM, baseMdM }); } catch (e) { setStatus(e.message); }
    setPickMode(null);
  };

  const deleteZone = async (zone) => {
    try {
      await backend.deleteZone(zone);
      setStatus(`Deleted zone ${zone.name}.`);
      await refreshZones(zone.well_id);
    } catch (e) {
      setStatus(e.message);
    }
  };

  // publish the current computed curves to the registry (overwrite-own
  // rule enforced in the backend) + refresh the inventory so the new
  // VSH/PHIE/SW/PAY rows show as mapped inputs going forward
  const publish = async () => {
    if (!wellData || !computed) return;
    setPublishing(true);
    try {
      const prepared = preparePublishLogs(wellData, computed.outputs, params, {
        projectId, interpretationName: projectName, zoneParams,
      });
      const saved = await backend.publishCurves(wellData.wellId, prepared, projectId);
      setStatus(`Published ${saved.length} curves to ${selected.name}.`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const publishZone = async (zone) => {
    try {
      const summary = zoneSummary(wellData.curves, computed.outputs, params, zone);
      if (!summary) { setStatus('Compute curves before publishing a zone summary.'); return; }
      const props = zonePropertiesSnapshot(summary, { ...params, ...(zoneParams[zone.id] || {}) }, {
        projectId, interpretationName: projectName, publishedAt: new Date().toISOString(),
      });
      await backend.publishZone(zone, props);
      setStatus(`Published ${zone.name} summary.`);
      await refreshZones(zone.well_id);
    } catch (e) {
      setStatus(e.message);
    }
  };

  // PT7: a digitized curve is ALWAYS a new row named <MNEM>_DIG (:n). The
  // dialog shows the name live; the registry's current mnemonics decide
  // it again here so two dialogs cannot race to one name.
  const saveDigitized = async (log) => {
    const wellId = wellData.wellId;
    const name = selected.name;
    const existing = (wellData.allLogs || []).map((l) => l.mnemonic);
    const finalName = digitizedCurveName(log.mnemonic, existing);
    const saved = await backend.saveDigitizedCurve(wellId, { ...log, mnemonic: finalName });
    await select(wellId); // refresh inventory (resets status), then report
    setStatus(`Digitized ${saved.mnemonic} added to ${name}.`);
    return saved;
  };
  const canReadScan = typeof backend.readScan === 'function';
  const readScan = (req) => backend.readScan(req);

  const workspaceState = () => ({
    params, facies: faciesByWell, zone_params: zoneParams, layouts, crossplots: crossplotCfg || {},
  });

  // PS10: TVD axis labels, gated on a usable deviation survey
  const tvdLookup = useMemo(() => {
    if (depthMode !== 'tvd') return null;
    return makeTvdLookup(selected?.deviation);
  }, [depthMode, selected]);
  const hasDeviation = Array.isArray(selected?.deviation) && selected.deviation.length >= 2;

  // ---- tops (PT3): the same geo_wells_tops rows Well Correlation uses ----
  const topStyles = useMemo(() => getTopStyles(layouts), [layouts]);
  const refreshTops = useCallback(async (wellId) => {
    const tops = await backend.listTops(wellId);
    setWellData((d) => (d && d.wellId === wellId ? { ...d, tops } : d));
    return tops;
  }, [backend]);
  const topNameTaken = (name, exceptId = null) => (wellData?.tops || [])
    .some((t) => t.id !== exceptId && nameKey(t.name).replace(/\s+/g, ' ') === nameKey(name).replace(/\s+/g, ' '));
  const createTop = async (mdM, name) => {
    if (!wellData) return;
    if (topNameTaken(name)) { setStatus(`A top named ${name} already exists on this well.`); return; }
    setTopsBusy(true);
    try {
      await backend.saveTop(wellData.wellId, { name, mdM });
      await refreshTops(wellData.wellId);
      setStatus(`Added top ${name} at ${depthLabel(mdM, depthUnit)}.`);
    } catch (e) { setStatus(e.message); } finally { setTopsBusy(false); }
  };
  const moveTop = async (top, mdM) => {
    setTopsBusy(true);
    try {
      await backend.updateTop(top.id, { mdM });
      await refreshTops(top.well_id || wellData.wellId);
      setStatus(`Moved ${top.name} to ${depthLabel(mdM, depthUnit)}.`);
    } catch (e) { setStatus(e.message); await refreshTops(wellData.wellId); } finally { setTopsBusy(false); }
  };
  const renameTop = async (top, name) => {
    if (topNameTaken(name, top.id)) { setStatus(`A top named ${name} already exists on this well.`); return; }
    setTopsBusy(true);
    try {
      await backend.updateTop(top.id, { name });
      await refreshTops(top.well_id || wellData.wellId);
      setStatus(`Renamed ${top.name} to ${name}.`);
    } catch (e) { setStatus(e.message); } finally { setTopsBusy(false); }
  };
  const removeTop = async (top) => {
    if (!window.confirm(`Delete top ${top.name} from this well?`)) return;
    setTopsBusy(true);
    try {
      await backend.deleteTop(top);
      await refreshTops(top.well_id || wellData.wellId);
      setStatus(`Deleted top ${top.name}.`);
    } catch (e) { setStatus(e.message); } finally { setTopsBusy(false); }
  };
  const setPick = (mode) => {
    setPickMode(mode);
    if (mode === 'top') setStatus('Pick top: click in the log area, Esc to finish.');
    else if (mode === 'zone') setStatus('Pick zone: click the top, then the base. Esc to finish.');
  };

  const commitZoneEdge = async (zone, edge, newMd) => {
    const top = edge === 'top' ? newMd : zone.top_md_m;
    const base = edge === 'base' ? newMd : zone.base_md_m;
    if (!(base > top)) { setStatus('Zone base must stay below its top.'); return; }
    try {
      await backend.updateZone(zone.id, edge === 'top' ? { top_md_m: newMd } : { base_md_m: newMd });
      await refreshZones(zone.well_id);
      setStatus(`Moved ${zone.name} ${edge} to ${depthLabel(newMd, depthUnit)}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const saveProject = async () => {
    try {
      const realId = projectId && projectId !== 'project-dev' ? projectId : null;
      const project = await backend.saveProject(workspaceState(), realId);
      if (project?.id) setProjectId(project.id);
      if (project?.name) setProjectName(project.name);
      setStatus(`Saved ${project?.name || 'project'}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const applyProjectRow = (project) => {
    setProjectId(project.id);
    setProjectName(project.name || null);
    setParams({ ...DEFAULT_PARAMS, ...(project.params || {}) });
    setFaciesByWell(project.facies || {});
    setZoneParams(project.zone_params || {});
    if (project.crossplots && Object.keys(project.crossplots).length) setCrossplotCfg(project.crossplots);
    setLayouts(migrateLayouts(project.layouts));
    if (selectedId) setFacies((project.facies || {})[selectedId] || []);
  };

  const openInterpretation = async (id) => {
    try {
      const project = await backend.openProject(id);
      applyProjectRow(project);
      setStatus(`Opened ${project.name}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const saveInterpretationAs = async (name) => {
    try {
      const project = await backend.saveProjectAs(name, workspaceState());
      setProjectId(project.id);
      setProjectName(project.name);
      setStatus(`Saved as ${project.name}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const onInterpretationDeleted = async () => {
    try {
      const latest = await backend.loadProject();
      if (latest) applyProjectRow(latest);
      else {
        setProjectId('project-dev');
        setProjectName(null);
        setParams(DEFAULT_PARAMS);
        setZoneParams({});
        setFaciesByWell({});
        setFacies([]);
      }
    } catch (e) {
      setStatus(e.message);
    }
  };

  // one well's full recipe->publish, used by the batch dialog; loads
  // its own curves so it never disturbs the on-screen selection
  const runBatchWell = async (well) => {
    const logs = await backend.listLogs(well.id);
    const mapped = mapLogs(logs);
    if (!mapped.DEPT) throw new Error('no depth curve');
    const curves = {};
    const inventory = [];
    for (const [key, log] of Object.entries(mapped)) {
      if (log) curves[key] = await backend.downloadCurve(log);
      inventory.push({ key, log });
    }
    // each well's OWN zones drive the overrides (patches are keyed by
    // zone id, so any well's zones the user has overridden apply here)
    const wellZones = await backend.listZones(well.id);
    const wellZoneList = wellZones
      .filter((z) => zoneParams[z.id] && Object.keys(zoneParams[z.id]).length)
      .map((z) => ({ top: z.top_md_m, base: z.base_md_m, params: zoneParams[z.id] }))
      .sort((a, b) => a.top - b.top);
    const { outputs } = computeWellZoned(curves, params, wellZoneList);
    const prepared = preparePublishLogs({ curves, inventory }, outputs, params, {
      projectId, interpretationName: projectName, zoneParams,
    });
    if (!prepared.length) throw new Error('nothing to publish (missing inputs)');
    const saved = await backend.publishCurves(well.id, prepared, projectId);
    if (well.id === selectedId) await select(well.id);
    return saved.length;
  };

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <ModuleHomeLink module="geoscience" testId="petro-home" />
      <FlaskConical className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Petrophysics Studio</span>
      <span className="text-[11px] text-slate-500">log analysis on the shared well registry</span>
      <div className="ml-4 flex items-center gap-1">
        <button
          type="button"
          data-testid="petro-view-tracks"
          className={`px-2 py-1 text-xs rounded border
            ${view === 'tracks' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          onClick={() => setView('tracks')}
        >
          Tracks
        </button>
        <button
          type="button"
          data-testid="petro-view-crossplot"
          disabled={!wellData}
          className={`px-2 py-1 text-xs rounded border disabled:opacity-40
            ${view === 'crossplot' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          onClick={() => setView('crossplot')}
        >
          Crossplots
        </button>
        <button
          type="button"
          data-testid="petro-view-histogram"
          disabled={!wellData}
          className={`px-2 py-1 text-xs rounded border disabled:opacity-40
            ${view === 'histogram' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          onClick={() => setView('histogram')}
        >
          Histograms
        </button>
        <button
          type="button"
          data-testid="petro-view-split"
          disabled={!wellData}
          title="Tracks and crossplot side by side with linked selection"
          className={`px-2 py-1 text-xs rounded border disabled:opacity-40
            ${view === 'split' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          onClick={() => setView('split')}
        >
          Split
        </button>
        <button
          type="button"
          data-testid="petro-view-field"
          className={`px-2 py-1 text-xs rounded border
            ${view === 'field' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          onClick={() => setView('field')}
        >
          Field
        </button>
      </div>
      <div className="ml-4 flex items-center gap-1">
        <InterpretationBar
          backend={backend}
          projectId={projectId !== 'project-dev' ? projectId : null}
          projectName={projectName}
          onOpen={openInterpretation}
          onSaveAs={saveInterpretationAs}
          onRenamed={(p) => setProjectName(p.name)}
          onDeleted={onInterpretationDeleted}
          onStatus={setStatus}
        />
        <button
          type="button"
          data-testid="petro-publish"
          disabled={!wellData || !selected?.is_own || publishing}
          title={selected && !selected.is_own ? 'Org-shared wells are read-only' : 'Publish computed curves to the registry'}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
          onClick={publish}
        >
          {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
          Publish
        </button>
        <button
          type="button"
          data-testid="petro-digitize"
          disabled={!wellData || !selected?.is_own}
          title={selected && !selected.is_own ? 'Org-shared wells are read-only' : 'Digitize a curve from a scanned log image'}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          onClick={() => setDigitizerOpen(true)}
        >
          <PenLine className="w-3.5 h-3.5" /> Digitize…
        </button>
        <button
          type="button"
          data-testid="petro-condition"
          disabled={!wellData || !selected?.is_own}
          title={selected && !selected.is_own ? 'Org-shared wells are read-only' : 'Despike, smooth, depth-shift, bad-hole repair, normalization'}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          onClick={() => setCondOpen(true)}
        >
          Condition…
        </button>
        <button
          type="button"
          data-testid="petro-rwtools"
          title="Rw quicklooks: SP and Arps temperature conversion"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={() => setRwToolsOpen(true)}
        >
          Rw tools…
        </button>
        <button
          type="button"
          data-testid="petro-export"
          disabled={!wellData || !computed}
          title="Export CSV, LAS or a PDF summary report"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          onClick={() => setExportOpen(true)}
        >
          <FileDown className="w-3.5 h-3.5" /> Export…
        </button>
        <button
          type="button"
          data-testid="petro-batch"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={() => setBatchOpen(true)}
        >
          <Layers className="w-3.5 h-3.5" /> Batch…
        </button>
        <button
          type="button"
          data-testid="petro-save-project"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={saveProject}
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>
      <Link
        to="/dashboard/apps/geoscience/petrophysics-studio/help"
        data-testid="petro-help"
        title="Open the Petrophysics Studio help guide"
        className="ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded border
          border-slate-700 text-cyan-300 hover:bg-slate-800"
      >
        <HelpCircle className="w-3.5 h-3.5" /> Help
      </Link>
      <button
        type="button"
        data-testid="petro-toggle-dock"
        className={`px-2 py-1 text-xs rounded border
          ${dockOpen ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
        onClick={() => setDockOpen((v) => !v)}
      >
        Parameters & zones
      </button>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="petro-status" className="truncate">{status}</span>
      {computed?.missing.length ? (
        <span className="text-amber-400/90" data-testid="petro-missing">
          missing: {computed.missing.join(', ')}
        </span>
      ) : null}
      {overlapWarning ? (
        <span className="text-amber-400/90" data-testid="petro-overlap">
          {overlapWarning}
        </span>
      ) : null}
      <span className="ml-auto whitespace-nowrap">
        {selected ? `${selected.name} · ${wellData?.curves.DEPT?.length ?? '…'} samples` : `${wells?.length ?? '…'} wells`}
      </span>
      {hasDeviation && (
        <button
          type="button"
          data-testid="petro-depth-mode"
          title="Axis labels only: TVD values shown at MD spacing (the axis says so)"
          className="whitespace-nowrap rounded border border-slate-800 px-1.5 text-slate-400 hover:text-slate-200"
          onClick={() => setDepthMode((m) => (m === 'md' ? 'tvd' : 'md'))}
        >
          axis: {depthMode === 'tvd' ? 'TVD' : 'MD'}
        </button>
      )}
      <button
        type="button"
        data-testid="petro-depth-unit"
        title="Display unit for the depth axis. Internal storage stays SI metres."
        className="whitespace-nowrap rounded border border-slate-800 px-1.5 text-slate-400 hover:text-slate-200"
        onClick={() => setDepthUnit((u) => (u === 'm' ? 'ft' : 'm'))}
      >
        depth: {depthUnit} · SI internal
      </button>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry wells…
    </div>
  ) : view === 'field' ? (
    <FieldViewPanel
      depthUnit={depthUnit}
      topStyles={topStyles}
      onShowAllTops={(v) => setLayouts((l) => setShowAllTops(l, v))}
      wells={wells}
      params={params}
      zoneParams={zoneParams}
      layouts={layouts}
      backend={backend}
      curvesCache={curvesCache}
      onStatus={setStatus}
    />
  ) : !selected ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="petro-empty">
      Select a well to start interpreting.
    </div>
  ) : noDepthWell ? (
    <div className="h-full flex items-center justify-center" data-testid="petro-no-depth">
      <div className="max-w-md text-center space-y-2 px-6">
        <Database className="w-8 h-8 mx-auto text-slate-600" />
        <p className="text-sm text-slate-300">{selected.name} has no depth curve yet.</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Log curves enter the registry through Well Data Manager, the Suite&apos;s single
          import door. Import an LAS file with a DEPT, DEPTH or MD curve there and this
          well opens here ready to interpret.
        </p>
      </div>
    </div>
  ) : !wellData ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading curves…
    </div>
  ) : view === 'histogram' ? (
    <HistogramPanel
      curves={wellData.curves}
      outputs={computed?.outputs}
      params={params}
      zones={zones}
      onApplyParams={(patch) => setParams((p) => ({ ...p, ...patch }))}
      onStatus={setStatus}
      wells={wells || []}
      currentWellId={wellData.wellId}
      curvesCache={curvesCache}
      onFitResult={setLastNormFit}
    />
  ) : (() => {
    const crossplotEl = (
      <CrossplotPanel
        curves={wellData.curves}
        outputs={computed?.outputs}
        params={params}
        facies={facies}
        onFaciesChange={setFaciesForWell}
        onApplyParams={(patch) => setParams((p) => ({ ...p, ...patch }))}
        onStatus={setStatus}
        selection={selection}
        onSelectionChange={setSelection}
        initialConfig={crossplotCfg}
        onConfigChange={setCrossplotCfg}
      />
    );
    const tracksEl = (
      <TrackViewer
        depth={wellData.curves.DEPT}
        tracks={tracks}
        zones={zones}
        tops={wellData.tops}
        topStyles={topStyles}
        topNames={Array.from(new Set((wellData.tops || []).map((t) => t.name)))}
        pickMode={pickMode}
        onTopCreate={createTop}
        onTopMove={moveTop}
        onZonePick={onZonePick}
        onPickCancel={() => { setPickMode(null); setStatus('Pick finished.'); }}
        depthUnit={depthUnit}
        selection={selection}
        tvdLookup={tvdLookup}
        isOwn={!!selected?.is_own}
        onZoneEdge={commitZoneEdge}
        onTrackHeaderClick={(index) => {
          setDockOpen(true);
          setLayoutFocus({ index, nonce: Date.now() });
        }}
      />
    );
    if (view === 'crossplot') return crossplotEl;
    if (view === 'split') {
      return (
        <div className="h-full min-h-0 flex" data-testid="petro-split">
          <div className="flex-[3] min-w-0 border-r border-slate-800/60">{tracksEl}</div>
          <div className="flex-[2] min-w-0">{crossplotEl}</div>
        </div>
      );
    }
    return tracksEl;
  })();

  return (
    <>
    <WorkspaceShell
      autoSaveId="petrophysicsstudio.workspace.v1"
      minWidth={1000}
      dockDefaultSize={24}
      ribbon={ribbon}
      explorer={(
        <WellExplorer
          wells={wells || []}
          selectedId={selectedId}
          loadingId={loadingId}
          wellDataManagerPath={wellDataManagerPath}
          wellCorrelationPath={wellCorrelationPath}
          curveInventory={wellData?.inventory || noDepthWell?.inventory}
          allLogs={wellData?.allLogs}
          onPickCurve={selected?.is_own ? pickCurve : undefined}
          onSelect={select}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <ParameterPanel
            params={params}
            onApply={(p) => { setParams(p); setStatus('Parameters applied.'); }}
            zones={zones}
            zoneParams={zoneParams}
            onApplyZone={applyZoneParams}
          />
          <LayoutPanel
            logSources={(wellData?.allLogs || []).map((l) => l.mnemonic)}
            layouts={layouts}
            onLayoutsChange={setLayouts}
            focusTrack={layoutFocus}
            onStatus={setStatus}
          />
          {wellData && (
            <TopsPanel
              tops={wellData.tops}
              topStyles={topStyles}
              onShowAll={(v) => setLayouts((l) => setShowAllTops(l, v))}
              onStyle={(name, patch) => setLayouts((l) => setTopStyle(l, name, patch))}
              isOwn={!!selected?.is_own}
              busy={topsBusy}
              pickMode={pickMode}
              onPick={setPick}
              onRename={renameTop}
              onDelete={removeTop}
              depthUnit={depthUnit}
            />
          )}
          {wellData && (
            <ZoneManager
              depthUnit={depthUnit}
              zones={zones}
              zoneParams={zoneParams}
              summaries={summaries}
              isOwn={!!selected?.is_own}
              busy={zonesBusy}
              onAdd={addZone}
              onAddMany={addZonesMany}
              onStartPick={() => setPick(pickMode === 'zone' ? null : 'zone')}
              pickActive={pickMode === 'zone'}
              tops={wellData.tops}
              tdM={selected?.td_md_m ?? null}
              onDelete={deleteZone}
              onPublish={publishZone}
            />
          )}
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
    <BatchRunDialog
      open={batchOpen}
      onOpenChange={setBatchOpen}
      wells={wells || []}
      runBatch={runBatchWell}
    />
    <DigitizerDialog
      open={digitizerOpen && !!wellData}
      onOpenChange={setDigitizerOpen}
      wellName={selected?.name}
      onSave={saveDigitized}
      existingMnemonics={(wellData?.allLogs || []).map((l) => l.mnemonic)}
      depthUnit={depthUnit}
      canReadScan={canReadScan}
      onReadScan={readScan}
    />
    {wellData && (
      <ConditioningDialog
        open={condOpen}
        onOpenChange={setCondOpen}
        wellData={wellData}
        projectId={projectId}
        backend={backend}
        onSaved={() => select(wellData.wellId)}
        onStatus={setStatus}
        lastNormFit={lastNormFit}
      />
    )}
    <RwToolsDialog
      open={rwToolsOpen}
      onOpenChange={setRwToolsOpen}
      onApplyParams={(patch) => setParams((p) => ({ ...p, ...patch }))}
      onStatus={setStatus}
    />
    {wellData && computed && (
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        wellName={selected?.name}
        well={selected}
        depthUnit={depthUnit}
        wellData={wellData}
        outputs={computed.outputs}
        params={params}
        zones={zones}
        summaries={summaries}
        projectId={projectId}
        projectName={projectName}
        onStatus={setStatus}
      />
    )}
    </>
  );
}
