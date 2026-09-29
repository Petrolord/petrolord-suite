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
import { GitCompare, Loader2, Save, ImageDown, PanelRight, HelpCircle, Undo2, FileDown } from 'lucide-react';
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
import SectionPicker from './SectionPicker';
import { copyName, freeName, DEFAULT_SECTION_NAME } from '@/components/wells/section/sectionNames';
import CrossSection, { AXIS_W, PLOT_TOP, sectionHeightFor } from './CrossSection';
import { columnLayout } from '@/components/wells/section/sectionFrame';
import { topColor } from '@/components/wells/topColors';
import { printPlan, buildSectionPdf, PDF_SCALES_M, PDF_SCALES_FT } from '../services/sectionPdf';
import { allTopNames } from '../engine/section';
import { DEPTH_REF_LABEL, depthOfFor } from '../engine/sectionFrame';
import { sectionCaption } from '../services/sectionReport';
import { undoEntry, applyUndo, remapStack, UNDO_LIMIT } from '../services/topsUndo';
import { topsCsv } from '../services/topsFile';
import { sheetRows } from '../../WellDataManager/engine/topsSheet';
import { horizonCandidates, horizonAtWell, horizonLabel } from '@/components/wells/section/horizons';

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
    depthUnit, setDepthUnit, depthRef, setDepthRef, spacing, setSpacing, columnWidth, setColumnWidth, layouts, setLayouts,
    template, sectionWells, topNames, logSources, ensureWellData, refreshTops, toggleWell, moveWell,
    sectionLoaded, sectionRefused, savedRow,
    sectionId, setSectionId, sectionName, setSectionName, openSection, startSection,
  } = useSectionWells(backend, { deepLinkWells: parseWellsParam(searchParams.get('wells')), onStatus: setStatus });
  // ST2 ghost curve (shared painter): {sourceWellId, targetWellId, shiftM}
  const [ghost, setGhost] = useState(null);
  // WC-U1-010: field and analyst printed on the exported section
  const [report, setReport] = useState({ field: '', analyst: '' });
  // U2-006: the print render (offscreen CrossSection at the scale's size)
  const [printJob, setPrintJob] = useState(null);
  const printDone = useRef(null);

  // ---- U2-003 seismic horizons from the surface registry (read only) ------
  const [hzRows, setHzRows] = useState([]);   // geo_surfaces rows
  const [hzGrids, setHzGrids] = useState({}); // id -> grid
  const [hzOn, setHzOn] = useState([]);       // ids drawn
  const canHorizons = typeof backend.listSurfaces === 'function';
  useEffect(() => {
    if (!canHorizons) return undefined;
    let live = true;
    backend.listSurfaces().then((rows) => { if (live) setHzRows(rows || []); }).catch((e) => { if (live) setStatus(`Horizons could not be listed: ${e.message}`); });
    return () => { live = false; };
  }, [backend, canHorizons]);
  const hzList = useMemo(() => horizonCandidates(hzRows), [hzRows]);
  const loadGrid = useCallback(async (id) => {
    const row = hzRows.find((r) => r.id === id);
    if (!row) return false;
    try {
      const grid = await backend.downloadSurfaceGrid(row);
      setHzGrids((g) => ({ ...g, [id]: grid }));
      return true;
    } catch (e) { setStatus(`Horizon ${row.name}: ${e.message}`); return false; }
  }, [backend, hzRows]);
  useEffect(() => { for (const id of hzOn) if (!hzGrids[id]) loadGrid(id); }, [hzOn, hzGrids, loadGrid]);
  const toggleHorizon = (id) => setHzOn((on) => (on.includes(id) ? on.filter((x) => x !== id) : [...on, id]));
  // each drawn horizon becomes a read-only marker in every well it crosses
  const horizonPicks = useMemo(() => {
    const byWell = {}; const problems = {}; const names = [];
    for (const id of hzOn) {
      const c = hzList.find((x) => x.id === id);
      const row = hzRows.find((r) => r.id === id);
      const grid = hzGrids[id];
      if (!c || !row || !grid) continue;
      const name = horizonLabel(c);
      names.push(name);
      problems[id] = [];
      for (const w of sectionWells) {
        const hit = horizonAtWell(row, grid, w);
        if (hit.problem) { problems[id].push(`${w.name} (${hit.problem})`); continue; }
        (byWell[w.id] ||= []).push({ id: `hz:${id}:${w.id}`, well_id: w.id, name, md_m: hit.md, readonly: true, horizon: true, surface_type: 'formation_top', twt_ms: hit.twt });
      }
    }
    return { byWell, problems, names };
  }, [hzOn, hzList, hzRows, hzGrids, sectionWells]);
  const viewWells = useMemo(() => (horizonPicks.names.length
    ? sectionWells.map((w) => ({ ...w, tops: [...w.tops, ...(horizonPicks.byWell[w.id] || [])] }))
    : sectionWells), [sectionWells, horizonPicks]);
  const datumNames = useMemo(() => [...topNames, ...horizonPicks.names], [topNames, horizonPicks.names]);

  // WC-U1-013: the ghost and the report header ride in track_layout (no
  // migration, the column is jsonb) and come back with the section
  // (U2-001: opening another section replaces both, blank when it has none)
  useEffect(() => {
    if (!savedRow) return;
    const tl = savedRow.track_layout || {};
    setGhost(tl.ghost && tl.ghost.sourceWellId ? tl.ghost : null);
    setHzOn(Array.isArray(tl.horizons) ? tl.horizons.filter((x) => typeof x === 'string') : []);
    setReport(tl.report && typeof tl.report === 'object'
      ? { field: tl.report.field || '', analyst: tl.report.analyst || '', ...(Number(tl.report.pdfScale) > 0 ? { pdfScale: Number(tl.report.pdfScale) } : {}) }
      : { field: '', analyst: '' });
  }, [savedRow]);

  // WC-U1-013: unsaved changes. The baseline is what was restored (taken once
  // the restored wells have their data, so the default-shown tops settle) or
  // what was last saved; with neither, a section with wells is unsaved.
  const payload = useMemo(() => ({
    well_ids: order,
    datum,
    track_layout: { layouts, depthUnit, depthRef, spacing, columnWidth, zoneMode, shownTops, zonePair, ghost, report, horizons: hzOn },
  }), [order, datum, layouts, depthUnit, depthRef, spacing, columnWidth, zoneMode, shownTops, zonePair, ghost, report, hzOn]);
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
  // (a restored row whose wells are still loading has no baseline yet and is not unsaved)
  const unsaved = sectionLoaded && (baseline === null ? !savedRow && order.length > 0 : baseline !== snapshot);

  // ---- U2-001 named sections (owner-only rows) -----------------------------
  const namedSections = typeof backend.listSections === 'function';
  const [sections, setSections] = useState([]);
  const refreshSections = useCallback(async () => {
    if (!namedSections) return;
    try { setSections(await backend.listSections()); } catch (e) { setStatus(e.message); }
  }, [backend, namedSections]);
  useEffect(() => { if (sectionLoaded) refreshSections(); }, [sectionLoaded, refreshSections]);
  // an action that would drop unsaved changes waits for Save or Discard
  const [pendingAction, setPendingAction] = useState(null); // {label, run}
  const guarded = (label, run) => { if (unsaved) setPendingAction({ label, run }); else run(); };
  const suggestName = (kind) => (kind === 'duplicate' ? copyName(sectionName || DEFAULT_SECTION_NAME, sections) : freeName('New section', sections));
  const openNamed = (id) => guarded(`open ${sections.find((x) => x.id === id)?.name || 'that section'}`, async () => {
    setPickMode(null);
    const row = await openSection(id);
    if (row) pendingBaseline.current = true;
  });
  const nameAction = async (kind, name) => {
    try {
      if (kind === 'rename') {
        const r = await backend.renameSection(sectionId, name);
        setSectionName(r.name);
        setStatus(`Section renamed to ${r.name}.`);
      } else if (kind === 'duplicate') {
        const row = await backend.createSection(name, payload);
        setSectionId(row.id);
        setSectionName(row.name);
        setBaseline(snapshot);
        setStatus(`Saved a copy as ${row.name}; you are now working in it.`);
      } else {
        guarded(`start ${name}`, async () => {
          try {
            const { layouts: l, depthUnit: du, depthRef: dr, spacing: sp, columnWidth: cw } = payload.track_layout;
            const row = await backend.createSection(name, { well_ids: [], datum: { mode: 'structural' }, track_layout: { layouts: l, depthUnit: du, depthRef: dr, spacing: sp, columnWidth: cw } });
            setPickMode(null);
            startSection(row);
            await refreshSections();
            setStatus(`New section ${row.name}. Add wells from the map on the left.`);
          } catch (e) { setStatus(e.message); }
        });
        return;
      }
      await refreshSections();
    } catch (e) {
      setStatus(e.message);
    }
  };
  const deleteNamed = async () => {
    const name = sectionName;
    try {
      await backend.deleteSection(sectionId);
      const rest = (await backend.listSections());
      setSections(rest);
      if (rest.length) {
        const row = await openSection(rest[0].id);
        if (row) pendingBaseline.current = true;
      } else startSection(null);
      setStatus(`Deleted section ${name}. Its tops stay in the well registry.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

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
    for (const w of viewWells) {
      const t = (w.tops || []).find((x) => x.name === name);
      if (!t) continue;
      const d = depthOfFor(w, depthRef)(t.md_m);
      if (Number.isFinite(d)) return Number(d.toFixed(2));
    }
    return undefined;
  }, [viewWells, depthRef]);

  const wellName = (id) => (wells || []).find((w) => w.id === id)?.name || 'well';
  const canEdit = sectionWells.some((w) => w.is_own);

  // ---- U2-007 undo: a session stack of the tops edits written here ---------
  const [undoStack, setUndoStack] = useState([]);
  const undoBusy = useRef(false);
  const pushUndo = (entry) => setUndoStack((st) => [...st, entry].slice(-UNDO_LIMIT));
  const undo = async () => {
    if (undoBusy.current || !undoStack.length) return;
    undoBusy.current = true;
    const entry = undoStack[undoStack.length - 1];
    try {
      const { wellIds, remap, skipped } = await applyUndo(entry, backend);
      setUndoStack((st) => remapStack(st.slice(0, -1), remap));
      for (const id of wellIds) await refreshTops(id);
      if (entry.kind === 'rename' && wellIds.length) setShownTops((sh) => [...new Set([...sh, entry.from])]);
      const note = skipped.length ? ` Not undone: ${skipped.join('; ')}.` : '';
      setStatus(wellIds.length ? `Undid: ${entry.label}.${note}` : `Nothing undone.${note}`);
    } catch (e) {
      setStatus(`Undo failed: ${e.message}`);
    } finally {
      undoBusy.current = false;
    }
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return; // the field's own undo
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- tops: the shared geo_wells_tops rows ------------------------------
  const onTopMove = async (top, mdM) => {
    try {
      await backend.updateTop(top.id, { mdM });
      pushUndo(undoEntry.move(top, top.md_m, mdM, `move ${top.name} on ${wellName(top.well_id)}`));
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
      const row = await backend.saveTop(wellId, { name, mdM });
      if (row?.id) pushUndo(undoEntry.create([row], `add ${name} on ${wellName(wellId)}`));
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
    const done = [];
    try {
      for (const t of moves) { await backend.updateTop(t.id, { name: next }); done.push(t); }
      pushUndo(undoEntry.rename(done, name, next, `rename ${name} to ${next}`));
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
      if (done.length && done.length < moves.length) pushUndo(undoEntry.rename(done, name, next, `rename ${name} to ${next} (${done.length} of ${moves.length})`));
      setStatus(e.message);
    }
  };

  const deleteTop = async (name) => {
    const targets = editableTops(name);
    if (!targets.length) { setStatus(`No editable top named ${name} in the section.`); return; }
    const done = [];
    try {
      for (const t of targets) { await backend.deleteTop(t); done.push(t); }
      pushUndo(undoEntry.remove(done, `delete ${name} from ${done.length} well${done.length === 1 ? '' : 's'}`));
      for (const id of new Set(targets.map((t) => t.well_id))) await refreshTops(id);
      setStatus(`Deleted ${name} from ${targets.length} well${targets.length === 1 ? '' : 's'}${sharedNote(name)}. Undo puts ${targets.length === 1 ? 'it' : 'them'} back.`);
    } catch (e) {
      if (done.length && done.length < targets.length) pushUndo(undoEntry.remove(done, `delete ${name} from ${done.length} of ${targets.length} wells`));
      for (const id of new Set(done.map((t) => t.well_id))) await refreshTops(id);
      setStatus(e.message);
    }
  };

  // ---- U2-004 tops files --------------------------------------------------
  const loadSheetRows = useCallback(async () => {
    const list = wells || [];
    const all = typeof backend.listAllTops === 'function'
      ? await backend.listAllTops()
      : (await Promise.all(list.map((w) => backend.listTops(w.id)))).flat();
    return sheetRows(list, all);
  }, [backend, wells]);
  const applyTopsFile = async (plan) => {
    const entries = [];
    const touched = new Set();
    const created = [];
    let moved = 0;
    try {
      for (const c of plan.creates) {
        const row = await backend.saveTop(c.wellId, { name: c.name, mdM: Number(c.mdM.toFixed(4)) });
        if (row?.id) created.push(row);
        touched.add(c.wellId);
      }
      if (created.length) entries.push(undoEntry.create(created, 'tops file'));
      const rowsNow = plan.updates.length ? await loadSheetRows() : [];
      for (const u of plan.updates) {
        const wellId = rowsNow.find((r) => r.topId === u.topId)?.wellId;
        await backend.updateTop(u.topId, { mdM: Number(u.mdM.toFixed(4)) });
        entries.push(undoEntry.move({ id: u.topId, well_id: wellId, name: u.name }, u.fromM, Number(u.mdM.toFixed(4)), 'tops file'));
        if (wellId) touched.add(wellId);
        moved += 1;
      }
      setStatus(`Tops file applied: ${created.length} added, ${moved} moved${plan.problems.length ? `, ${plan.problems.length} line${plan.problems.length === 1 ? '' : 's'} not applied (listed in the import panel)` : ''}.`);
    } catch (e) {
      setStatus(`Tops file stopped: ${e.message} (${created.length} added and ${moved} moved before it; Undo reverts them).`);
    } finally {
      if (entries.length) pushUndo(undoEntry.batch(entries, `apply the tops file (${created.length} added, ${moved} moved)`));
      for (const id of touched) if (order.includes(id)) await refreshTops(id);
      const names = [...new Set(created.map((r) => r.name))];
      if (names.length) setShownTops((s) => [...new Set([...s, ...names])]);
    }
  };
  const exportTopsCsv = () => {
    const { text, count } = topsCsv(sectionWells, { unit: depthUnit, names: shownTops, sectionName: sectionName || '' });
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(sectionName || 'well-correlation').replace(/[^A-Za-z0-9]+/g, '_')}_tops_${depthUnit}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported ${count} top${count === 1 ? '' : 's'} (shown tops on the section wells) with MD, TVD and TVDSS in ${depthUnit} and TWT from checkshots.`);
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
  // and shared wells are named instead of skipped silently.
  // U2-005: by default the depth is the DISPLAYED depth (the section's
  // reference with its flattening or stretch), converted to each well's own
  // MD through the frame on screen, so on a flattened or TVDSS section the
  // seed lands where the practitioner pointed; "MD" keeps one MD for all.
  // A blank depth with the name of a top already picked on a section well
  // seeds from that pick's displayed depth.
  const shownRefLabel = `${datum.mode === 'flatten' ? 'flattened ' : datum.mode === 'stretch' ? 'stretched ' : ''}${DEPTH_REF_LABEL[depthRef]}`;
  // U2-003: a displayed value in time is ms, never converted to feet
  const dispLabel = (v) => (depthRef === 'twt' ? `${Number(v).toFixed(1)} ms` : depthLabel(v, depthUnit));
  const dispUnit = depthRef === 'twt' ? 'ms' : depthUnit;
  const propagate = async (nameRaw, depthText, refMode = 'displayed') => {
    const name = String(nameRaw ?? '').trim();
    const t = String(depthText ?? '').trim();
    if (!name) { setStatus('Type the name of the top to propagate.'); return; }
    const conv = exportRef.current;
    const displayed = refMode !== 'md' && conv?.mdAt;
    let dispM;
    let seedNote = '';
    if (!t) {
      const src = sectionWells.find((w) => (w.tops || []).some((x) => nameKey(x.name) === nameKey(name)));
      const top = src?.tops.find((x) => nameKey(x.name) === nameKey(name));
      const d = src && conv?.displayedAt ? conv.displayedAt(src.id, top.md_m) : NaN;
      if (!Number.isFinite(d)) { setStatus(`Type the depth (${displayed ? `${shownRefLabel}, ${dispUnit}` : `MD, ${depthUnit}`}) to seed ${name} at.`); return; }
      dispM = d;
      seedNote = ` (seeded from its pick on ${src.name})`;
    } else {
      const v = /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
      if (!Number.isFinite(v) || (!displayed && v < 0)) { setStatus(`"${t}" is not a ${displayed ? 'depth' : 'measured depth'}; type a number of ${depthUnit}${displayed ? ` on the ${shownRefLabel} axis` : ' at or below the depth reference'}.`); return; }
      dispM = displayed && depthRef === 'twt' ? v : fromDisplay(v, depthUnit);
    }
    const useDisplayed = displayed || !!seedNote;
    const skipped = [];
    const targets = [];
    for (const w of sectionWells) {
      if (!w.is_own) { skipped.push(`${w.name} (shared, read-only)`); continue; }
      if ((w.tops || []).some((x) => nameKey(x.name) === nameKey(name))) { skipped.push(`${w.name} (already has it)`); continue; }
      let md = dispM;
      if (useDisplayed) {
        const inv = conv.mdAt(w.id, dispM);
        if (!inv || !Number.isFinite(inv.md) || inv.md < 0) { skipped.push(`${w.name} (outside the well at that depth)`); continue; }
        if (inv.ambiguous) { skipped.push(`${w.name} (that depth is reached twice along the well; pick it by hand)`); continue; }
        md = inv.md;
      }
      md = Number(md.toFixed(4));
      let td = Number.isFinite(Number(w.frame?.tdMdM)) && Number(w.frame.tdMdM) > 0 ? Number(w.frame.tdMdM) : null;
      if (td === null && w.depth?.length) { for (let i = w.depth.length - 1; i >= 0; i--) if (Number.isFinite(w.depth[i])) { td = w.depth[i]; break; } }
      if (td !== null && md > td + 1e-6) { skipped.push(`${w.name} (below TD ${depthLabel(td, depthUnit)})`); continue; }
      targets.push({ wellId: w.id, mdM: md });
    }
    const skipNote = skipped.length ? ` Not added: ${skipped.join(', ')}.` : '';
    if (!targets.length) { setStatus(`${name} was not propagated.${skipNote}`); return; }
    try {
      const created = await backend.propagateTop(name, targets);
      if (created.length) pushUndo(undoEntry.create(created, `propagate ${name} to ${created.length} well${created.length === 1 ? '' : 's'}`));
      for (const w of targets) await refreshTops(w.wellId);
      setShownTops((s) => (s.includes(name) ? s : [...s, name]));
      const mds = targets.map((x) => x.mdM);
      const lo = Math.min(...mds); const hi = Math.max(...mds);
      const where = useDisplayed
        ? `${dispLabel(dispM)} ${shownRefLabel}${seedNote} (MD ${lo === hi ? depthLabel(lo, depthUnit) : `${depthLabel(lo, depthUnit)} to ${depthLabel(hi, depthUnit)}`})`
        : `${depthLabel(dispM, depthUnit)} MD`;
      setStatus(`Propagated ${name} to ${created.length} well${created.length === 1 ? '' : 's'} at ${where}.${skipNote}`);
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
      // U2-001: a named row is saved by id; a first save creates a named row
      // (never the newest row of another section)
      let row;
      if (sectionId || !namedSections) row = await backend.saveSection(payload, sectionId ? { id: sectionId } : undefined);
      else row = await backend.createSection(sectionName || freeName(DEFAULT_SECTION_NAME, sections), payload);
      if (row?.id) setSectionId(row.id);
      if (row?.name) setSectionName(row.name);
      setBaseline(snapshot);
      setStatus(`Section saved${row?.name ? ` as ${row.name}` : ''}.`);
      await refreshSections();
      return true;
    } catch (e) {
      setStatus(e.message);
      return false;
    }
  };

  const exportPng = async () => {
    try {
      const blob = await exportRef.current.toPng(({ scale, spacing: spacingUsed, window: shown }) => sectionCaption({
        wells: sectionWells, datum, depthRef, depthUnit, spacing: spacingUsed, templateName: template.name, scale, report, window: shown,
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

  // U2-006: the section plotted to scale. The drawn depth window is rendered
  // offscreen at the height that makes it measure span / N on paper, every
  // well at the current column width, and placed on a page of that size.
  const exportPdf = async () => {
    const meta = exportRef.current?.meta?.();
    if (!meta) return;
    if (depthRef === 'twt') { setStatus('A PDF to scale needs a depth axis: switch the reference to MD, TVD or TVDSS (a time section has no 1:N scale).'); return; }
    const scaleN = Number(report.pdfScale) || (depthUnit === 'ft' ? 1200 : 1000);
    const colW = Math.max(60, Math.round(meta.colW || 140));
    const band = columnLayout(sectionWells, { mode: meta.spacing, plotLeft: 0, plotW: 1, fixedW: colW });
    const contentW = AXIS_W + Math.max(...band.map((b) => b.x0 + b.w)) + 2;
    const plan = printPlan({ vTop: meta.vTop, vBase: meta.vBase, scaleN, contentW, plotTop: PLOT_TOP, padBottom: sectionHeightFor(0) - PLOT_TOP });
    if (plan.problem) { setStatus(plan.problem); return; }
    setStatus(`Plotting the section at 1:${scaleN.toLocaleString('en-US')}...`);
    try {
      const canvas = await new Promise((resolve, reject) => {
        printDone.current = { resolve, reject };
        setPrintJob({ w: plan.wCss, h: plan.hCss, pixelRatio: plan.pixelRatio, view: [meta.vTop, meta.vBase], colW });
        setTimeout(() => reject(new Error('The print render did not finish; try again or zoom the depth window.')), 30000);
      });
      const header = sectionCaption({
        wells: sectionWells, datum, depthRef, depthUnit, spacing: meta.spacing, templateName: template.name, scale: scaleN, report,
      });
      const legend = [...shownTops.filter((n) => topNames.includes(n)), ...horizonPicks.names].map((name) => ({ name, color: topColor(name) }));
      const fillNote = zoneMode === 'none' ? 'none' : zoneMode === 'pair' ? (zonePair ? `${zonePair[0]} to ${zonePair[1]}` : 'none') : 'between consecutive shown tops, coloured by the upper top';
      const { doc, fileName } = buildSectionPdf({
        imageDataUrl: canvas.toDataURL('image/png'), plan, plotTopCss: PLOT_TOP, header, scaleN, depthUnit, legend, fillNote,
      });
      doc.save(fileName);
      setStatus(`Section exported as PDF at 1:${scaleN.toLocaleString('en-US')} (${(plan.plotHmm / 10).toFixed(1)} cm for the ${Math.round(Math.abs(meta.vBase - meta.vTop) * (depthUnit === 'ft' ? 1 / 0.3048 : 1))} ${depthUnit} window, all ${sectionWells.length} wells).`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      printDone.current = null;
      setPrintJob(null);
    }
  };
  const onPrintPainted = useCallback((canvas) => {
    const p = printDone.current;
    if (p) { printDone.current = null; p.resolve(canvas); }
  }, []);

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
      <ModuleHomeLink module="geoscience" testId="corr-home" />
      <GitCompare className="w-4 h-4 text-pl-primary-text" />
      <span className="text-sm font-semibold text-pl-text">Well Correlation</span>
      {namedSections ? (pendingAction ? (
        <div className="flex items-center gap-1 text-[11px]" data-testid="corr-section-pending">
          <span className="text-pl-warning-text">Unsaved changes. Before you {pendingAction.label}:</span>
          <button type="button" className="px-1.5 py-0.5 rounded border border-pl-primary text-pl-primary-text" data-testid="corr-section-save-first"
            onClick={async () => { const a = pendingAction; setPendingAction(null); if (await saveSection()) await a.run(); }}>Save first</button>
          <button type="button" className="px-1.5 py-0.5 rounded border border-pl-border text-pl-text" data-testid="corr-section-discard"
            onClick={async () => { const a = pendingAction; setPendingAction(null); await a.run(); }}>Discard changes</button>
          <button type="button" className="px-1.5 py-0.5 rounded border border-pl-border text-pl-muted" data-testid="corr-section-cancel"
            onClick={() => setPendingAction(null)}>Cancel</button>
        </div>
      ) : (
        <SectionPicker sections={sections} currentId={sectionId} currentName={sectionName}
          onOpen={openNamed} onName={nameAction} onDelete={deleteNamed} suggestName={suggestName} />
      )) : <span className="text-[11px] text-pl-muted">cross-sections on the shared well registry</span>}
      <div className="ml-auto flex items-center gap-1">
        <Link to="/dashboard/apps/geoscience/well-correlation/help" data-testid="corr-help" title="Open the Well Correlation help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken">
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
        <button type="button" data-testid="corr-undo" disabled={!undoStack.length}
          title={undoStack.length ? `Undo ${undoStack[undoStack.length - 1].label} (Ctrl+Z)` : 'Nothing to undo: tops you drag, pick, propagate, rename or delete here can be undone'}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"
          onClick={undo}>
          <Undo2 className="w-3.5 h-3.5" /> Undo{undoStack.length ? ` (${undoStack.length})` : ''}
        </button>
        <button type="button" data-testid="corr-export-png" disabled={!sectionWells.length}
          title="Download the section as a PNG image"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"
          onClick={exportPng}>
          <ImageDown className="w-3.5 h-3.5" /> PNG
        </button>
        <button type="button" data-testid="corr-export-pdf" disabled={!sectionWells.length || !!printJob}
          title={`Download the section as a PDF plotted to scale (1:${(Number(report.pdfScale) || (depthUnit === 'ft' ? 1200 : 1000)).toLocaleString('en-US')}; change it under Report header)`}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"
          onClick={exportPdf}>
          <FileDown className="w-3.5 h-3.5" /> PDF
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
      wells={viewWells}
      datum={datum}
      depthUnit={depthUnit}
      depthRef={depthRef}
      spacing={spacing}
      columnWidth={columnWidth}
      zoneMode={zoneMode}
      zonePair={zonePair}
      shownTops={horizonPicks.names.length ? [...shownTops, ...horizonPicks.names] : shownTops}
      topNames={topNames}
      pickMode={pickMode}
      onTopMove={canEdit ? onTopMove : undefined}
      onTopCreate={createTop}
      onPickCancel={() => setPickMode(null)}
      onNotice={setStatus}
      ghost={ghost}
    />
  );

  const printHost = printJob ? (
    <div aria-hidden="true" data-testid="corr-print-host" style={{ position: 'fixed', left: -100000, top: 0, width: printJob.w, height: printJob.h, pointerEvents: 'none' }}>
      <CrossSection
        wells={viewWells} datum={datum} depthUnit={depthUnit} depthRef={depthRef} spacing={spacing}
        columnWidth={printJob.colW} zoneMode={zoneMode} zonePair={zonePair} shownTops={horizonPicks.names.length ? [...shownTops, ...horizonPicks.names] : shownTops} topNames={topNames}
        ghost={ghost} view={printJob.view} onViewChange={() => {}}
        printSize={{ w: printJob.w, h: printJob.h, pixelRatio: printJob.pixelRatio }} onPainted={onPrintPainted}
      />
    </div>
  ) : null;

  return (
    <>
    {printHost}
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
          onAddMany={async (ids) => {
            await Promise.all(ids.map((id) => ensureWellData(id)));
            setOrder((o) => [...o, ...ids.filter((id) => !o.includes(id))]);
            setStatus(`Added ${ids.length} well${ids.length === 1 ? '' : 's'} to the section.`);
          }}
          onRemoveMany={(ids) => { setOrder((o) => o.filter((x) => !ids.includes(x))); setStatus(`Removed ${ids.length} well${ids.length === 1 ? '' : 's'} from the section.`); }}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-pl-surface border-l border-pl-border">
          <SectionControls
            topNames={topNames}
            datumNames={datumNames}
            horizons={canHorizons ? { list: hzList, on: hzOn, onToggle: toggleHorizon, problems: horizonPicks.problems, loaded: hzGrids, picks: horizonPicks.byWell } : null}
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
            columnWidth={columnWidth}
            onColumnWidth={setColumnWidth}
            layouts={layouts}
            onLayoutsChange={setLayouts}
            logSources={logSources}
            shownTops={shownTops}
            onToggleTop={(n) => setShownTops((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))}
            onShowAllTops={(on) => setShownTops(on ? topNames : [])}
            pickMode={pickMode}
            onPickMode={setPickMode}
            onReloadTops={reloadTops}
            topsFile={{ wells: wells || [], loadRows: loadSheetRows, onApply: applyTopsFile, onExport: exportTopsCsv }}
            onRenameTop={renameTop}
            onDeleteTop={deleteTop}
            mapHrefFor={(name) => mapTopHref(name, order.filter((id) => (wellData[id]?.tops || []).some((t) => t.name === name)), mappingPath)}
            zoneMode={zoneMode}
            onZoneMode={setZoneMode}
            zonePair={zonePair}
            onZonePair={setZonePair}
            onPropagate={propagate}
            propRefLabel={shownRefLabel}
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
    </>
  );
}
