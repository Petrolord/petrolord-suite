// Well detail: header / logs (table + quick-view tracks) / tops /
// deviation / checkshots tabs for the selected well. Owns its own
// child-data fetching (tops + log metadata reload on well change;
// curve samples download on demand and cache per log id). Owner-only
// actions hide on org-shared read-only wells, mirroring what RLS would
// reject server-side.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, Building2, Lock } from 'lucide-react';
import LogTracks from './LogTracks';

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

export default function WellDetail({ backend, well, onStatus }) {
  const [tab, setTab] = useState('Header');
  const [tops, setTops] = useState(null);       // null = loading
  const [logs, setLogs] = useState(null);
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
  }, [refreshChildren]);

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
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        {tab === 'Header' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 max-w-2xl">
            <Field label="UWI">{well.uwi}</Field>
            <Field label="Surface X (m)">{fmt(well.surface_x)}</Field>
            <Field label="Surface Y (m)">{fmt(well.surface_y)}</Field>
            <Field label="KB (m)">{fmt(well.kb_m)}</Field>
            <Field label="TD (m MD)">{fmt(well.td_md_m)}</Field>
            <Field label="CRS">{well.crs_note}</Field>
            <Field label="Units">{well.units_note}</Field>
            <Field label="Deviation stations">{(well.deviation || []).length}</Field>
            <Field label="Checkshot pairs">{(well.checkshots || []).length}</Field>
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

        {tab === 'Tops' && (
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

        {tab === 'Deviation' && (
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

        {tab === 'Checkshots' && (
          (well.checkshots || []).length ? (
            <table className="text-xs">
              <thead>
                <tr>
                  <th className={thCls}>TVDss (m)</th>
                  <th className={thCls}>TWT (ms)</th>
                </tr>
              </thead>
              <tbody>
                {well.checkshots.map((c) => (
                  <tr key={c.tvdss_m}>
                    <td className={tdCls}>{fmt(c.tvdss_m)}</td>
                    <td className={tdCls}>{fmt(c.twt_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-slate-500">No checkshots on this well.</p>
        )}
      </div>
    </div>
  );
}
