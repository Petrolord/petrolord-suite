// Well Correlation workspace controller (G3.2, rebuilt for the WC series
// 2026-09-03) on the shared WorkspaceShell: section explorer + map
// path-picker on the left, the multi-track cross-section in the center,
// datum / view / tops / zones / track-layout controls in the right dock,
// status bar below. Owns all state; every data touch goes through the
// injected backend so /dev/well-correlation runs the identical app on the
// in-memory backend (no auth/DB).
//
// Every curve of a section well is downloaded once (the Petrophysics
// curves cache) and the active layout template resolves against it, so a
// well shows whatever the template asks for and the well carries: GR,
// resistivity, density-neutron with the standard crossover, any raw
// mnemonic addressed as log:<MNEMONIC>. Tops are the SHARED geo_wells_tops
// rows: pick / drag / rename / delete / propagate writes the registry so
// Petrophysics, Seismolord and Mapping see edits immediately.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitCompare, Loader2, Save, ImageDown, PanelRight } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseWellsParam } from '@/components/wells/appLinks';
import { useWellCurvesCache } from '@/components/wells/useWellCurvesCache';
import { resolveTracks } from '@/components/wells/layout/resolveTracks';
import { buildDefaultLayouts, migrateLayouts, activeTemplate } from '@/components/wells/layout/layoutSchema';
import { depthLabel } from '@/components/wells/depthModes';
import { makeDepthFrame } from '../../WellDataManager/engine/checkshots';
import SectionExplorer from './SectionExplorer';
import SectionControls from './SectionControls';
import CrossSection from './CrossSection';
import { allTopNames } from '../engine/section';
import { DEPTH_REF_LABEL } from '../engine/sectionFrame';

// Fixed values for the parameter-bound fills of the Petrophysics
// templates (GR clean/clay lines, porosity and saturation cut-offs): the
// section has no petrophysical pipeline, so the templates read these.
export const CORR_PARAMS = { grClean: 30, grClay: 120, cutPhi: 0.08, cutVsh: 0.4, cutSw: 0.6 };
const DEFAULT_TEMPLATE = 'quicklook';
const defaultLayouts = () => ({ ...buildDefaultLayouts(), activeTemplateId: DEFAULT_TEMPLATE });

/** @param {string} [p.wellDataManagerPath] route of the Well Data Manager
 *  the explorer's "Edit well data" links open (harness override) */
export default function CorrelationWorkstation({ backend, wellDataManagerPath = '/dashboard/apps/geoscience/well-data-manager' }) {
  // deep link (cross-app navigation, 2026-09-03): ?wells=<id,id> appends
  // those wells to the section once the wells and any saved section loaded
  const [searchParams] = useSearchParams();
  const deepLinkRef = useRef({ wells: parseWellsParam(searchParams.get('wells')), done: false });
  const [sectionLoaded, setSectionLoaded] = useState(false);
  const [wells, setWells] = useState(null);
  const [order, setOrder] = useState([]);              // ordered well ids
  const [wellData, setWellData] = useState({});        // id -> {tops, curves, logs, inventory}
  const [loading, setLoading] = useState(0);           // wells with curves in flight
  const [datum, setDatum] = useState({ mode: 'structural' });
  const [shownTops, setShownTops] = useState([]);
  const [zoneMode, setZoneMode] = useState('consecutive');
  const [zonePair, setZonePair] = useState(null);
  const [depthUnit, setDepthUnit] = useState('m');
  const [depthRef, setDepthRef] = useState('md');
  const [spacing, setSpacing] = useState('equal');
  const [layouts, setLayouts] = useState(defaultLayouts);
  const [pickMode, setPickMode] = useState(null);
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);
  const curvesCache = useWellCurvesCache(backend);
  const exportRef = useRef(null);
  const wellDataRef = useRef({});
  const pendingRef = useRef(new Set());
  useEffect(() => { wellDataRef.current = wellData; }, [wellData]);

  const applySaved = useCallback((section) => {
    setOrder(section.well_ids || []);
    if (section.datum) setDatum(section.datum);
    const tl = section.track_layout || {};
    if (tl.layouts) setLayouts({ ...migrateLayouts(tl.layouts), activeTemplateId: tl.layouts.activeTemplateId || DEFAULT_TEMPLATE });
    if (tl.depthUnit === 'm' || tl.depthUnit === 'ft') setDepthUnit(tl.depthUnit);
    if (['md', 'tvd', 'tvdss'].includes(tl.depthRef)) setDepthRef(tl.depthRef);
    if (tl.spacing === 'equal' || tl.spacing === 'proportional') setSpacing(tl.spacing);
    if (['none', 'consecutive', 'pair'].includes(tl.zoneMode)) setZoneMode(tl.zoneMode);
    if (Array.isArray(tl.shownTops)) setShownTops(tl.shownTops);
    if (Array.isArray(tl.zonePair) && tl.zonePair.length === 2) setZonePair(tl.zonePair);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = await backend.listWells();
        if (!live) return;
        setWells(list);
        const section = await backend.loadSection();
        if (section && live) {
          applySaved(section);
          setStatus('Restored saved section.');
        }
      } catch (e) { if (live) { setStatus(e.message); setWells([]); } }
      if (live) setSectionLoaded(true);
    })();
    return () => { live = false; };
  }, [backend, applySaved]);

  // load tops + every curve for a well the first time it enters the section
  const ensureWellData = useCallback(async (wellId) => {
    if (wellDataRef.current[wellId] || pendingRef.current.has(wellId)) return;
    pendingRef.current.add(wellId);
    setLoading((n) => n + 1);
    try {
      const [tops, cw] = await Promise.all([backend.listTops(wellId), curvesCache.getCurves(wellId)]);
      setWellData((m) => ({ ...m, [wellId]: { tops, curves: cw.curves, logs: cw.logs, inventory: cw.inventory } }));
    } catch (e) {
      setStatus(e.message);
    } finally {
      pendingRef.current.delete(wellId);
      setLoading((n) => n - 1);
    }
  }, [backend, curvesCache]);

  useEffect(() => {
    const dl = deepLinkRef.current;
    if (dl.done || !dl.wells.length || !wells || !sectionLoaded) return;
    dl.done = true;
    const ids = dl.wells.filter((id) => wells.some((w) => w.id === id));
    if (!ids.length) { setStatus('The linked wells are not in your registry.'); return; }
    (async () => {
      for (const id of ids) await ensureWellData(id);
      setOrder((o) => [...o, ...ids.filter((id) => !o.includes(id))]);
      setStatus(`Added ${ids.length} linked well${ids.length === 1 ? '' : 's'} to the section.`);
    })();
  }, [wells, sectionLoaded, ensureWellData]);

  // wells restored from a saved section need their data too
  useEffect(() => { for (const id of order) ensureWellData(id); }, [order, ensureWellData]);

  const refreshTops = useCallback(async (wellId) => {
    const tops = await backend.listTops(wellId);
    setWellData((m) => ({ ...m, [wellId]: { ...(m[wellId] || {}), tops } }));
  }, [backend]);

  const toggleWell = async (wellId) => {
    if (order.includes(wellId)) {
      setOrder((o) => o.filter((x) => x !== wellId));
    } else {
      await ensureWellData(wellId);
      setOrder((o) => (o.includes(wellId) ? o : [...o, wellId]));
    }
  };

  const moveWell = (wellId, dir) => setOrder((o) => {
    const i = o.indexOf(wellId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return o;
    const next = [...o];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  // section wells in order with tops, curves and the template resolved
  // against each well's own inventory (missing curves drop out per well)
  const template = useMemo(() => activeTemplate(layouts), [layouts]);
  const sectionWells = useMemo(() => order
    .map((id) => {
      const w = (wells || []).find((x) => x.id === id);
      const d = wellData[id];
      if (!w || !d) return null;
      let frame = null;
      try {
        frame = makeDepthFrame({ deviation: w.deviation, kbM: w.kb_m, tdMdM: w.td_md_m });
      } catch { frame = null; }
      const tracks = resolveTracks(template, {
        curves: d.curves || {}, logs: d.logs || {}, outputs: {}, faciesData: null, facies: [], params: CORR_PARAMS,
      });
      return {
        id: w.id, name: w.name, uwi: w.uwi, is_own: w.is_own, organization_id: w.organization_id,
        surface_x: w.surface_x, surface_y: w.surface_y, kb_m: w.kb_m,
        tops: d.tops || [], depth: d.curves?.DEPT || null, tracks, frame,
      };
    })
    .filter(Boolean), [order, wells, wellData, template]);

  const topNames = useMemo(() => allTopNames(sectionWells), [sectionWells]);
  // default-show every top the first time the section has any; keep the
  // user's choice afterwards, dropping names that left the section
  useEffect(() => {
    setShownTops((prev) => (prev.length ? prev.filter((n) => topNames.includes(n)) : topNames));
  }, [topNames]);
  const logSources = useMemo(() => {
    const s = new Set();
    for (const id of order) for (const m of Object.keys(wellData[id]?.logs || {})) s.add(m);
    return [...s].sort();
  }, [order, wellData]);

  const wellName = (id) => (wells || []).find((w) => w.id === id)?.name || 'well';
  const canEdit = sectionWells.some((w) => w.is_own);

  // ---- tops: the shared geo_wells_tops rows ------------------------------
  const onTopMove = async (top, mdM) => {
    try {
      await backend.updateTop(top.id, { mdM });
      await refreshTops(top.well_id);
      setStatus(`Moved ${top.name} on ${wellName(top.well_id)} to ${depthLabel(mdM, depthUnit)}.`);
    } catch (e) {
      setStatus(e.message);
      await refreshTops(top.well_id); // revert the optimistic drag
    }
  };

  const createTop = async (wellId, mdM, name) => {
    const existing = (wellData[wellId]?.tops || []).find((t) => t.name === name);
    if (existing) {
      setStatus(`${wellName(wellId)} already has a top named ${name} at ${depthLabel(existing.md_m, depthUnit)}; drag that one instead.`);
      return;
    }
    try {
      await backend.saveTop(wellId, { name, mdM });
      await refreshTops(wellId);
      setShownTops((s) => (s.includes(name) ? s : [...s, name]));
      setStatus(`Added top ${name} on ${wellName(wellId)} at ${depthLabel(mdM, depthUnit)}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  // rename / delete act on every OWN well of the section carrying the name
  // (org-shared wells stay as they are and the status says so)
  const editableTops = (name) => sectionWells.filter((w) => w.is_own).flatMap((w) => w.tops.filter((t) => t.name === name));
  const sharedCount = (name) => sectionWells.filter((w) => !w.is_own && w.tops.some((t) => t.name === name)).length;
  const sharedNote = (name) => (sharedCount(name) ? ` (${sharedCount(name)} shared well${sharedCount(name) === 1 ? '' : 's'} unchanged)` : '');

  const renameTop = async (name, next) => {
    const targets = editableTops(name);
    if (!targets.length) { setStatus(`No editable top named ${name} in the section.`); return; }
    if (topNames.includes(next)) { setStatus(`A top named ${next} already exists; pick another name.`); return; }
    try {
      for (const t of targets) await backend.updateTop(t.id, { name: next });
      for (const id of new Set(targets.map((t) => t.well_id))) await refreshTops(id);
      setShownTops((s) => s.map((n) => (n === name ? next : n)));
      if (datum.mode === 'flatten' && datum.topName === name) setDatum({ ...datum, topName: next });
      setStatus(`Renamed ${name} to ${next} on ${targets.length} well${targets.length === 1 ? '' : 's'}${sharedNote(name)}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const deleteTop = async (name) => {
    const targets = editableTops(name);
    if (!targets.length) { setStatus(`No editable top named ${name} in the section.`); return; }
    try {
      for (const t of targets) await backend.deleteTop(t);
      for (const id of new Set(targets.map((t) => t.well_id))) await refreshTops(id);
      setStatus(`Deleted ${name} from ${targets.length} well${targets.length === 1 ? '' : 's'}${sharedNote(name)}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const reloadTops = async () => {
    try {
      for (const id of order) await refreshTops(id);
      setStatus('Tops reloaded from the registry.');
    } catch (e) {
      setStatus(e.message);
    }
  };

  const propagate = async (name, md) => {
    if (!name || !Number.isFinite(md)) { setStatus('Enter a top name and a depth to propagate.'); return; }
    const targets = sectionWells.filter((w) => w.is_own).map((w) => ({ wellId: w.id, mdM: md }));
    try {
      const created = await backend.propagateTop(name, targets);
      for (const w of targets) await refreshTops(w.wellId);
      setShownTops((s) => (s.includes(name) ? s : [...s, name]));
      setStatus(`Propagated ${name} to ${created.length} well${created.length === 1 ? '' : 's'} at ${depthLabel(md, depthUnit)}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const saveSection = async () => {
    try {
      await backend.saveSection({
        well_ids: order,
        datum,
        track_layout: { layouts, depthUnit, depthRef, spacing, zoneMode, shownTops, zonePair },
      });
      setStatus('Section saved.');
    } catch (e) {
      setStatus(e.message);
    }
  };

  const exportPng = async () => {
    try {
      const blob = await exportRef.current.toPng(`Well Correlation · ${sectionWells.map((w) => w.name).join(' · ')}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'well-correlation-section.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Section exported as PNG.');
    } catch (e) {
      setStatus(e.message);
    }
  };

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <ModuleHomeLink module="geoscience" testId="corr-home" />
      <GitCompare className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Well Correlation</span>
      <span className="text-[11px] text-slate-500">cross-sections on the shared well registry</span>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" data-testid="corr-export-png" disabled={!sectionWells.length}
          title="Download the section as a PNG image"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          onClick={exportPng}>
          <ImageDown className="w-3.5 h-3.5" /> PNG
        </button>
        <button type="button" data-testid="corr-save"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={saveSection}>
          <Save className="w-3.5 h-3.5" /> Save section
        </button>
        <button type="button" data-testid="corr-toggle-dock" title="Show or hide the controls"
          className={`px-2 py-1 text-xs rounded border ${dockOpen ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
          onClick={() => setDockOpen((v) => !v)}>
          <PanelRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="corr-status" className="truncate">{status}</span>
      {loading > 0 && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
      <span className="ml-auto whitespace-nowrap">{order.length} well{order.length === 1 ? '' : 's'} · {topNames.length} tops</span>
      <span className="whitespace-nowrap text-slate-500" data-testid="corr-depth-status">
        depth {depthUnit} · {DEPTH_REF_LABEL[depthRef]} · {template.name}
      </span>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading wells…</div>
  ) : !sectionWells.length ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="corr-empty">
      {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading section…</> : 'Add wells to the section from the map on the left.'}
    </div>
  ) : (
    <CrossSection
      ref={exportRef}
      wells={sectionWells}
      datum={datum}
      depthUnit={depthUnit}
      depthRef={depthRef}
      spacing={spacing}
      zoneMode={zoneMode}
      zonePair={zonePair}
      shownTops={shownTops}
      topNames={topNames}
      pickMode={pickMode}
      onTopMove={canEdit ? onTopMove : undefined}
      onTopCreate={createTop}
      onPickCancel={() => setPickMode(null)}
      onNotice={setStatus}
    />
  );

  return (
    <WorkspaceShell
      autoSaveId="wellcorrelation.workspace.v1"
      minWidth={1000}
      dockDefaultSize={24}
      ribbon={ribbon}
      explorer={(
        <SectionExplorer
          wells={wells || []}
          order={order}
          wellDataManagerPath={wellDataManagerPath}
          onToggle={toggleWell}
          onMove={moveWell}
          onRemove={(id) => setOrder((o) => o.filter((x) => x !== id))}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <SectionControls
            topNames={topNames}
            datum={datum}
            onDatum={setDatum}
            depthUnit={depthUnit}
            onDepthUnit={setDepthUnit}
            depthRef={depthRef}
            onDepthRef={setDepthRef}
            spacing={spacing}
            onSpacing={setSpacing}
            layouts={layouts}
            onLayoutsChange={setLayouts}
            logSources={logSources}
            shownTops={shownTops}
            onToggleTop={(n) => setShownTops((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))}
            onShowAllTops={(on) => setShownTops(on ? topNames : [])}
            pickMode={pickMode}
            onPickMode={setPickMode}
            onReloadTops={reloadTops}
            onRenameTop={renameTop}
            onDeleteTop={deleteTop}
            zoneMode={zoneMode}
            onZoneMode={setZoneMode}
            zonePair={zonePair}
            onZonePair={setZonePair}
            onPropagate={propagate}
            canEdit={canEdit}
            onStatus={setStatus}
          />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
