// Cross-well tops sheet (AppUpgrade WDM-U2-005): every top of every well
// in one table, filtered by well or top name, with the count of wells per
// top name, inline name and MD edits on your own wells, a bulk rename and
// a paste of (well, top, MD) rows from Excel. Depths in the display unit;
// writes go through updateTop / saveTop, so top ids (and Well
// Correlation's picks) survive.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { sheetRows, topNameSummary, planBulkRename, planTopsPaste } from '../engine/topsSheet';
import { fmtDepth, editCell, parseDisplayed, unitText } from '../engine/displayUnits';
import { parseDelimited, guessMapping, guessMdUnit } from '@/lib/wellImport';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const thCls = 'sticky top-0 bg-pl-surface text-left font-medium text-pl-muted px-2 py-1 border-b border-pl-border whitespace-nowrap';
const tdCls = 'px-2 py-0.5 text-pl-text whitespace-nowrap';
const inputCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs';
const btnCls = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';
const primaryCls = 'px-2 py-0.5 rounded text-xs bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg disabled:opacity-40';

/** Column indices of a (well, top, MD) paste: header words first, else 0/1/2. */
export function pasteMapping(header) {
  if (!header) return { well: 0, name: 1, md: 2 };
  const lower = header.map((h) => String(h).toLowerCase().trim());
  const well = lower.findIndex((h) => /^(well|uwi|wellbore|borehole)/.test(h));
  const rest = header.map((h, i) => (i === well ? '' : h));
  const g = guessMapping(rest, ['name', 'md']);
  return { well, name: g.name, md: g.md };
}

export default function TopsSheetView({ backend, wells, unit = 'm', onStatus, onChanged, reloadKey = 0 }) {
  const u = unitText(unit);
  const [tops, setTops] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [nameFilter, setNameFilter] = useState(null);
  const [edits, setEdits] = useState({});       // topId -> {name, md} as typed
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState({ from: '', to: '' });
  const [paste, setPaste] = useState(null);     // null = closed; {text, unit}
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setTops(null);
    backend.listAllTops().then((t) => { if (live) setTops(t); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [backend, reloadKey, nonce]);

  const rows = useMemo(() => (tops ? sheetRows(wells, tops) : []), [wells, tops]);
  const summary = useMemo(() => topNameSummary(rows, wells), [rows, wells]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => (!nameFilter || r.name.trim().toLowerCase() === nameFilter.toLowerCase())
      && (!q || r.wellName.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)));
  }, [rows, filter, nameFilter]);

  const dirty = Object.keys(edits).filter((id) => {
    const r = rows.find((x) => x.topId === id);
    const e = edits[id];
    return r && (e.name.trim() !== r.name || parseDisplayed(e.md, u, r.md_m, 2) !== r.md_m);
  });

  const pastePlan = useMemo(() => {
    if (!paste?.text?.trim()) return null;
    try {
      const p = parseDelimited(paste.text);
      const map = pasteMapping(p.header);
      const mdUnit = (p.header && guessMdUnit([p.header[map.md] ?? ''], ['md'])) || paste.unit;
      return { ...planTopsPaste(p.rows, map, wells, rows, { mdUnit }), mdUnit };
    } catch (e) {
      return { error: e.message };
    }
  }, [paste, wells, rows]);

  const done = async (message) => {
    setEdits({});
    setNonce((n) => n + 1);
    onStatus?.(message);
    onChanged?.();
  };

  const saveEdits = async () => {
    setBusy(true);
    try {
      for (const id of dirty) {
        const r = rows.find((x) => x.topId === id);
        const e = edits[id];
        const md = parseDisplayed(e.md, u, r.md_m, 2);
        if (!e.name.trim()) throw new Error(`${r.wellName}: the top has no name.`);
        if (!Number.isFinite(md)) throw new Error(`${r.wellName}, ${r.name}: MD "${e.md}" is not a number.`);
        await backend.updateTop(id, { name: e.name.trim(), mdM: md });
      }
      await done(`Tops sheet saved (${dirty.length} top${dirty.length === 1 ? '' : 's'} changed).`);
    } catch (e) {
      onStatus?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doRename = async () => {
    setBusy(true);
    try {
      const plan = planBulkRename(rows, rename.from, rename.to);
      for (const up of plan.updates) await backend.updateTop(up.topId, { name: up.name });
      const notes = [
        plan.readOnly.length ? `${plan.readOnly.length} on read-only wells left as they are` : '',
        plan.conflicts.length ? `not renamed where the well already has "${rename.to.trim()}": ${plan.conflicts.join(', ')}` : '',
      ].filter(Boolean).join('; ');
      setRename({ from: '', to: '' });
      await done(`Renamed ${plan.updates.length} top${plan.updates.length === 1 ? '' : 's'} to "${rename.to.trim()}"${notes ? ` (${notes})` : ''}.`);
    } catch (e) {
      onStatus?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  const applyPaste = async () => {
    if (!pastePlan || pastePlan.error) return;
    setBusy(true);
    try {
      for (const c of pastePlan.creates) await backend.saveTop(c.wellId, { name: c.name, mdM: c.mdM, interpreter: null });
      for (const up of pastePlan.updates) await backend.updateTop(up.topId, { mdM: up.mdM });
      setPaste(null);
      await done(`Pasted tops: ${pastePlan.creates.length} added, ${pastePlan.updates.length} moved, ${pastePlan.unchanged} unchanged`
        + `${pastePlan.problems.length ? `, ${pastePlan.problems.length} line${pastePlan.problems.length === 1 ? '' : 's'} not used` : ''}.`);
    } catch (e) {
      onStatus?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="p-3 text-xs text-pl-danger-text">{error}</p>;
  if (!tops) return <div className="p-3 text-xs text-pl-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reading tops…</div>;

  return (
    <div className="p-3 space-y-2 text-xs" data-testid="wdm-tops-sheet">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-pl-text font-medium">Tops sheet</span>
        <span className="text-pl-muted">{rows.length} tops in {new Set(rows.map((r) => r.wellId)).size} of {wells.length} wells</span>
        <input className={`${inputCls} w-40`} placeholder="Filter wells or tops" value={filter}
          onChange={(e) => setFilter(e.target.value)} data-testid="wdm-sheet-filter" />
        <button type="button" className={`${btnCls} ml-auto`} onClick={() => setPaste(paste ? null : { text: '', unit: u })} data-testid="wdm-sheet-paste-toggle">
          {paste ? 'Close paste' : 'Paste from Excel'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1" data-testid="wdm-sheet-names">
        {summary.map((s) => (
          <button key={s.name} type="button" data-testid={`wdm-sheet-name-${s.name}`}
            title={s.missing.length ? `Missing in: ${s.missing.join(', ')}` : 'On every well'}
            onClick={() => setNameFilter((cur) => (cur === s.name ? null : s.name))}
            className={`rounded border px-1.5 py-0.5 text-[11px] ${nameFilter === s.name ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}>
            {s.name}: {s.count} of {s.total}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 text-pl-muted" data-testid="wdm-sheet-rename">
        Rename
        <select className={inputCls} value={rename.from} onChange={(e) => setRename((r) => ({ ...r, from: e.target.value }))} data-testid="wdm-sheet-rename-from">
          <option value="">top name…</option>
          {summary.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        to
        <input className={`${inputCls} w-36`} value={rename.to} onChange={(e) => setRename((r) => ({ ...r, to: e.target.value }))} data-testid="wdm-sheet-rename-to" />
        on every well you own
        <button type="button" className={btnCls} disabled={busy || !rename.from || !rename.to.trim()} onClick={doRename} data-testid="wdm-sheet-rename-go">Rename</button>
      </div>

      {paste && (
        <div className="rounded border border-pl-border p-2 space-y-1" data-testid="wdm-sheet-paste">
          <div className="text-pl-muted">
            Paste rows of well (name or UWI), top name and MD. A header such as MD (ft) sets the unit; without one the MD is read in
            <select className={`${inputCls} mx-1`} value={paste.unit} onChange={(e) => setPaste((p) => ({ ...p, unit: e.target.value }))} data-testid="wdm-sheet-paste-unit">
              <option value="m">metres</option><option value="ft">feet</option>
            </select>
            . A top the well already has moves; a new name is added.
          </div>
          <textarea className={`${inputCls} w-full h-24 font-mono`} value={paste.text}
            onChange={(e) => setPaste((p) => ({ ...p, text: e.target.value }))} data-testid="wdm-sheet-paste-text" />
          {pastePlan?.error && <div className="text-pl-danger-text">{pastePlan.error}</div>}
          {pastePlan && !pastePlan.error && (
            <div data-testid="wdm-sheet-paste-plan">
              <div className="text-pl-text">
                {pastePlan.creates.length} to add, {pastePlan.updates.length} to move, {pastePlan.unchanged} unchanged (MD read in {pastePlan.mdUnit}).
              </div>
              {pastePlan.problems.map((p) => (
                <div key={p.line} className="text-pl-warning-text">Line {p.line}: {p.reason}.</div>
              ))}
              <button type="button" className={`${primaryCls} mt-1`} disabled={busy || !(pastePlan.creates.length + pastePlan.updates.length)}
                onClick={applyPaste} data-testid="wdm-sheet-paste-apply">Apply</button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-auto max-h-[60vh] border border-pl-border rounded">
        <table className="min-w-full" data-testid="wdm-sheet-table">
          <thead>
            <tr>
              <th className={thCls}>Well</th>
              <th className={thCls}>Top</th>
              <th className={thCls}>MD ({u})</th>
              <th className={thCls}>TVD ({u})</th>
              <th className={thCls}>TVDSS ({u})</th>
              <th className={thCls}>Type</th>
              <th className={thCls}>Interpreter</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const e = edits[r.topId];
              return (
                <tr key={r.topId} data-testid="wdm-sheet-row" data-well={r.wellName} data-top={r.name}>
                  <td className={tdCls}>{r.wellName}{r.isOwn ? '' : <span className="ml-1 text-[10px] text-pl-muted">(read-only)</span>}</td>
                  <td className={tdCls}>
                    {r.isOwn ? (
                      <input className={`${inputCls} w-32`} value={e ? e.name : r.name} data-testid={`wdm-sheet-name-input-${r.wellName}-${r.name}`}
                        onChange={(ev) => setEdits((m) => ({ ...m, [r.topId]: { name: ev.target.value, md: m[r.topId]?.md ?? editCell(r.md_m, u, 2) } }))} />
                    ) : r.name}
                  </td>
                  <td className={tdCls}>
                    {r.isOwn ? (
                      <input className={`${inputCls} w-20`} inputMode="decimal" value={e ? e.md : editCell(r.md_m, u, 2)} data-testid={`wdm-sheet-md-${r.wellName}-${r.name}`}
                        onChange={(ev) => setEdits((m) => ({ ...m, [r.topId]: { md: ev.target.value, name: m[r.topId]?.name ?? r.name } }))} />
                    ) : fmtDepth(r.md_m, u, 2)}
                  </td>
                  <td className={tdCls}>{fmtDepth(r.tvd, u)}{r.extrapolated ? ' †' : ''}</td>
                  <td className={tdCls} title={r.kbSet ? '' : 'KB not set on this well: TVDSS equals TVD'}>{fmtDepth(r.tvdss, u)}{r.kbSet ? '' : ' *'}</td>
                  <td className={tdCls}>{r.surface_type || EMPTY_VALUE}</td>
                  <td className={tdCls}>{r.interpreter || EMPTY_VALUE}</td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={7} className="px-2 py-2 text-pl-muted">{rows.length ? 'No top matches the filter.' : 'No tops yet. Paste them here or add them on a well\'s Tops tab.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={primaryCls} disabled={busy || !dirty.length} onClick={saveEdits} data-testid="wdm-sheet-save">
          Save {dirty.length || ''} change{dirty.length === 1 ? '' : 's'}
        </button>
        <button type="button" className={btnCls} disabled={busy || !Object.keys(edits).length} onClick={() => setEdits({})}>Discard</button>
        <span className="text-pl-muted">* KB not set: TVDSS equals TVD · † below the last survey station</span>
      </div>
    </div>
  );
}
