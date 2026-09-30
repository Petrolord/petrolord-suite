// Well detail: header / logs (table + quick-view tracks) / tops /
// deviation / checkshots tabs for the selected well. Owns its own
// child-data fetching (tops + log metadata reload on well change;
// curve samples download on demand and cache per log id). Owner-only
// actions hide on org-shared read-only wells, mirroring what RLS would
// reject server-side.

import { Link } from 'react-router-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2, Building2, Lock, Pencil, Download } from 'lucide-react';
import LogTracks from './LogTracks';
import ExportDialog from './ExportDialog';
import ZonesPanel from './ZonesPanel';
import { curveOrigin } from '../engine/provenance';
import { OpenInAppMenu } from '@/components/wells/OpenInAppMenu';
import { mapTopHref, appPath, MAPPING_ID } from '@/components/wells/appLinks';
import CrsBadge from '@/components/crs/CrsBadge';
import CrsPicker from '@/components/crs/CrsPicker';
import { datumTransformInfo } from '@/lib/crs';
import { surfaceCoordProblem } from '@/lib/wellsRegistry';
import RowGridEditor from '@/components/wells/RowGridEditor';
import PasteReplacePanel, { CheckshotConventionRow } from '@/components/wells/PasteReplacePanel';
import { buildDeviation, buildTops, buildCheckshotInputs } from '@/lib/wellImport';
import { SURFACE_TYPES, displayLabel, normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import IntervalsEditor from '@/components/wells/IntervalsEditor';
import CoreImagesPanel from '@/components/wells/CoreImagesPanel';
import { useScheme } from '@/lib/stratigraphy/scheme';
import {
  makeDepthFrame, toStoredCheckshots, fromStoredCheckshots, rebaseStoredCheckshots,
  makeCheckshotProvenance, LEGACY_CHECKSHOT_PROVENANCE, PETREL_CHECKSHOT_CONVENTION,
} from '../engine/checkshots';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { fmtDepth, editCell, parseDisplayed, unitText, toDisp } from '../engine/displayUnits';
import { bottomUpLogs, orientForDisplay, planReorient } from '../engine/reorient';
import { isDepthAlias } from '../engine/lasIndex';
import { planRestore, recreatePayload } from '../engine/topsUndo';

const TABS = ['Header', 'Logs', 'Tops', 'Zones', 'Intervals', 'Core', 'Deviation', 'Checkshots'];

// Paste-replace field lists, hoisted so every render hands PasteReplacePanel
// the same array (a fresh literal per render used to re-parse and re-emit
// onParsed without end).
const TOPS_PASTE_FIELDS = ['name', 'md'];
const DEVIATION_PASTE_FIELDS = ['md', 'inc', 'azi'];
const CHECKSHOT_PASTE_FIELDS = ['depth', 'time'];

const thCls = 'text-left font-medium text-pl-muted pr-4 pb-1';
const tdCls = 'pr-4 py-0.5 text-pl-text whitespace-nowrap';

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-pl-muted">{label}</div>
      <div className="text-sm text-pl-text">{children ?? EMPTY_VALUE}</div>
    </div>
  );
}

const fmt = (v, digits = 1) => (Number.isFinite(v) ? Number(v).toFixed(digits) : EMPTY_VALUE);

const REF_LABEL = { md: 'MD', tvd: 'TVD', tvdss: 'TVDSS' };
const btnCls = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken';
const primaryCls = 'px-2 py-0.5 rounded text-xs bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg';
const numCell = (v, d = 2) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '');

/** Convention a stored table was entered in (legacy rows: TVDSS/TWT/m). */
const conventionOf = (well) => {
  const u = well?.checkshots_provenance?.units_in;
  return u ? { depthRef: u.depth_ref, time: u.time, depthUnit: u.depth_unit } : { depthRef: 'tvdss', time: 'twt', depthUnit: 'm' };
};

/** @param {number} [p.refreshNonce] bump to reload tops/logs for the SAME
 *  well (a LAS import into the selected well, 2026-09-03)
 *  @param {(row: Object) => void} [p.onWellChanged] the well row was edited
 *  here (PT1); the workstation reloads its list
 *  @param {string} [p.initialTab] tab to open with (deep link)
 *  @param {Object} [p.appPaths] route overrides for the "Open in" launcher */
/** Registry well statuses (geo_wells.status CHECK) and their labels. */
export const WELL_STATUS_LABELS = Object.freeze({
  planned: 'Planned', drilling: 'Drilling', oil: 'Oil', gas: 'Gas', oil_gas: 'Oil and gas', water: 'Water',
  dry: 'Dry', injector_water: 'Water injector', injector_gas: 'Gas injector', suspended: 'Suspended', abandoned: 'Abandoned',
});

export default function WellDetail({ backend, well, unit = 'm', onStatus, refreshNonce = 0, onWellChanged, initialTab = null, appPaths = {} }) {
  const u = unitText(unit); // WDM-U2-001: every depth on screen reads in the display unit
  const [tab, setTab] = useState(() => TABS.find((t) => t.toLowerCase() === String(initialTab || '').toLowerCase()) || 'Header');
  // PT1 edit modes: one tab edits at a time; `editor` holds the draft
  const [editor, setEditor] = useState(null); // {tab, rows|fields, conv, mode:'grid'|'paste', pasted, error, busy}
  const [statusValue, setStatusValue] = useState(null); // T1: well status picked here (null = as loaded)
  const [csView, setCsView] = useState(null); // display convention for the checkshot tab (null = as entered)
  const canEdit = !!well.is_own && typeof backend.updateWellData === 'function';
  const [tops, setTops] = useState(null);       // null = loading
  const [units, setUnits] = useState([]);       // stratigraphic column (ST0), for the Unit column
  const [intervals, setIntervals] = useState([]);   // ST1 interval logs of the well
  const [coreImages, setCoreImages] = useState([]); // ST1 core photos of the well
  const [zones, setZones] = useState(null);        // WDM-U2-008: Petrophysics zones (read-only here)
  const [scheme] = useScheme();
  const [logs, setLogs] = useState(null);
  // Legacy wells carry no structured CRS; Assign CRS patches the row
  // in place (declares what the stored coordinates already are — it
  // never transforms them). crsPatch mirrors the update locally.
  const [assigningCrs, setAssigningCrs] = useState(false);
  const [crsPatch, setCrsPatch] = useState(null);
  const [plotted, setPlotted] = useState([]);   // log ids ticked for the tracks
  const [tracks, setTracks] = useState([]);     // [{log, data}] resolved curves
  const [curveBusy, setCurveBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // WDM-U1-006: log id awaiting a second click
  const [exportOpen, setExportOpen] = useState(false);      // WDM-U2-002
  const [topsUndo, setTopsUndo] = useState(null);           // WDM-U2-016: {wellId, tops, what} before the last tops save
  const curveCache = useRef(new Map());         // log id -> Float32Array

  const refreshChildren = useCallback(async () => {
    setTops(null);
    setLogs(null);
    setZones(null);
    try {
      const [t, l, u, iv, ci, zs] = await Promise.all([
        backend.listTops(well.id), backend.listLogs(well.id),
        backend.listUnits ? backend.listUnits().catch(() => []) : Promise.resolve([]),
        backend.listIntervals ? backend.listIntervals(well.id).catch(() => []) : Promise.resolve([]),
        backend.listCoreImages ? backend.listCoreImages(well.id).catch(() => []) : Promise.resolve([]),
        backend.listZones ? backend.listZones(well.id).catch(() => []) : Promise.resolve([]),
      ]);
      setZones(zs || []);
      setTops(t);
      setUnits(u || []);
      setIntervals(iv || []);
      setCoreImages(ci || []);
      setLogs(l);
    } catch (e) {
      onStatus(e.message);
      setTops([]);
      setLogs([]);
      setZones([]);
    }
  }, [backend, well.id, onStatus]);

  useEffect(() => {
    setPlotted([]);
    setTracks([]);
    curveCache.current = new Map();
    refreshChildren();
  }, [refreshChildren, refreshNonce]);

  // PT1: leave any edit mode when the well changes
  useEffect(() => { setEditor(null); setCsView(null); setStatusValue(null); setTopsUndo(null); }, [well.id]);

  // PT8: the frame the surface coordinates are already in. Editing them
  // never transforms anything, so the label states the frame plainly.
  const crsTag = crsPatch?.crs ?? well.crs;
  const crsLabel = crsTag || 'CRS not assigned';
  // WDM-U1-011: the coordinates are in the CRS's own unit (xy_unit), which
  // is feet for a state-plane well; the label never assumes metres
  const xyUnitLabel = well.xy_unit || 'm';

  const entered = useMemo(() => conventionOf(well), [well]);
  const csDisplay = csView || entered;
  const frame = useMemo(() => makeDepthFrame({ deviation: well.deviation, kbM: well.kb_m ?? 0, tdMdM: well.td_md_m }), [well.deviation, well.kb_m, well.td_md_m]);
  const csRows = useMemo(() => {
    try { return fromStoredCheckshots(well.checkshots || [], csDisplay, frame); } catch (e) { return []; }
  }, [well.checkshots, csDisplay, frame]);
  // WDM-U1-010: tops read in MD, TVD and TVDSS side by side, through the
  // same survey + KB frame the checkshots use (Petrel's well tops table)
  const topDepths = useMemo(() => {
    const out = new Map();
    for (const t of tops || []) {
      try { out.set(t.id, frame.mdToPosition(Number(t.md_m))); } catch (e) { out.set(t.id, null); }
    }
    return out;
  }, [tops, frame]);
  const frameNote = frame.isVertical
    ? 'No deviation survey: the well is treated as vertical (MD = TVD, TVDSS = MD - KB).'
    : `Converting through the ${frame.stations.length}-station survey and KB ${fmtDepth(well.kb_m, unit)} ${u}${frame.assumedVerticalToFirstStation ? ' (vertical above the first station)' : ''}.`;

  /** Re-express the grid rows when the user switches convention mid-edit. */
  const regridRows = (rows, from, to) => {
    try {
      const inputs = rows.map((r) => ({ depth: Number(r.depth), time: Number(r.time) }));
      if (inputs.some((r) => !Number.isFinite(r.depth) || !Number.isFinite(r.time)) || inputs.length < 2) return rows;
      const { rows: stored } = toStoredCheckshots(inputs, from, frame);
      return fromStoredCheckshots(stored, to, frame).map((r) => ({ depth: numCell(r.depth, 3), time: numCell(r.time, 2) }));
    } catch (e) {
      return rows;
    }
  };

  const startEdit = (which) => {
    if (which === 'Header') {
      setEditor({ tab: 'Header',
        fields: {
          // PT8: surface coordinates are CRS world coordinates, so they are
          // NOT touched by the m/ft selector below (that is a depth unit).
          x: well.surface_x == null ? '' : numCell(Number(well.surface_x), 3),
          y: well.surface_y == null ? '' : numCell(Number(well.surface_y), 3),
          kb: editCell(well.kb_m ?? 0, unit, 3),
          td: editCell(well.td_md_m, unit, 2),
          unit: u,
        },
        error: null,
        busy: false });
    } else if (which === 'Tops') {
      setEditor({ tab: 'Tops', mode: 'grid', unit: u, conv: { mdUnit: u }, pasted: null, error: null, busy: false,
        rows: (tops || []).map((t) => ({ id: t.id, name: t.name, md: editCell(t.md_m, u, 2), interpreter: t.interpreter || '',
          surface_type: normalizeSurfaceType(t.surface_type), unit_id: t.unit_id || '', confidence: t.confidence || '', age_ma: t.age_ma == null ? '' : String(t.age_ma) })) });
    } else if (which === 'Deviation') {
      setEditor({ tab: 'Deviation', mode: 'grid', unit: u, conv: { mdUnit: u }, pasted: null, error: null, busy: false,
        rows: (well.deviation || []).map((d) => ({ md: editCell(d.md, u, 2), origMd: d.md, inc: numCell(d.inc, 2), azi: numCell(d.azi, 2) })) });
    } else if (which === 'Checkshots') {
      const conv = (well.checkshots || []).length ? entered : { ...PETREL_CHECKSHOT_CONVENTION };
      const shown = (well.checkshots || []).length ? fromStoredCheckshots(well.checkshots, conv, frame) : [];
      setEditor({ tab: 'Checkshots', mode: shown.length ? 'grid' : 'paste', conv, pasted: null, error: null, busy: false,
        rows: shown.map((r) => ({ depth: numCell(r.depth, 3), time: numCell(r.time, 2) })) });
    }
  };

  const finish = async (row, message) => {
    setEditor(null);
    onStatus(message);
    if (onWellChanged) await onWellChanged(row);
  };

  const saveEditor = async () => {
    if (!editor) return;
    setEditor((ed) => ({ ...ed, busy: true, error: null }));
    try {
      if (editor.tab === 'Header') {
        const f = editor.fields;
        // PT8: a blank coordinate clears it; anything else must be finite.
        // The value is stored as typed — it is already in the well's CRS.
        const coord = (raw, label) => {
          // WDM-U2-F01: the registry needs a location; never send a blank
          const bad = surfaceCoordProblem(label, raw, `${xyUnitLabel}, ${crsLabel}`);
          if (bad) throw new Error(bad);
          const v = Number(raw);
          if (!Number.isFinite(v)) throw new Error(`${label} must be a number in the well's CRS (${crsLabel}).`);
          return v;
        };
        const surfaceX = coord(f.x, 'Surface X');
        const surfaceY = coord(f.y, 'Surface Y');
        // WDM-U2-001: an untouched KB or TD keeps its stored metres exactly
        const kbM = parseDisplayed(f.kb, f.unit, well.kb_m ?? 0, 3);
        if (!Number.isFinite(kbM)) throw new Error(`KB must be a number (${f.unit} above datum).`);
        const tdMdM = f.td.trim() === '' ? null : parseDisplayed(f.td, f.unit, well.td_md_m, 2);
        if (tdMdM !== null && !(tdMdM > 0)) throw new Error(`TD must be a positive number (${f.unit} MD).`);
        const patch = { surfaceX, surfaceY, kbM, tdMdM };
        let note = '';
        if ((well.checkshots || []).length && Math.abs(kbM - (well.kb_m ?? 0)) > 1e-9) {
          if (well.checkshots_provenance) {
            const next = makeDepthFrame({ deviation: well.deviation, kbM, tdMdM });
            const rb = rebaseStoredCheckshots(well.checkshots, well.checkshots_provenance, next);
            patch.checkshots = rb.rows;
            patch.checkshotsProvenance = rb.provenance;
            note = ` Checkshots re-derived for KB ${fmt(kbM, 2)} m (${rb.rows.length} rows, ${REF_LABEL[rb.provenance.units_in.depth_ref]} reference kept).`;
          } else {
            note = ' Legacy checkshot table left as stored (assumed TVDSS).';
          }
        }
        const row = await backend.updateWellData(well.id, patch);
        await finish(row, `Header saved.${note}`);
        return;
      }
      if (editor.tab === 'Deviation') {
        let stations;
        if (editor.mode === 'paste') {
          if (!editor.pasted) throw new Error('Paste a survey first.');
          stations = buildDeviation(editor.pasted.parsed.rows, editor.pasted.map, { mdUnit: editor.conv.mdUnit });
        } else {
          stations = editor.rows.filter((r) => String(r.md).trim() !== '' || String(r.inc).trim() !== '' || String(r.azi).trim() !== '')
            .map((r) => ({ md: parseDisplayed(r.md, editor.unit, r.origMd ?? null, 2), inc: Number(r.inc), azi: Number(r.azi) }));
        }
        const patch = { deviation: stations };
        let note = '';
        if ((well.checkshots || []).length && well.checkshots_provenance?.units_in?.depth_ref === 'md') {
          const next = makeDepthFrame({ deviation: stations, kbM: well.kb_m ?? 0, tdMdM: well.td_md_m });
          const rb = rebaseStoredCheckshots(well.checkshots, well.checkshots_provenance, next);
          patch.checkshots = rb.rows;
          patch.checkshotsProvenance = rb.provenance;
          note = ` Checkshots re-derived through the new survey (${rb.rows.length} rows).`;
        }
        const row = await backend.updateWellData(well.id, patch);
        await finish(row, `Deviation survey saved (${stations.length} stations).${note}`);
        return;
      }
      if (editor.tab === 'Checkshots') {
        let inputs;
        if (editor.mode === 'paste') {
          if (!editor.pasted) throw new Error('Paste a checkshot table first.');
          inputs = buildCheckshotInputs(editor.pasted.parsed.rows, editor.pasted.map, { elevation: editor.mode === 'paste' && !!editor.conv.elevation });
        } else {
          inputs = editor.rows.filter((r) => String(r.depth).trim() !== '' || String(r.time).trim() !== '')
            .map((r) => ({ depth: Number(r.depth), time: Number(r.time) }));
        }
        let rows = [];
        let prov = null;
        if (inputs.length) {
          const res = toStoredCheckshots(inputs, editor.conv, frame);
          rows = res.rows;
          prov = makeCheckshotProvenance(editor.conv, { source: 'wdm-edit', kbM: well.kb_m ?? 0, stations: frame.stations ? frame.stations.length : 0 });
          if (editor.mode === 'paste' && editor.conv.elevation) prov.z_elevation = true;
          if (res.warnings.length) onStatus(res.warnings[0]);
        }
        const row = await backend.updateWellData(well.id, { checkshots: rows, checkshotsProvenance: prov });
        await finish(row, rows.length ? `Checkshots saved (${rows.length} rows, entered as ${REF_LABEL[editor.conv.depthRef]} ${editor.conv.depthUnit} / ${editor.conv.time.toUpperCase()}).` : 'Checkshots cleared.');
        return;
      }
      if (editor.tab === 'Tops') {
        const snapshot = (tops || []).map((t) => ({ ...t }));
        if (editor.mode === 'paste') {
          if (!editor.pasted) throw new Error('Paste tops first.');
          const list = buildTops(editor.pasted.parsed.rows, editor.pasted.map, { mdUnit: editor.conv.mdUnit });
          setTopsUndo({ wellId: well.id, tops: snapshot, what: 'replace from paste' });
          await backend.replaceTops(well.id, list);
          setEditor(null);
          onStatus(`Tops replaced (${list.length}).`);
          await refreshChildren();
          if (onWellChanged) await onWellChanged(well);
          return;
        }
        const wanted = editor.rows.filter((r) => String(r.name).trim() !== '' || String(r.md).trim() !== '');
        for (let i = 0; i < wanted.length; i++) {
          const r = wanted[i];
          if (!String(r.name).trim()) throw new Error(`Row ${i + 1}: the top has no name.`);
          if (!Number.isFinite(Number(r.md)) || String(r.md).trim() === '') throw new Error(`Row ${i + 1}: MD "${r.md}" is not a number.`);
        }
        const before = tops || [];
        setTopsUndo({ wellId: well.id, tops: snapshot, what: 'grid save' });
        const keptIds = new Set(wanted.filter((r) => r.id).map((r) => r.id));
        for (const t of before) if (!keptIds.has(t.id)) await backend.deleteTop(t);
        let changed = 0;
        for (const r of wanted) {
          // WDM-U2-001: typed in the display unit; an untouched cell keeps its metres
          const md = parseDisplayed(r.md, editor.unit, r.id ? before.find((t) => t.id === r.id)?.md_m ?? null : null, 2);
          const interpreter = String(r.interpreter || '').trim() || null;
          if (r.age_ma !== '' && r.age_ma != null && !Number.isFinite(Number(r.age_ma))) throw new Error(`"${r.name}": the age "${r.age_ma}" is not a number.`);
          const typed = {
            surface_type: normalizeSurfaceType(r.surface_type),
            unit_id: r.unit_id || null,
            confidence: r.confidence || null,
            age_ma: r.age_ma === '' || r.age_ma == null ? null : Number(r.age_ma),
          };
          if (r.id) {
            const orig = before.find((t) => t.id === r.id);
            const typedChanged = orig && (normalizeSurfaceType(orig.surface_type) !== typed.surface_type || (orig.unit_id || null) !== typed.unit_id
              || (orig.confidence || null) !== typed.confidence || (orig.age_ma ?? null) !== typed.age_ma);
            if (orig && (orig.name !== r.name.trim() || Math.abs(orig.md_m - md) > 1e-9 || (orig.interpreter || null) !== interpreter || typedChanged)) {
              await backend.updateTop(r.id, { name: r.name.trim(), mdM: md, interpreter, ...typed });
              changed++;
            }
          } else {
            await backend.saveTop(well.id, { name: r.name.trim(), mdM: md, interpreter, ...typed });
            changed++;
          }
        }
        setEditor(null);
        onStatus(`Tops saved (${changed} changed, ${before.length - keptIds.size} removed).`);
        await refreshChildren();
        if (onWellChanged) await onWellChanged(well);
      }
    } catch (e) {
      setEditor((ed) => (ed ? { ...ed, busy: false, error: e.message } : ed));
    }
  };

  // resolve ticked ids to curve data (cache-first, download the rest)
  useEffect(() => {
    if (!logs) return;
    const wanted = logs.filter((l) => plotted.includes(l.id));
    let cancelled = false;
    (async () => {
      setCurveBusy(true);
      try {
        const resolved = [];
        const get = async (log) => {
          let data = curveCache.current.get(log.id);
          if (!data) {
            data = await backend.downloadCurve(log);
            curveCache.current.set(log.id, data);
          }
          return data;
        };
        // WDM-U2-010: a curve an earlier release stored bottom-up is shown
        // reoriented (depth increasing) even before the owner repairs it
        const depthLog = logs.find((l) => isDepthAlias(l.mnemonic));
        for (const log of wanted) {
          const data = await get(log);
          const up = bottomUpLogs([log]).length > 0;
          const depthData = up && depthLog ? await get(depthLog) : null;
          const o = orientForDisplay(log, data, depthData);
          resolved.push({ log: o.log, data: o.data });
        }
        if (!cancelled) setTracks(resolved);
      } catch (e) {
        if (!cancelled) onStatus(e.message);
      } finally {
        if (!cancelled) setCurveBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plotted, logs, backend, onStatus]);

  const togglePlot = (id) => setPlotted((p) => (
    p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const deleteLog = async (log) => {
    try {
      await backend.deleteLog(log);
      curveCache.current.delete(log.id);
      setPlotted((p) => p.filter((x) => x !== log.id));
      onStatus(`Deleted log ${log.mnemonic}.`);
      refreshChildren();
    } catch (e) {
      onStatus(e.message);
    }
  };

  const shared = !!well.organization_id;
  // WDM-U2-F01: Save stays disabled while X or Y is blank or not a number
  const headerProblem = editor?.tab === 'Header'
    ? (surfaceCoordProblem('Surface X', editor.fields.x, `${xyUnitLabel}, ${crsLabel}`) || surfaceCoordProblem('Surface Y', editor.fields.y, `${xyUnitLabel}, ${crsLabel}`))
    : null;

  // WDM-U2-016: put the tops back as they were before the last save
  const undoTops = async () => {
    if (!topsUndo || topsUndo.wellId !== well.id) return;
    try {
      const current = await backend.listTops(well.id);
      const plan = planRestore(current, topsUndo.tops);
      for (const t of plan.deletes) await backend.deleteTop(t);
      for (const u of plan.updates) await backend.updateTop(u.id, u.patch);
      for (const t of plan.creates) await backend.saveTop(well.id, recreatePayload(t));
      setTopsUndo(null);
      onStatus(`Tops restored to before the last ${topsUndo.what} (${plan.updates.length} changed back, ${plan.deletes.length} removed, `
        + `${plan.creates.length} re-created${plan.creates.length ? ' with new ids, so Well Correlation sees them as new picks' : ''}).`);
      await refreshChildren();
      if (onWellChanged) await onWellChanged(well);
    } catch (e) {
      onStatus(e.message);
    }
  };
  const upLogs = bottomUpLogs(logs || []);
  const [reorientBusy, setReorientBusy] = useState(false);

  // WDM-U2-010: reverse, in place, the curves an earlier release stored
  // bottom-up (same log ids; the step comes from the reversed depth curve)
  const reorient = async () => {
    setReorientBusy(true);
    try {
      const dataById = new Map();
      for (const l of upLogs) dataById.set(l.id, curveCache.current.get(l.id) || await backend.downloadCurve(l));
      const plan = planReorient(logs, dataById);
      for (const w of plan.writes) await backend.rewriteLogSamples(w.log, w.data, w.patch, { original: dataById.get(w.log.id) });
      for (const w of plan.writes) curveCache.current.delete(w.log.id);
      onStatus(`Reoriented ${plan.writes.length} curve${plan.writes.length === 1 ? '' : 's'}: depth now increases, ${fmtDepth(plan.startMdM, unit, 2)} to ${fmtDepth(plan.stopMdM, unit, 2)} ${u}`
        + `${plan.stepM != null ? `, step ${fmtDepth(plan.stepM, unit, 4)} ${u}` : ', irregular step'}.`);
      await refreshChildren();
      if (onWellChanged) await onWellChanged(well);
    } catch (e) {
      onStatus(e.message);
    } finally {
      setReorientBusy(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="wdm-detail">
      <div className="flex items-center gap-2 px-3 pt-2">
        <h2 className="text-sm font-semibold text-pl-text" data-testid="wdm-detail-name">
          {well.name}
        </h2>
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]
          ${shared ? 'bg-pl-primary/10 text-pl-primary-text' : 'bg-pl-sunken text-pl-muted'}`}
        >
          {shared ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {shared ? (well.is_own ? 'shared with org' : 'org well (read-only)') : 'private'}
        </span>
        <button type="button" data-testid="wdm-export" onClick={() => setExportOpen(true)}
          title="Export this well as LAS, tops CSV, survey CSV or a well data sheet PDF, depths in the display unit"
          className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-pl-border text-xs text-pl-text hover:bg-pl-sunken">
          <Download className="w-3 h-3" /> Export
        </button>
        <OpenInAppMenu wellIds={[well.id]} paths={appPaths} testIdPrefix="wdm-detail" />
      </div>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} backend={backend} well={well} logs={logs} tops={tops} zones={zones || []}
        units={units} unit={unit} onStatus={onStatus} />

      <div className="flex items-center gap-1 px-3 pt-2 border-b border-pl-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`wdm-detail-tab-${t.toLowerCase()}`}
            className={`px-2.5 py-1 text-xs rounded-t border-b-2 -mb-px
              ${tab === t
                ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text'
                : 'border-transparent text-pl-muted hover:text-pl-text'}`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'Logs' && logs ? ` (${logs.length})` : ''}
            {t === 'Tops' && tops ? ` (${tops.length})` : ''}
            {t === 'Intervals' && intervals.length ? ` (${intervals.length})` : ''}
            {t === 'Core' && coreImages.length ? ` (${coreImages.length})` : ''}
            {t === 'Zones' && zones?.length ? ` (${zones.length})` : ''}
          </button>
        ))}
        {canEdit && tab !== 'Logs' && tab !== 'Zones' && tab !== 'Intervals' && tab !== 'Core' && !editor && (
          <button
            type="button"
            className="ml-auto mr-2 flex items-center gap-1 px-2 py-0.5 rounded border border-pl-border text-xs text-pl-text hover:bg-pl-sunken"
            onClick={() => startEdit(tab)}
            data-testid={`wdm-edit-${tab.toLowerCase()}`}
            title="Edit this well's data (owner only)"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        {tab === 'Header' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 max-w-2xl">
            <Field label="UWI">{well.uwi}</Field>
            <Field label={`Surface X (${xyUnitLabel}, ${crsLabel})`}>
              {editor?.tab === 'Header' ? (
                <input className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs w-32"
                  value={editor.fields.x} onChange={(e) => setEditor((ed) => ({ ...ed, fields: { ...ed.fields, x: e.target.value } }))}
                  data-testid="wdm-header-x" inputMode="decimal" />
              ) : fmt(well.surface_x)}
            </Field>
            <Field label={`Surface Y (${xyUnitLabel}, ${crsLabel})`}>
              {editor?.tab === 'Header' ? (
                <input className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs w-32"
                  value={editor.fields.y} onChange={(e) => setEditor((ed) => ({ ...ed, fields: { ...ed.fields, y: e.target.value } }))}
                  data-testid="wdm-header-y" inputMode="decimal" />
              ) : fmt(well.surface_y)}
            </Field>
            <Field label={`KB (${u})`}>
              {editor?.tab === 'Header' ? (
                <span className="flex items-center gap-1">
                  <input className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs w-24"
                    value={editor.fields.kb} onChange={(e) => setEditor((ed) => ({ ...ed, fields: { ...ed.fields, kb: e.target.value } }))}
                    data-testid="wdm-header-kb" />
                  <select className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs" value={editor.fields.unit}
                    onChange={(e) => {
                      // PL3: switching the unit converts the typed values, it never relabels them
                      const next = e.target.value;
                      setEditor((ed) => {
                        const conv = (txt, orig, d) => {
                          const m = parseDisplayed(txt, ed.fields.unit, orig, d);
                          return Number.isFinite(m) ? (Math.abs(m - (orig ?? NaN)) < 1e-12 ? editCell(orig, next, d) : String(Number(toDisp(m, next).toFixed(6)))) : txt;
                        };
                        return { ...ed, fields: { ...ed.fields, unit: next, kb: conv(ed.fields.kb, well.kb_m ?? 0, 3), td: conv(ed.fields.td, well.td_md_m, 2) } };
                      });
                    }} data-testid="wdm-header-unit">
                    <option value="m">m</option>
                    <option value="ft">ft</option>
                  </select>
                </span>
              ) : fmtDepth(well.kb_m, unit)}
            </Field>
            <Field label={`TD (${u} MD)`}>
              {editor?.tab === 'Header' ? (
                <input className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs w-24"
                  value={editor.fields.td} onChange={(e) => setEditor((ed) => ({ ...ed, fields: { ...ed.fields, td: e.target.value } }))}
                  data-testid="wdm-header-td" placeholder="blank = last station" />
              ) : fmtDepth(well.td_md_m, unit)}
            </Field>
            <Field label="CRS">
              <span className="flex items-center gap-2 flex-wrap">
                <CrsBadge tag={crsTag} />
                {crsTag == null && (
                  <button
                    type="button"
                    className="text-pl-primary-text hover:underline"
                    onClick={() => setAssigningCrs((a) => !a)}
                  >
                    Assign CRS…
                  </button>
                )}
              </span>
              {assigningCrs && (
                <div className="mt-1 max-w-xs">
                  <div className="text-pl-muted mb-1">
                    Declares what the stored coordinates already are. Nothing is transformed.
                  </div>
                  <CrsPicker
                    value={null}
                    onChange={async (tag) => {
                      try {
                        const patch = {
                          crs: tag === 'UNKNOWN' ? null : tag,
                          crs_provenance: {
                            assigned_manually: true,
                            declared_crs: tag,
                            date: new Date().toISOString(),
                          },
                        };
                        await backend.updateWell(well.id, patch);
                        setCrsPatch(patch);
                        setAssigningCrs(false);
                        onStatus(`CRS assigned: ${tag}`);
                      } catch (e) {
                        onStatus(e.message);
                      }
                    }}
                  />
                </div>
              )}
            </Field>
            {well.crs_provenance?.datum_transform && (() => {
              // WDM-U2-014: the site's datum-transformation choice, which every
              // coordinate conversion of this well uses
              const info = datumTransformInfo(crsTag, well.crs_provenance.datum_transform);
              return (
                <Field label="Datum transformation">
                  <span data-testid="wdm-header-datum-transform"
                    title="Chosen for the site in Well Design Studio; reprojection and map placement convert through it">
                    {info && !info.overrideIgnored
                      ? `${info.transform.name} (${info.transform.code}, ${info.transform.accuracyM} m)${info.isDefault ? '' : ', site choice'}`
                      : `${well.crs_provenance.datum_transform} (not published for ${crsTag || 'this CRS'}; the catalog default applies)`}
                  </span>
                </Field>
              );
            })()}
            <Field label="Status">
              {/* Mapping T1 (MAP-T1-015): drives the map well symbols */}
              <select className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs"
                data-testid="wdm-header-status" value={statusValue ?? well.status ?? ''} disabled={well.is_own === false}
                title="Well status: maps post the matching well symbol"
                onChange={async (e) => {
                  const next = e.target.value || null;
                  try {
                    await backend.updateWell(well.id, { status: next });
                    setStatusValue(next ?? '');
                    onStatus(next ? `Status set to ${WELL_STATUS_LABELS[next]}.` : 'Status cleared.');
                    onWellChanged?.();
                  } catch (err) {
                    onStatus(/status/.test(err.message) && /column|schema/.test(err.message)
                      ? 'Well status needs the geo_wells status migration, which is waiting to be applied.'
                      : err.message);
                  }
                }}>
                <option value="">not recorded</option>
                {Object.entries(WELL_STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
            <Field label="CRS note">{well.crs_note}</Field>
            <Field label="Units">{well.units_note}</Field>
            <Field label="Deviation stations">{(well.deviation || []).length}</Field>
            <Field label="Checkshot pairs">{(well.checkshots || []).length}</Field>
            {editor?.tab === 'Header' && (
              <div className="col-span-2 md:col-span-3 space-y-1">
                {headerProblem && <div className="text-xs text-pl-warning-text" data-testid="wdm-header-reason">{headerProblem}</div>}
                {editor.error && <div className="text-xs text-pl-danger-text" data-testid="wdm-header-error">{editor.error}</div>}
                <div className="flex gap-2">
                  <button type="button" className={primaryCls} disabled={editor.busy || !!headerProblem} onClick={() => saveEditor()} data-testid="wdm-header-save">Save header</button>
                  <button type="button" className={btnCls} onClick={() => setEditor(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'Logs' && (
          logs === null ? <Loader2 className="w-4 h-4 animate-spin text-pl-muted" /> : (
            <div className="space-y-3">
              {!logs.length && (
                <p className="text-xs text-pl-muted">
                  No logs on this well yet. Use Import LAS to add curves.
                </p>
              )}
              {upLogs.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-pl-warning/60 bg-pl-warning-bg px-2 py-1 text-xs text-pl-warning-text" data-testid="wdm-bottom-up-note">
                  <span>
                    {upLogs.length} curve{upLogs.length === 1 ? ' was' : 's were'} stored bottom-up by an earlier release ({upLogs.map((l) => l.mnemonic).join(', ')}).
                    The quick view shows them with depth increasing; other apps read them by sample until they are reoriented.
                  </span>
                  {well.is_own ? (
                    <button type="button" className={primaryCls} disabled={reorientBusy} onClick={reorient} data-testid="wdm-reorient"
                      title="Reverse these curves in place so depth increases (same log ids; nothing else changes)">
                      {reorientBusy ? 'Reorienting…' : 'Reorient'}
                    </button>
                  ) : <span className="text-pl-muted">Only the owner can reorient them.</span>}
                </div>
              )}
              {logs.length > 0 && (
                <table className="text-xs" data-testid="wdm-logs-table">
                  <thead>
                    <tr>
                      <th className={thCls}>Plot</th>
                      <th className={thCls}>Mnemonic</th>
                      <th className={thCls}>Unit</th>
                      <th className={thCls}>Interval ({u} MD)</th>
                      <th className={thCls}>Step ({u})</th>
                      <th className={thCls}>Samples</th>
                      <th className={thCls}>Nulls</th>
                      <th className={thCls}>Source</th>
                      <th className={thCls} aria-label="actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} data-testid="wdm-log-row" data-mnemonic={log.mnemonic}>
                        <td className={tdCls}>
                          <input
                            type="checkbox"
                            data-testid={`wdm-plot-${log.mnemonic}`}
                            checked={plotted.includes(log.id)}
                            onChange={() => togglePlot(log.id)}
                          />
                        </td>
                        <td className={`${tdCls} text-pl-text`} title={log.description || ''}>
                          {log.mnemonic}
                          {(() => {
                            // WDM-U2-008: a computed or digitized curve says so
                            const o = curveOrigin(log);
                            return o ? (
                              <span className={`ml-1 rounded px-1 text-[10px] ${o.kind === 'computed' && !o.stale ? 'bg-pl-primary/10 text-pl-primary-text' : 'bg-pl-warning-bg text-pl-warning-text'}`}
                                title={o.title} data-testid={`wdm-log-origin-${log.mnemonic}`}>{o.label}</span>
                            ) : null;
                          })()}
                        </td>
                        <td className={tdCls}>{log.unit || EMPTY_VALUE}</td>
                        <td className={tdCls}>{fmtDepth(log.start_md_m, unit)} – {fmtDepth(log.stop_md_m, unit)}</td>
                        <td className={tdCls}>{log.step_m == null ? 'irregular' : fmtDepth(log.step_m, unit, 3)}</td>
                        <td className={tdCls}>{log.n_samples}</td>
                        <td className={tdCls}>{log.null_count}</td>
                        <td className={`${tdCls} text-pl-muted`}>{log.source_file || EMPTY_VALUE}</td>
                        <td className={tdCls}>
                          {well.is_own && confirmDelete !== log.id && (
                            <button
                              type="button"
                              title={`Delete log ${log.mnemonic}`}
                              className="text-pl-muted hover:text-pl-danger-text"
                              onClick={() => setConfirmDelete(log.id)}
                              data-testid={`wdm-log-delete-${log.mnemonic}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {well.is_own && confirmDelete === log.id && (
                            <span className="inline-flex items-center gap-1" data-testid={`wdm-log-confirm-${log.mnemonic}`}>
                              <span className="text-pl-danger-text">Delete {log.mnemonic} and its samples?</span>
                              <button type="button" className="px-1.5 rounded bg-pl-danger text-pl-danger-fg" onClick={() => { setConfirmDelete(null); deleteLog(log); }}
                                data-testid={`wdm-log-delete-yes-${log.mnemonic}`}>Delete</button>
                              <button type="button" className={btnCls} onClick={() => setConfirmDelete(null)}>Keep</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {logs.length > 0 && (
                <div>
                  {curveBusy && (
                    <div className="text-xs text-pl-muted mb-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
                      loading curves…
                    </div>
                  )}
                  <LogTracks tracks={tracks} unit={unit} />
                </div>
              )}
            </div>
          )
        )}

        {tab === 'Tops' && editor?.tab === 'Tops' && (
          <div className="space-y-2 max-w-2xl" data-testid="wdm-tops-editor">
            <div className="flex items-center gap-2 text-xs text-pl-muted">
              <button type="button" className={`${btnCls} ${editor.mode === 'grid' ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'grid', error: null }))}>Edit rows</button>
              <button type="button" className={`${btnCls} ${editor.mode === 'paste' ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'paste', error: null }))} data-testid="wdm-tops-paste-toggle">Replace from paste</button>
              {editor.mode === 'paste' && <span className="text-pl-warning-text">Replacing regenerates every top id; Well Correlation reads them fresh.</span>}
            </div>
            {editor.mode === 'grid' ? (
              <RowGridEditor testIdPrefix="wdm-tops" rows={editor.rows}
                onChange={(rows) => setEditor((ed) => ({ ...ed, rows }))}
                columns={[
                  { key: 'name', label: 'Top', type: 'text', width: 160 }, { key: 'md', label: `MD (${editor.unit})`, type: 'number' },
                  { key: 'surface_type', label: 'Type', type: 'select', width: 150, options: SURFACE_TYPES.map((t) => ({ value: t.code, label: displayLabel(t.code, scheme, { kind: 'surface', short: true }).label + (displayLabel(t.code, scheme, { kind: 'surface' }).fallback ? ' (Catuneanu)' : '') })) },
                  { key: 'unit_id', label: 'Unit', type: 'select', width: 150, placeholder: 'none', options: units.map((u) => ({ value: u.id, label: `${u.name} (${u.rank})` })) },
                  { key: 'confidence', label: 'Confidence', type: 'select', width: 90, placeholder: 'not stated', options: [{ value: 'high', label: 'high' }, { value: 'medium', label: 'medium' }, { value: 'low', label: 'low' }] },
                  { key: 'age_ma', label: 'Age (Ma)', type: 'number', width: 80 },
                  { key: 'interpreter', label: 'Interpreter', type: 'text' },
                ]} />
            ) : (
              <PasteReplacePanel kind="tops" fields={TOPS_PASTE_FIELDS} labels={{ name: 'Top name', md: `MD (${editor.conv.mdUnit})` }}
                convention={editor.conv} onConvention={(c) => setEditor((ed) => ({ ...ed, conv: c }))}
                onParsed={(pasted) => setEditor((ed) => ({ ...ed, pasted }))} testIdPrefix="wdm-tops" />
            )}
            {editor.error && <div className="text-xs text-pl-danger-text" data-testid="wdm-tops-error">{editor.error}</div>}
            <div className="flex gap-2">
              <button type="button" className={primaryCls} disabled={editor.busy} onClick={() => saveEditor()} data-testid="wdm-tops-save">Save tops</button>
              <button type="button" className={btnCls} onClick={() => setEditor(null)}>Cancel</button>
            </div>
          </div>
        )}
        {tab === 'Tops' && editor?.tab !== 'Tops' && (
          tops === null ? <Loader2 className="w-4 h-4 animate-spin text-pl-muted" /> : (
            tops.length ? (
              <div className="space-y-1">
              <table className="text-xs" data-testid="wdm-tops-table">
                <thead>
                  <tr>
                    <th className={thCls}>Top</th>
                    <th className={thCls}>MD ({u})</th>
                    <th className={thCls} title="True vertical depth below KB, through the deviation survey">TVD ({u})</th>
                    <th className={thCls} title="True vertical depth below datum (TVD minus KB)">TVDSS ({u})</th>
                    <th className={thCls}>Type</th>
                    <th className={thCls}>Unit</th>
                    <th className={thCls}>Confidence</th>
                    <th className={thCls}>Age (Ma)</th>
                    <th className={thCls}>Interpreter</th>
                    <th className={thCls}>Map</th>
                  </tr>
                </thead>
                <tbody>
                  {tops.map((t) => (
                    <tr key={t.id} data-testid="wdm-top-row">
                      <td className={`${tdCls} text-pl-text`}>{t.name}</td>
                      <td className={tdCls} data-testid={`wdm-top-md-${t.name}`}>{fmtDepth(t.md_m, unit)}</td>
                      <td className={tdCls} data-testid={`wdm-top-tvd-${t.name}`}>{fmtDepth(topDepths.get(t.id)?.tvd, unit)}{topDepths.get(t.id)?.extrapolated ? ' †' : ''}</td>
                      <td className={tdCls} data-testid={`wdm-top-tvdss-${t.name}`}>{fmtDepth(topDepths.get(t.id)?.tvdss, unit)}{topDepths.get(t.id)?.extrapolated ? ' †' : ''}</td>
                      <td className={tdCls} data-testid={`wdm-top-type-${t.name}`} title={displayLabel(normalizeSurfaceType(t.surface_type), scheme, { kind: 'surface' }).label}>
                        {displayLabel(normalizeSurfaceType(t.surface_type), scheme, { kind: 'surface', short: true }).label}
                        {displayLabel(normalizeSurfaceType(t.surface_type), scheme, { kind: 'surface' }).fallback ? <span className="ml-1 text-[10px] text-pl-warning-text" title="No Exxon term; Catuneanu name shown">C</span> : null}
                      </td>
                      <td className={tdCls}>{units.find((u) => u.id === t.unit_id)?.name || EMPTY_VALUE}</td>
                      <td className={tdCls}>{t.confidence || EMPTY_VALUE}</td>
                      <td className={tdCls}>{t.age_ma == null ? EMPTY_VALUE : t.age_ma}</td>
                      <td className={tdCls}>{t.interpreter || EMPTY_VALUE}</td>
                      <td className={tdCls}>
                        <Link to={mapTopHref(t.name, [], appPath(MAPPING_ID, appPaths))} className="text-pl-primary-text hover:text-pl-primary-text-hover"
                          title="Map this top in Mapping & Surface Studio (TVDSS structure map across every well carrying it)" data-testid={`wdm-map-top-${t.name}`}>
                          Map this top
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {topsUndo?.wellId === well.id && well.is_own && (
                <button type="button" className={btnCls} onClick={undoTops} data-testid="wdm-tops-undo"
                  title="Put every top back as it was before the last save on this well">
                  Undo last tops save ({topsUndo.what})
                </button>
              )}
              {!(Number(well.kb_m) > 0) && (
                <p className="text-[11px] text-pl-warning-text" data-testid="wdm-tops-kb-note">
                  KB is not set on this well (0 m), so TVDSS equals TVD. Set the KB on the Header tab.
                </p>
              )}
              {[...topDepths.values()].some((p) => p?.extrapolated) && (
                <p className="text-[11px] text-pl-muted">† below the last survey station (extrapolated along the final tangent)</p>
              )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-pl-muted">No tops on this well.</p>
                {topsUndo?.wellId === well.id && well.is_own && (
                  <button type="button" className={btnCls} onClick={undoTops} data-testid="wdm-tops-undo">
                    Undo last tops save ({topsUndo.what})
                  </button>
                )}
              </div>
            )
          )
        )}

        {tab === 'Zones' && (
          <ZonesPanel zones={zones} well={well} tops={tops || []} unit={unit} appPaths={appPaths} />
        )}

        {tab === 'Intervals' && (
          <div className="max-w-5xl" data-testid="wdm-intervals-tab">
            <IntervalsEditor well={well} intervals={intervals} canEdit={!!well.is_own} testIdPrefix="wdm-intervals" onStatus={onStatus}
              onReplace={async (kind, rows) => { await backend.replaceIntervals(well.id, kind, rows); setIntervals(await backend.listIntervals(well.id)); }} />
          </div>
        )}

        {tab === 'Core' && (
          <div className="max-w-5xl" data-testid="wdm-core-tab">
            <CoreImagesPanel well={well} images={coreImages} canEdit={!!well.is_own} testIdPrefix="wdm-core" onStatus={onStatus}
              urlOf={(img) => backend.coreImageUrl(img)}
              onUpload={async (file, meta) => { await backend.uploadCoreImage(well.id, file, meta); setCoreImages(await backend.listCoreImages(well.id)); }}
              onUpdate={async (img, patch) => { await backend.updateCoreImage(img.id, patch); setCoreImages(await backend.listCoreImages(well.id)); }}
              onDelete={async (img) => { await backend.deleteCoreImage(img); setCoreImages(await backend.listCoreImages(well.id)); }} />
          </div>
        )}

        {tab === 'Deviation' && editor?.tab === 'Deviation' && (
          <div className="space-y-2 max-w-2xl" data-testid="wdm-deviation-editor">
            <div className="flex items-center gap-2 text-xs text-pl-muted">
              <button type="button" className={`${btnCls} ${editor.mode === 'grid' ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'grid', error: null }))}>Edit stations</button>
              <button type="button" className={`${btnCls} ${editor.mode === 'paste' ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'paste', error: null }))} data-testid="wdm-deviation-paste-toggle">Replace from paste</button>
              <span>Azimuths are stored against grid north; paste grid azimuths here or import through Add well for a true or magnetic reference.</span>
            </div>
            {editor.mode === 'grid' ? (
              <RowGridEditor testIdPrefix="wdm-deviation" rows={editor.rows}
                onChange={(rows) => setEditor((ed) => ({ ...ed, rows }))}
                columns={[{ key: 'md', label: `MD (${editor.unit})`, type: 'number' }, { key: 'inc', label: 'Inc (°)', type: 'number' }, { key: 'azi', label: 'Azi (°)', type: 'number' }]} />
            ) : (
              <PasteReplacePanel kind="deviation" fields={DEVIATION_PASTE_FIELDS} labels={{ md: `MD (${editor.conv.mdUnit})`, inc: 'Inclination (°)', azi: 'Azimuth (°)' }}
                convention={editor.conv} onConvention={(c) => setEditor((ed) => ({ ...ed, conv: c }))}
                onParsed={(pasted) => setEditor((ed) => ({ ...ed, pasted }))} testIdPrefix="wdm-deviation" />
            )}
            {(well.checkshots || []).length > 0 && (
              <div className="text-[11px] text-pl-muted">
                {well.checkshots_provenance?.units_in?.depth_ref === 'md'
                  ? 'The checkshot table was entered as MD; saving re-derives its TVDSS through the new survey.'
                  : 'The checkshot table keeps its TVDSS; only its MD readout follows the new survey.'}
              </div>
            )}
            {editor.error && <div className="text-xs text-pl-danger-text" data-testid="wdm-deviation-error">{editor.error}</div>}
            <div className="flex gap-2">
              <button type="button" className={primaryCls} disabled={editor.busy} onClick={() => saveEditor()} data-testid="wdm-deviation-save">Save survey</button>
              <button type="button" className={btnCls} onClick={() => setEditor(null)}>Cancel</button>
            </div>
          </div>
        )}
        {tab === 'Deviation' && editor?.tab !== 'Deviation' && (
          (well.deviation || []).length ? (
            <table className="text-xs">
              <thead>
                <tr>
                  <th className={thCls}>MD ({u})</th>
                  <th className={thCls}>Inc (°)</th>
                  <th className={thCls}>Azi (°)</th>
                </tr>
              </thead>
              <tbody>
                {well.deviation.map((s) => (
                  <tr key={s.md}>
                    <td className={tdCls}>{fmtDepth(s.md, unit)}</td>
                    <td className={tdCls}>{fmt(s.inc)}</td>
                    <td className={tdCls}>{fmt(s.azi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-pl-muted">
              No deviation survey, so this well is treated as vertical
              {well.td_md_m ? ` to TD ${fmtDepth(well.td_md_m, unit)} ${u}` : ''}.
            </p>
          )
        )}

        {tab === 'Checkshots' && editor?.tab === 'Checkshots' && (
          <div className="space-y-2 max-w-3xl" data-testid="wdm-checkshots-editor">
            <div className="flex items-center gap-2 text-xs text-pl-muted">
              <button type="button" className={`${btnCls} ${editor.mode === 'grid' ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'grid', error: null }))}>Edit rows</button>
              <button type="button" className={`${btnCls} ${editor.mode === 'paste' ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'paste', error: null }))} data-testid="wdm-checkshots-paste-toggle">Replace from paste</button>
            </div>
            {editor.mode === 'grid' ? (
              <>
                <CheckshotConventionRow conv={editor.conv} onChange={(c) => setEditor((ed) => ({ ...ed, conv: c, rows: regridRows(ed.rows, ed.conv, c) }))} testIdPrefix="wdm-checkshots" />
                <RowGridEditor testIdPrefix="wdm-checkshots" rows={editor.rows}
                  onChange={(rows) => setEditor((ed) => ({ ...ed, rows }))}
                  columns={[
                    { key: 'depth', label: `${REF_LABEL[editor.conv.depthRef]} (${editor.conv.depthUnit})`, type: 'number' },
                    { key: 'time', label: `${editor.conv.time === 'owt' ? 'OWT' : 'TWT'} (ms)`, type: 'number' },
                  ]} />
              </>
            ) : (
              <PasteReplacePanel kind="checkshots" fields={CHECKSHOT_PASTE_FIELDS}
                labels={{ depth: `Depth (${REF_LABEL[editor.conv.depthRef]}, ${editor.conv.depthUnit})`, time: `Time (${editor.conv.time === 'owt' ? 'OWT' : 'TWT'}, ms)` }}
                convention={editor.conv} onConvention={(c) => setEditor((ed) => ({ ...ed, conv: c }))}
                onParsed={(pasted) => setEditor((ed) => ({ ...ed, pasted }))} testIdPrefix="wdm-checkshots" />
            )}
            <div className="text-[11px] text-pl-muted">{frameNote}</div>
            {editor.error && <div className="text-xs text-pl-danger-text" data-testid="wdm-checkshots-error">{editor.error}</div>}
            <div className="flex gap-2">
              <button type="button" className={primaryCls} disabled={editor.busy} onClick={() => saveEditor()} data-testid="wdm-checkshots-save">Save checkshots</button>
              <button type="button" className={btnCls} onClick={() => setEditor(null)}>Cancel</button>
            </div>
          </div>
        )}
        {tab === 'Checkshots' && editor?.tab !== 'Checkshots' && (
          (well.checkshots || []).length ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-pl-muted">
                <span>
                  Entered as {REF_LABEL[entered.depthRef]} {entered.depthUnit} / {entered.time === 'owt' ? 'one-way' : 'two-way'} time
                  {well.checkshots_provenance ? '' : ' (no record: legacy table, assumed TVDSS / TWT)'}.
                </span>
                <span className="ml-auto">View as</span>
                <select className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs" value={csDisplay.depthRef}
                  onChange={(e) => setCsView({ ...csDisplay, depthRef: e.target.value })} data-testid="wdm-cs-view-depthref">
                  <option value="md">MD</option><option value="tvd">TVD</option><option value="tvdss">TVDSS</option>
                </select>
                <select className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs" value={csDisplay.depthUnit}
                  onChange={(e) => setCsView({ ...csDisplay, depthUnit: e.target.value })} data-testid="wdm-cs-view-unit">
                  <option value="m">m</option><option value="ft">ft</option>
                </select>
                <select className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs" value={csDisplay.time}
                  onChange={(e) => setCsView({ ...csDisplay, time: e.target.value })} data-testid="wdm-cs-view-time">
                  <option value="owt">OWT</option><option value="twt">TWT</option>
                </select>
              </div>
              {well.checkshots_derived?.rows?.length >= 2 && (
                <div className="text-[11px] text-pl-warning-text" data-testid="wdm-cs-derived-note">
                  Seismolord currently uses a tie-derived time-depth set for this well; edits here apply once that set is cleared in Seismolord.
                </div>
              )}
              <table className="text-xs" data-testid="wdm-cs-table">
                <thead>
                  <tr>
                    <th className={thCls}>{REF_LABEL[csDisplay.depthRef]} ({csDisplay.depthUnit})</th>
                    <th className={thCls}>{csDisplay.time === 'owt' ? 'OWT' : 'TWT'} (ms)</th>
                    <th className={`${thCls} text-pl-muted`}>stored TVDSS (m)</th>
                    <th className={`${thCls} text-pl-muted`}>stored TWT (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {csRows.map((c, i) => (
                     
                    <tr key={i} data-testid="wdm-cs-row">
                      <td className={tdCls}>{fmt(c.depth, 2)}{c.ambiguous ? ' *' : ''}{c.extrapolated ? ' †' : ''}</td>
                      <td className={tdCls}>{fmt(c.time, 1)}</td>
                      <td className={`${tdCls} text-pl-muted`}>{fmt(c.tvdss_m, 2)}</td>
                      <td className={`${tdCls} text-pl-muted`}>{fmt(c.twt_ms, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csRows.some((c) => c.ambiguous || c.extrapolated) && (
                <div className="text-[11px] text-pl-muted">* reached at more than one MD along this well (shallowest shown) · † beyond the last survey station (extrapolated)</div>
              )}
            </div>
          ) : <p className="text-xs text-pl-muted">No checkshots on this well.</p>
        )}
      </div>
    </div>
  );
}
