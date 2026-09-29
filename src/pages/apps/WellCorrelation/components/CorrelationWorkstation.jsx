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
import { Link, useSearchParams } from 'react-router-dom';
import { GitCompare, Loader2, Save, ImageDown, PanelRight, HelpCircle } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseWellsParam, mapTopHref } from '@/components/wells/appLinks';
import { useWellCurvesCache } from '@/components/wells/useWellCurvesCache';
import { resolveTracks } from '@/components/wells/layout/resolveTracks';
import { buildDefaultLayouts, migrateLayouts, activeTemplate } from '@/components/wells/layout/layoutSchema';
import { depthLabel, fromDisplay } from '@/components/wells/depthModes';
import { makeDepthFrame } from '../../WellDataManager/engine/checkshots';
import SectionExplorer from './SectionExplorer';
import SectionControls from './SectionControls';
import CrossSection from './CrossSection';
import { allTopNames } from '../engine/section';
import { DEPTH_REF_LABEL, depthOfFor } from '../engine/sectionFrame';
import { sectionCaption } from '../services/sectionReport';

// Fixed values for the parameter-bound fills of the Petrophysics
// templates (GR clean/clay lines, porosity and saturation cut-offs): the
// section has no petrophysical pipeline, so the templates read these.
import { useSectionWells, CORR_PARAMS } from '@/components/wells/section/useSectionWells';
export { CORR_PARAMS };

/** @param {string} [p.wellDataManagerPath] route of the Well Data Manager
 *  the explorer's "Edit well data" links open (harness override) */
export default function CorrelationWorkstation({
  backend,
  wellDataManagerPath = '/dashboard/apps/geoscience/well-data-manager',
  mappingPath = '/dashboard/apps/geoscience/mapping-surface-studio',
}) {
  const [searchParams] = useSearchParams();
  const [pickMode, setPickMode] = useState(null);
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);
  const exportRef = useRef(null);
  const {
    wells, order, setOrder, wellData, loading, datum, setDatum, shownTops, setShownTops, zoneMode, setZoneMode, zonePair, setZonePair,
    depthUnit, setDepthUnit, depthRef, setDepthRef, spacing, setSpacing, layouts, setLayouts,
    template, sectionWells, topNames, logSources, ensureWellData, refreshTops, toggleWell, moveWell,
    sectionLoaded, sectionRefused, savedRow,
  } = useSectionWells(backend, { deepLinkWells: parseWellsParam(searchParams.get('wells')), onStatus: setStatus });
  // ST2 ghost curve (shared painter): {sourceWellId, targetWellId, shiftM}
  const [ghost, setGhost] = useState(null);
  // WC-U1-010: field and analyst printed on the exported section
  const [report, setReport] = useState({ field: '', analyst: '' });

  // WC-U1-013: the ghost and the report header ride in track_layout (no
  // migration, the column is jsonb) and come back with the section
  useEffect(() => {
    const tl = savedRow?.track_layout || {};
    if (tl.ghost && tl.ghost.sourceWellId) setGhost(tl.ghost);
    if (tl.report && typeof tl.report === 'object') setReport({ field: tl.report.field || '', analyst: tl.report.analyst || '' });
  }, [savedRow]);

  // WC-U1-013: unsaved changes. The baseline is what was restored (taken once
  // the restored wells have their data, so the default-shown tops settle) or
  // what was last saved; with neither, a section with wells is unsaved.
  const payload = useMemo(() => ({
    well_ids: order,
    datum,
    track_layout: { layouts, depthUnit, depthRef, spacing, zoneMode, shownTops, zonePair, ghost, report },
  }), [order, datum, layouts, depthUnit, depthRef, spacing, zoneMode, shownTops, zonePair, ghost, report]);
  const snapshot = useMemo(() => {
    const all = !shownTops.length || (topNames.length > 0 && topNames.every((n) => shownTops.includes(n)));
    const tl = payload.track_layout;
    return JSON.stringify({ ...payload, track_layout: { ...tl, shownTops: all ? '*' : [...tl.shownTops].sort() } });
  }, [payload, shownTops, topNames]);
  const [baseline, setBaseline] = useState(null);
  const pendingBaseline = useRef(false);
  useEffect(() => { if (savedRow) pendingBaseline.current = true; }, [savedRow]);
  useEffect(() => {
    if (!pendingBaseline.current || !sectionLoaded || loading > 0) return;
    if (!order.every((id) => wellData[id])) return;
    pendingBaseline.current = false;
    setBaseline(snapshot);
  }, [snapshot, sectionLoaded, loading, order, wellData]);
  const unsaved = sectionLoaded && (baseline === null ? order.length > 0 : baseline !== snapshot);

  // WC-U1-008: names that differ only by case or spacing are separate tops
  const nameKey = (n) => String(n ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const topVariants = useMemo(() => {
    const groups = new Map();
    for (const n of topNames) groups.set(nameKey(n), [...(groups.get(nameKey(n)) || []), n]);
    const out = {};
    for (const list of groups.values()) if (list.length > 1) for (const n of list) out[n] = list.filter((x) => x !== n);
    return out;
  }, [topNames]);

  // WC-U1-009: a new flatten datum sits the chosen top where the first well
  // carrying it has it, so the section does not jump
  const datumDefault = useCallback((name) => {
    for (const w of sectionWells) {
      const t = (w.tops || []).find((x) => x.name === name);
      if (!t) continue;
      const d = depthOfFor(w, depthRef)(t.md_m);
      if (Number.isFinite(d)) return Number(d.toFixed(2));
    }
    return undefined;
  }, [sectionWells, depthRef]);

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
    const existing = (wellData[wellId]?.tops || []).find((t) => nameKey(t.name) === nameKey(name));
    if (existing) {
      setStatus(`${wellName(wellId)} already has a top named ${existing.name} at ${depthLabel(existing.md_m, depthUnit)}; drag that one instead.`);
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

  // WC-U1-008: renaming onto a name the section already has merges the two
  // spellings; a well that already carries the new name keeps both tops and
  // is named (the WDM tops sheet rule, planBulkRename)
  const renameTop = async (name, nextRaw) => {
    const next = String(nextRaw ?? '').trim();
    const targets = editableTops(name);
    if (!targets.length) { setStatus(`No editable top named ${name} in the section.`); return; }
    if (!next || next === name) return;
    const clashes = [];
    const moves = [];
    for (const t of targets) {
      const well = sectionWells.find((w) => w.id === t.well_id);
      const clash = (well?.tops || []).some((x) => x.id !== t.id && nameKey(x.name) === nameKey(next));
      if (clash) clashes.push(well?.name || wellName(t.well_id)); else moves.push(t);
    }
    const clashNote = clashes.length ? ` ${clashes.join(', ')} already ${clashes.length === 1 ? 'has' : 'have'} ${next} and kept both tops; rename or delete one there.` : '';
    if (!moves.length) { setStatus(`Nothing renamed.${clashNote}`); return; }
    try {
      for (const t of moves) await backend.updateTop(t.id, { name: next });
      for (const id of new Set(moves.map((t) => t.well_id))) await refreshTops(id);
      const merged = topNames.includes(next);
      setShownTops((s) => {
        const keepOld = clashes.length > 0;
        const out = s.flatMap((n) => (n === name ? (keepOld ? [n, next] : [next]) : [n]));
        return [...new Set(out)];
      });
      if (!clashes.length && datum.mode === 'flatten' && datum.topName === name) setDatum({ ...datum, topName: next });
      setStatus(`Renamed ${name} to ${next} on ${moves.length} well${moves.length === 1 ? '' : 's'}${merged ? ' (merged with the existing spelling)' : ''}${sharedNote(name)}.${clashNote}`);
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

  // WC-U1-001: the depth is parsed as typed (a blank box used to read as
  // MD 0); wells the depth is below TD of, wells that already carry the top
  // and shared wells are named instead of skipped silently
  const propagate = async (nameRaw, depthText) => {
    const name = String(nameRaw ?? '').trim();
    const t = String(depthText ?? '').trim();
    if (!name) { setStatus('Type the name of the top to propagate.'); return; }
    if (!t) { setStatus(`Type the depth (MD, ${depthUnit}) to seed ${name} at.`); return; }
    const v = /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
    if (!Number.isFinite(v) || v < 0) { setStatus(`"${t}" is not a measured depth; type a number of ${depthUnit} at or below the depth reference.`); return; }
    const md = Number(fromDisplay(v, depthUnit).toFixed(4));
    const skipped = [];
    const targets = [];
    for (const w of sectionWells) {
      if (!w.is_own) { skipped.push(`${w.name} (shared, read-only)`); continue; }
      if ((w.tops || []).some((x) => nameKey(x.name) === nameKey(name))) { skipped.push(`${w.name} (already has it)`); continue; }
      let td = Number.isFinite(Number(w.frame?.tdMdM)) && Number(w.frame.tdMdM) > 0 ? Number(w.frame.tdMdM) : null;
      if (td === null && w.depth?.length) { for (let i = w.depth.length - 1; i >= 0; i--) if (Number.isFinite(w.depth[i])) { td = w.depth[i]; break; } }
      if (td !== null && md > td + 1e-6) { skipped.push(`${w.name} (below TD ${depthLabel(td, depthUnit)})`); continue; }
      targets.push({ wellId: w.id, mdM: md });
    }
    const skipNote = skipped.length ? ` Not added: ${skipped.join(', ')}.` : '';
    if (!targets.length) { setStatus(`${name} was not propagated.${skipNote}`); return; }
    try {
      const created = await backend.propagateTop(name, targets);
      for (const w of targets) await refreshTops(w.wellId);
      setShownTops((s) => (s.includes(name) ? s : [...s, name]));
      setStatus(`Propagated ${name} to ${created.length} well${created.length === 1 ? '' : 's'} at ${depthLabel(md, depthUnit)} MD.${skipNote}`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const saveSection = async () => {
    if (sectionRefused) {
      // WC-U1-006: never overwrite a row this build could not open
      setStatus(`Section not saved: the saved section could not be opened by this build, and saving would replace it. ${sectionRefused}`);
      return;
    }
    try {
      await backend.saveSection(payload);
      setBaseline(snapshot);
      setStatus('Section saved.');
    } catch (e) {
      setStatus(e.message);
    }
  };

  const exportPng = async () => {
    try {
      const blob = await exportRef.current.toPng(({ scale, spacing: spacingUsed }) => sectionCaption({
        wells: sectionWells, datum, depthRef, depthUnit, spacing: spacingUsed, templateName: template.name, scale, report,
      }));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'well-correlation-section.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Section exported as PNG with its header (datum, reference, unit, scale, date, build).');
    } catch (e) {
      setStatus(e.message);
    }
  };

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
      <ModuleHomeLink module="geoscience" testId="corr-home" />
      <GitCompare className="w-4 h-4 text-pl-primary-text" />
      <span className="text-sm font-semibold text-pl-text">Well Correlation</span>
      <span className="text-[11px] text-pl-muted">cross-sections on the shared well registry</span>
      <div className="ml-auto flex items-center gap-1">
        <Link to="/dashboard/apps/geoscience/well-correlation/help" data-testid="corr-help" title="Open the Well Correlation help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken">
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
        <button type="button" data-testid="corr-export-png" disabled={!sectionWells.length}
          title="Download the section as a PNG image"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"
          onClick={exportPng}>
          <ImageDown className="w-3.5 h-3.5" /> PNG
        </button>
        <button type="button" data-testid="corr-save"
          title={sectionRefused ? 'The saved section was made by a newer build; reload to get it' : unsaved ? 'Save the well order, datum, view, tops shown, ghost curve and report header' : 'The section is saved'}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${unsaved ? 'border-pl-primary text-pl-primary-text' : 'border-pl-border text-pl-text'} hover:bg-pl-sunken`}
          onClick={saveSection}>
          <Save className="w-3.5 h-3.5" /> Save section
        </button>
        <button type="button" data-testid="corr-toggle-dock" title="Show or hide the controls"
          className={`px-2 py-1 text-xs rounded border ${dockOpen ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}
          onClick={() => setDockOpen((v) => !v)}>
          <PanelRight className="w-3.5 h-3.5" />
        </button>
        <ThemeToggle />
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-pl-surface border-t border-pl-border text-[11px] text-pl-muted">
      <span data-testid="corr-status" className="truncate">{status}</span>
      {loading > 0 && <Loader2 className="w-3 h-3 animate-spin text-pl-muted" />}
      {unsaved && <span className="whitespace-nowrap text-pl-warning-text" data-testid="corr-unsaved">unsaved changes</span>}
      <span className="ml-auto whitespace-nowrap">{order.length} well{order.length === 1 ? '' : 's'} · {topNames.length} tops</span>
      <span className="whitespace-nowrap text-pl-muted" data-testid="corr-depth-status">
        depth {depthUnit} · {DEPTH_REF_LABEL[depthRef]} · {template.name}
      </span>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-pl-muted text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading wells…</div>
  ) : !sectionWells.length ? (
    <div className="h-full flex items-center justify-center text-pl-muted text-sm" data-testid="corr-empty">
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
      ghost={ghost}
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
        <ScrollArea className="h-full min-h-0 bg-pl-surface border-l border-pl-border">
          <SectionControls
            topNames={topNames}
            datum={datum}
            onDatum={setDatum}
            ghost={ghost}
            onGhost={setGhost}
            sectionWells={sectionWells}
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
            mapHrefFor={(name) => mapTopHref(name, order.filter((id) => (wellData[id]?.tops || []).some((t) => t.name === name)), mappingPath)}
            zoneMode={zoneMode}
            onZoneMode={setZoneMode}
            zonePair={zonePair}
            onZonePair={setZonePair}
            onPropagate={propagate}
            canEdit={canEdit}
            onStatus={setStatus}
            datumDefault={datumDefault}
            topVariants={topVariants}
            report={report}
            onReport={setReport}
          />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
