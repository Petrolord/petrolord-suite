// Well detail: header / logs (table + quick-view tracks) / tops /
// deviation / checkshots tabs for the selected well. Owns its own
// child-data fetching (tops + log metadata reload on well change;
// curve samples download on demand and cache per log id). Owner-only
// actions hide on org-shared read-only wells, mirroring what RLS would
// reject server-side.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2, Building2, Lock, Pencil } from 'lucide-react';
import LogTracks from './LogTracks';
import CrsBadge from '@/components/crs/CrsBadge';
import CrsPicker from '@/components/crs/CrsPicker';
import RowGridEditor from '@/components/wells/RowGridEditor';
import PasteReplacePanel, { CheckshotConventionRow } from '@/components/wells/PasteReplacePanel';
import { buildDeviation, buildTops, buildCheckshotInputs } from '@/lib/wellImport';
import {
  makeDepthFrame, toStoredCheckshots, fromStoredCheckshots, rebaseStoredCheckshots,
  makeCheckshotProvenance, LEGACY_CHECKSHOT_PROVENANCE, PETREL_CHECKSHOT_CONVENTION, M_PER_FT,
} from '../engine/checkshots';

const TABS = ['Header', 'Logs', 'Tops', 'Deviation', 'Checkshots'];

const thCls = 'text-left font-medium text-slate-500 pr-4 pb-1';
const tdCls = 'pr-4 py-0.5 text-slate-300 whitespace-nowrap';

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm text-slate-200">{children ?? '—'}</div>
    </div>
  );
}

const fmt = (v, digits = 1) => (Number.isFinite(v) ? Number(v).toFixed(digits) : '—');

const REF_LABEL = { md: 'MD', tvd: 'TVD', tvdss: 'TVDSS' };
const btnCls = 'px-2 py-0.5 rounded border text-xs border-slate-700 text-slate-300 hover:bg-slate-800';
const primaryCls = 'px-2 py-0.5 rounded text-xs bg-cyan-600 hover:bg-cyan-500 text-white';
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
 *  @param {string} [p.initialTab] tab to open with (deep link) */
export default function WellDetail({ backend, well, onStatus, refreshNonce = 0, onWellChanged, initialTab = null }) {
  const [tab, setTab] = useState(() => TABS.find((t) => t.toLowerCase() === String(initialTab || '').toLowerCase()) || 'Header');
  // PT1 edit modes: one tab edits at a time; `editor` holds the draft
  const [editor, setEditor] = useState(null); // {tab, rows|fields, conv, mode:'grid'|'paste', pasted, error, busy}
  const [csView, setCsView] = useState(null); // display convention for the checkshot tab (null = as entered)
  const canEdit = !!well.is_own && typeof backend.updateWellData === 'function';
  const [tops, setTops] = useState(null);       // null = loading
  const [logs, setLogs] = useState(null);
  // Legacy wells carry no structured CRS; Assign CRS patches the row
  // in place (declares what the stored coordinates already are — it
  // never transforms them). crsPatch mirrors the update locally.
  const [assigningCrs, setAssigningCrs] = useState(false);
  const [crsPatch, setCrsPatch] = useState(null);
  const [plotted, setPlotted] = useState([]);   // log ids ticked for the tracks
  const [tracks, setTracks] = useState([]);     // [{log, data}] resolved curves
  const [curveBusy, setCurveBusy] = useState(false);
  const curveCache = useRef(new Map());         // log id -> Float32Array

  const refreshChildren = useCallback(async () => {
    setTops(null);
    setLogs(null);
    try {
      const [t, l] = await Promise.all([backend.listTops(well.id), backend.listLogs(well.id)]);
      setTops(t);
      setLogs(l);
    } catch (e) {
      onStatus(e.message);
      setTops([]);
      setLogs([]);
    }
  }, [backend, well.id, onStatus]);

  useEffect(() => {
    setPlotted([]);
    setTracks([]);
    curveCache.current = new Map();
    refreshChildren();
  }, [refreshChildren, refreshNonce]);

  // PT1: leave any edit mode when the well changes
  useEffect(() => { setEditor(null); setCsView(null); }, [well.id]);

  const entered = useMemo(() => conventionOf(well), [well]);
  const csDisplay = csView || entered;
  const frame = useMemo(() => makeDepthFrame({ deviation: well.deviation, kbM: well.kb_m ?? 0, tdMdM: well.td_md_m }), [well.deviation, well.kb_m, well.td_md_m]);
  const csRows = useMemo(() => {
    try { return fromStoredCheckshots(well.checkshots || [], csDisplay, frame); } catch (e) { return []; }
  }, [well.checkshots, csDisplay, frame]);
  const frameNote = frame.isVertical
    ? 'No deviation survey: the well is treated as vertical (MD = TVD, TVDSS = MD - KB).'
    : `Converting through the ${frame.stations.length}-station survey and KB ${fmt(well.kb_m)} m${frame.assumedVerticalToFirstStation ? ' (vertical above the first station)' : ''}.`;

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
      setEditor({ tab: 'Header', fields: { kb: numCell(well.kb_m ?? 0, 3), td: well.td_md_m == null ? '' : numCell(well.td_md_m, 2), unit: 'm' }, error: null, busy: false });
    } else if (which === 'Tops') {
      setEditor({ tab: 'Tops', mode: 'grid', conv: { mdUnit: 'm' }, pasted: null, error: null, busy: false,
        rows: (tops || []).map((t) => ({ id: t.id, name: t.name, md: numCell(t.md_m, 2), interpreter: t.interpreter || '' })) });
    } else if (which === 'Deviation') {
      setEditor({ tab: 'Deviation', mode: 'grid', conv: { mdUnit: 'm' }, pasted: null, error: null, busy: false,
        rows: (well.deviation || []).map((d) => ({ md: numCell(d.md, 2), inc: numCell(d.inc, 2), azi: numCell(d.azi, 2) })) });
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
        const kbRaw = Number(f.kb);
        if (!Number.isFinite(kbRaw)) throw new Error(`KB must be a number (${f.unit} above datum).`);
        const kbM = f.unit === 'ft' ? kbRaw * M_PER_FT : kbRaw;
        let tdMdM = f.td.trim() === '' ? null : Number(f.td);
        if (tdMdM !== null && !(tdMdM > 0)) throw new Error(`TD must be a positive number (${f.unit} MD).`);
        if (tdMdM !== null && f.unit === 'ft') tdMdM *= M_PER_FT;
        const patch = { kbM, tdMdM };
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
            .map((r) => ({ md: Number(r.md), inc: Number(r.inc), azi: Number(r.azi) }));
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
          inputs = buildCheckshotInputs(editor.pasted.parsed.rows, editor.pasted.map);
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
          if (res.warnings.length) onStatus(res.warnings[0]);
        }
        const row = await backend.updateWellData(well.id, { checkshots: rows, checkshotsProvenance: prov });
        await finish(row, rows.length ? `Checkshots saved (${rows.length} rows, entered as ${REF_LABEL[editor.conv.depthRef]} ${editor.conv.depthUnit} / ${editor.conv.time.toUpperCase()}).` : 'Checkshots cleared.');
        return;
      }
      if (editor.tab === 'Tops') {
        if (editor.mode === 'paste') {
          if (!editor.pasted) throw new Error('Paste tops first.');
          const list = buildTops(editor.pasted.parsed.rows, editor.pasted.map, { mdUnit: editor.conv.mdUnit });
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
          if (!Number.isFinite(Number(r.md))) throw new Error(`Row ${i + 1}: MD "${r.md}" is not a number.`);
        }
        const before = tops || [];
        const keptIds = new Set(wanted.filter((r) => r.id).map((r) => r.id));
        for (const t of before) if (!keptIds.has(t.id)) await backend.deleteTop(t);
        let changed = 0;
        for (const r of wanted) {
          const md = Number(r.md);
          const interpreter = String(r.interpreter || '').trim() || null;
          if (r.id) {
            const orig = before.find((t) => t.id === r.id);
            if (orig && (orig.name !== r.name.trim() || Math.abs(orig.md_m - md) > 1e-9 || (orig.interpreter || null) !== interpreter)) {
              await backend.updateTop(r.id, { name: r.name.trim(), mdM: md, interpreter });
              changed++;
            }
          } else {
            await backend.saveTop(well.id, { name: r.name.trim(), mdM: md, interpreter });
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
        for (const log of wanted) {
          let data = curveCache.current.get(log.id);
          if (!data) {
            data = await backend.downloadCurve(log);
            curveCache.current.set(log.id, data);
          }
          resolved.push({ log, data });
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

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="wdm-detail">
      <div className="flex items-center gap-2 px-3 pt-2">
        <h2 className="text-sm font-semibold text-slate-100" data-testid="wdm-detail-name">
          {well.name}
        </h2>
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]
          ${shared ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}
        >
          {shared ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {shared ? (well.is_own ? 'shared with org' : 'org well (read-only)') : 'private'}
        </span>
      </div>

      <div className="flex items-center gap-1 px-3 pt-2 border-b border-slate-800/60">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`wdm-detail-tab-${t.toLowerCase()}`}
            className={`px-2.5 py-1 text-xs rounded-t border-b-2 -mb-px
              ${tab === t
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'Logs' && logs ? ` (${logs.length})` : ''}
            {t === 'Tops' && tops ? ` (${tops.length})` : ''}
          </button>
        ))}
        {canEdit && tab !== 'Logs' && !editor && (
          <button
            type="button"
            className="ml-auto mr-2 flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
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
            <Field label="Surface X (m)">{fmt(well.surface_x)}</Field>
            <Field label="Surface Y (m)">{fmt(well.surface_y)}</Field>
            <Field label="KB (m)">
              {editor?.tab === 'Header' ? (
                <span className="flex items-center gap-1">
                  <input className="rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs w-24"
                    value={editor.fields.kb} onChange={(e) => setEditor((ed) => ({ ...ed, fields: { ...ed.fields, kb: e.target.value } }))}
                    data-testid="wdm-header-kb" />
                  <select className="rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-xs" value={editor.fields.unit}
                    onChange={(e) => setEditor((ed) => ({ ...ed, fields: { ...ed.fields, unit: e.target.value } }))} data-testid="wdm-header-unit">
                    <option value="m">m</option>
                    <option value="ft">ft</option>
                  </select>
                </span>
              ) : fmt(well.kb_m)}
            </Field>
            <Field label="TD (m MD)">
              {editor?.tab === 'Header' ? (
                <input className="rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs w-24"
                  value={editor.fields.td} onChange={(e) => setEditor((ed) => ({ ...ed, fields: { ...ed.fields, td: e.target.value } }))}
                  data-testid="wdm-header-td" placeholder="blank = last station" />
              ) : fmt(well.td_md_m)}
            </Field>
            <Field label="CRS">
              <span className="flex items-center gap-2 flex-wrap">
                <CrsBadge tag={crsPatch?.crs ?? well.crs} />
                {(crsPatch?.crs ?? well.crs) == null && (
                  <button
                    type="button"
                    className="text-cyan-400 hover:underline"
                    onClick={() => setAssigningCrs((a) => !a)}
                  >
                    Assign CRS…
                  </button>
                )}
              </span>
              {assigningCrs && (
                <div className="mt-1 max-w-xs">
                  <div className="text-slate-500 mb-1">
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
            <Field label="CRS note">{well.crs_note}</Field>
            <Field label="Units">{well.units_note}</Field>
            <Field label="Deviation stations">{(well.deviation || []).length}</Field>
            <Field label="Checkshot pairs">{(well.checkshots || []).length}</Field>
            {editor?.tab === 'Header' && (
              <div className="col-span-2 md:col-span-3 space-y-1">
                {editor.error && <div className="text-xs text-red-400" data-testid="wdm-header-error">{editor.error}</div>}
                <div className="flex gap-2">
                  <button type="button" className={primaryCls} disabled={editor.busy} onClick={() => saveEditor()} data-testid="wdm-header-save">Save header</button>
                  <button type="button" className={btnCls} onClick={() => setEditor(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'Logs' && (
          logs === null ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : (
            <div className="space-y-3">
              {!logs.length && (
                <p className="text-xs text-slate-500">
                  No logs on this well yet — use Import LAS to add curves.
                </p>
              )}
              {logs.length > 0 && (
                <table className="text-xs" data-testid="wdm-logs-table">
                  <thead>
                    <tr>
                      <th className={thCls}>Plot</th>
                      <th className={thCls}>Mnemonic</th>
                      <th className={thCls}>Unit</th>
                      <th className={thCls}>Interval (m MD)</th>
                      <th className={thCls}>Step</th>
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
                        <td className={`${tdCls} text-slate-100`} title={log.description || ''}>
                          {log.mnemonic}
                        </td>
                        <td className={tdCls}>{log.unit || '—'}</td>
                        <td className={tdCls}>{fmt(log.start_md_m)} – {fmt(log.stop_md_m)}</td>
                        <td className={tdCls}>{log.step_m == null ? 'irregular' : fmt(log.step_m, 3)}</td>
                        <td className={tdCls}>{log.n_samples}</td>
                        <td className={tdCls}>{log.null_count}</td>
                        <td className={`${tdCls} text-slate-500`}>{log.source_file || '—'}</td>
                        <td className={tdCls}>
                          {well.is_own && (
                            <button
                              type="button"
                              title={`Delete log ${log.mnemonic}`}
                              className="text-slate-500 hover:text-red-400"
                              onClick={() => deleteLog(log)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
                    <div className="text-xs text-slate-500 mb-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
                      loading curves…
                    </div>
                  )}
                  <LogTracks tracks={tracks} />
                </div>
              )}
            </div>
          )
        )}

        {tab === 'Tops' && editor?.tab === 'Tops' && (
          <div className="space-y-2 max-w-2xl" data-testid="wdm-tops-editor">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <button type="button" className={`${btnCls} ${editor.mode === 'grid' ? 'border-cyan-500/60 text-cyan-300' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'grid', error: null }))}>Edit rows</button>
              <button type="button" className={`${btnCls} ${editor.mode === 'paste' ? 'border-cyan-500/60 text-cyan-300' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'paste', error: null }))} data-testid="wdm-tops-paste-toggle">Replace from paste</button>
              {editor.mode === 'paste' && <span className="text-amber-300/90">Replacing regenerates every top id; Well Correlation reads them fresh.</span>}
            </div>
            {editor.mode === 'grid' ? (
              <RowGridEditor testIdPrefix="wdm-tops" rows={editor.rows}
                onChange={(rows) => setEditor((ed) => ({ ...ed, rows }))}
                columns={[{ key: 'name', label: 'Top', type: 'text', width: 160 }, { key: 'md', label: 'MD (m)', type: 'number' }, { key: 'interpreter', label: 'Interpreter', type: 'text' }]} />
            ) : (
              <PasteReplacePanel kind="tops" fields={['name', 'md']} labels={{ name: 'Top name', md: `MD (${editor.conv.mdUnit})` }}
                convention={editor.conv} onConvention={(c) => setEditor((ed) => ({ ...ed, conv: c }))}
                onParsed={(pasted) => setEditor((ed) => ({ ...ed, pasted }))} testIdPrefix="wdm-tops" />
            )}
            {editor.error && <div className="text-xs text-red-400" data-testid="wdm-tops-error">{editor.error}</div>}
            <div className="flex gap-2">
              <button type="button" className={primaryCls} disabled={editor.busy} onClick={() => saveEditor()} data-testid="wdm-tops-save">Save tops</button>
              <button type="button" className={btnCls} onClick={() => setEditor(null)}>Cancel</button>
            </div>
          </div>
        )}
        {tab === 'Tops' && editor?.tab !== 'Tops' && (
          tops === null ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : (
            tops.length ? (
              <table className="text-xs" data-testid="wdm-tops-table">
                <thead>
                  <tr>
                    <th className={thCls}>Top</th>
                    <th className={thCls}>MD (m)</th>
                    <th className={thCls}>Interpreter</th>
                  </tr>
                </thead>
                <tbody>
                  {tops.map((t) => (
                    <tr key={t.id} data-testid="wdm-top-row">
                      <td className={`${tdCls} text-slate-100`}>{t.name}</td>
                      <td className={tdCls}>{fmt(t.md_m)}</td>
                      <td className={tdCls}>{t.interpreter || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-xs text-slate-500">No tops on this well.</p>
          )
        )}

        {tab === 'Deviation' && editor?.tab === 'Deviation' && (
          <div className="space-y-2 max-w-2xl" data-testid="wdm-deviation-editor">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <button type="button" className={`${btnCls} ${editor.mode === 'grid' ? 'border-cyan-500/60 text-cyan-300' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'grid', error: null }))}>Edit stations</button>
              <button type="button" className={`${btnCls} ${editor.mode === 'paste' ? 'border-cyan-500/60 text-cyan-300' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'paste', error: null }))} data-testid="wdm-deviation-paste-toggle">Replace from paste</button>
              <span>Azimuths are stored against grid north; paste grid azimuths here or import through Add well for a true or magnetic reference.</span>
            </div>
            {editor.mode === 'grid' ? (
              <RowGridEditor testIdPrefix="wdm-deviation" rows={editor.rows}
                onChange={(rows) => setEditor((ed) => ({ ...ed, rows }))}
                columns={[{ key: 'md', label: 'MD (m)', type: 'number' }, { key: 'inc', label: 'Inc (°)', type: 'number' }, { key: 'azi', label: 'Azi (°)', type: 'number' }]} />
            ) : (
              <PasteReplacePanel kind="deviation" fields={['md', 'inc', 'azi']} labels={{ md: `MD (${editor.conv.mdUnit})`, inc: 'Inclination (°)', azi: 'Azimuth (°)' }}
                convention={editor.conv} onConvention={(c) => setEditor((ed) => ({ ...ed, conv: c }))}
                onParsed={(pasted) => setEditor((ed) => ({ ...ed, pasted }))} testIdPrefix="wdm-deviation" />
            )}
            {(well.checkshots || []).length > 0 && (
              <div className="text-[11px] text-slate-500">
                {well.checkshots_provenance?.units_in?.depth_ref === 'md'
                  ? 'The checkshot table was entered as MD; saving re-derives its TVDSS through the new survey.'
                  : 'The checkshot table keeps its TVDSS; only its MD readout follows the new survey.'}
              </div>
            )}
            {editor.error && <div className="text-xs text-red-400" data-testid="wdm-deviation-error">{editor.error}</div>}
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
                  <th className={thCls}>MD (m)</th>
                  <th className={thCls}>Inc (°)</th>
                  <th className={thCls}>Azi (°)</th>
                </tr>
              </thead>
              <tbody>
                {well.deviation.map((s) => (
                  <tr key={s.md}>
                    <td className={tdCls}>{fmt(s.md)}</td>
                    <td className={tdCls}>{fmt(s.inc)}</td>
                    <td className={tdCls}>{fmt(s.azi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500">
              No deviation survey — this well is treated as vertical
              {well.td_md_m ? ` to TD ${fmt(well.td_md_m)} m` : ''}.
            </p>
          )
        )}

        {tab === 'Checkshots' && editor?.tab === 'Checkshots' && (
          <div className="space-y-2 max-w-3xl" data-testid="wdm-checkshots-editor">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <button type="button" className={`${btnCls} ${editor.mode === 'grid' ? 'border-cyan-500/60 text-cyan-300' : ''}`}
                onClick={() => setEditor((ed) => ({ ...ed, mode: 'grid', error: null }))}>Edit rows</button>
              <button type="button" className={`${btnCls} ${editor.mode === 'paste' ? 'border-cyan-500/60 text-cyan-300' : ''}`}
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
              <PasteReplacePanel kind="checkshots" fields={['depth', 'time']}
                labels={{ depth: `Depth (${REF_LABEL[editor.conv.depthRef]}, ${editor.conv.depthUnit})`, time: `Time (${editor.conv.time === 'owt' ? 'OWT' : 'TWT'}, ms)` }}
                convention={editor.conv} onConvention={(c) => setEditor((ed) => ({ ...ed, conv: c }))}
                onParsed={(pasted) => setEditor((ed) => ({ ...ed, pasted }))} testIdPrefix="wdm-checkshots" />
            )}
            <div className="text-[11px] text-slate-500">{frameNote}</div>
            {editor.error && <div className="text-xs text-red-400" data-testid="wdm-checkshots-error">{editor.error}</div>}
            <div className="flex gap-2">
              <button type="button" className={primaryCls} disabled={editor.busy} onClick={() => saveEditor()} data-testid="wdm-checkshots-save">Save checkshots</button>
              <button type="button" className={btnCls} onClick={() => setEditor(null)}>Cancel</button>
            </div>
          </div>
        )}
        {tab === 'Checkshots' && editor?.tab !== 'Checkshots' && (
          (well.checkshots || []).length ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>
                  Entered as {REF_LABEL[entered.depthRef]} {entered.depthUnit} / {entered.time === 'owt' ? 'one-way' : 'two-way'} time
                  {well.checkshots_provenance ? '' : ' (no record: legacy table, assumed TVDSS / TWT)'}.
                </span>
                <span className="ml-auto">View as</span>
                <select className="rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-xs" value={csDisplay.depthRef}
                  onChange={(e) => setCsView({ ...csDisplay, depthRef: e.target.value })} data-testid="wdm-cs-view-depthref">
                  <option value="md">MD</option><option value="tvd">TVD</option><option value="tvdss">TVDSS</option>
                </select>
                <select className="rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-xs" value={csDisplay.depthUnit}
                  onChange={(e) => setCsView({ ...csDisplay, depthUnit: e.target.value })} data-testid="wdm-cs-view-unit">
                  <option value="m">m</option><option value="ft">ft</option>
                </select>
                <select className="rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-xs" value={csDisplay.time}
                  onChange={(e) => setCsView({ ...csDisplay, time: e.target.value })} data-testid="wdm-cs-view-time">
                  <option value="owt">OWT</option><option value="twt">TWT</option>
                </select>
              </div>
              {well.checkshots_derived?.rows?.length >= 2 && (
                <div className="text-[11px] text-amber-300/90" data-testid="wdm-cs-derived-note">
                  Seismolord currently uses a tie-derived time-depth set for this well; edits here apply once that set is cleared in Seismolord.
                </div>
              )}
              <table className="text-xs" data-testid="wdm-cs-table">
                <thead>
                  <tr>
                    <th className={thCls}>{REF_LABEL[csDisplay.depthRef]} ({csDisplay.depthUnit})</th>
                    <th className={thCls}>{csDisplay.time === 'owt' ? 'OWT' : 'TWT'} (ms)</th>
                    <th className={`${thCls} text-slate-600`}>stored TVDSS (m)</th>
                    <th className={`${thCls} text-slate-600`}>stored TWT (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {csRows.map((c, i) => (
                     
                    <tr key={i} data-testid="wdm-cs-row">
                      <td className={tdCls}>{fmt(c.depth, 2)}{c.ambiguous ? ' *' : ''}{c.extrapolated ? ' †' : ''}</td>
                      <td className={tdCls}>{fmt(c.time, 1)}</td>
                      <td className={`${tdCls} text-slate-500`}>{fmt(c.tvdss_m, 2)}</td>
                      <td className={`${tdCls} text-slate-500`}>{fmt(c.twt_ms, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csRows.some((c) => c.ambiguous || c.extrapolated) && (
                <div className="text-[11px] text-slate-500">* reached at more than one MD along this well (shallowest shown) · † beyond the last survey station (extrapolated)</div>
              )}
            </div>
          ) : <p className="text-xs text-slate-500">No checkshots on this well.</p>
        )}
      </div>
    </div>
  );
}
