// The office view (upgrade U2-007): the operations geologist's morning
// page. Every live well this user can see, with where the bit is, what is
// at surface, the last sample caught, and what awaits someone (calls not
// yet final, conflicts, reports with no sign-off, samples overdue for
// review). Read only: following a well brings in what the rig has shared
// and writes nothing. Open goes to the well's own screens.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toRigLocal } from '@/lib/wellsite/time';
import { fmtDepth } from '../services/units';
import { officeRow, awaitingText, followText } from '../services/office';
import { offsetMinOf } from '../services/wellContext';

export default function OfficeView({ backend, wells, unit, nowMs, onOpen, onStatus, autoFollow = true }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const online = backend.online();

  const load = useCallback(async (follow) => {
    const my = ++seq.current;
    setBusy(true);
    try {
      const out = [];
      for (const w of wells || []) {
        let followed = null;
        if (follow) followed = await backend.followWell(w.id);
        const snap = await backend.wellSnapshot(w.id);
        out.push({ ...officeRow({ ...snap, nowMs: Date.now() }), follow: followed && !followed.offline ? followed : snap.follow, offsetMin: offsetMinOf(snap.well) });
      }
      if (my !== seq.current) return;
      out.sort((a, b) => b.awaiting - a.awaiting || String(a.name).localeCompare(String(b.name)));
      setRows(out);
      if (follow) onStatus?.(online ? `Office view: ${out.length} well(s) followed.` : 'Office view: no connection, showing what this device holds.');
    } catch (e) { onStatus?.(e.message); } finally { if (my === seq.current) setBusy(false); }
  }, [backend, wells, online, onStatus]);

  const wellsKey = (wells || []).map((w) => w.id).join(',');
  useEffect(() => { load(autoFollow); }, [wellsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoFollow) return undefined;
    const id = setInterval(() => load(true), 60000);
    return () => clearInterval(id);
  }, [load, autoFollow]);

  const hhmm = (iso, off) => (iso ? toRigLocal(Date.parse(iso), off).iso.replace('T', ' ').slice(5, 16) : 'n/a');
  void nowMs;
  return (
    <div className="p-4 space-y-3" data-testid="ws-office">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-pl-text">Office view</h2>
        <span className="text-[11px] text-pl-muted" data-testid="ws-office-readonly">Read only. Following a well brings in what the rig has shared; nothing on this page changes the record.</span>
        <Button size="sm" variant="outline" onClick={() => load(true)} disabled={busy} data-testid="ws-office-refresh" title={online ? 'Bring in what each rig has shared since the last time' : 'No connection: the page shows what this device holds'}>{busy ? 'Following' : 'Follow now'}</Button>
        {!online && <span className="text-[11px] text-pl-warning-text" data-testid="ws-office-offline">No connection: showing what this device holds.</span>}
      </div>
      {rows === null && <div className="text-xs text-pl-muted">Loading</div>}
      {rows && rows.length === 0 && <div className="text-xs text-pl-muted" data-testid="ws-office-none">No live well is shared with you yet.</div>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs text-pl-text w-full" data-testid="ws-office-table">
            <thead><tr className="text-[10px] uppercase text-pl-muted text-left">
              <th className="pr-3">Well</th><th className="pr-3">Bit</th><th className="pr-3">At surface</th><th className="pr-3">ROP</th><th className="pr-3">Pumps</th><th className="pr-3">Last sample caught</th><th className="pr-3">Awaiting</th><th className="pr-3">Last activity</th><th className="pr-3">Followed</th><th />
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const waits = awaitingText(r);
                return (
                  <tr key={r.wellId} data-testid={`ws-office-row-${r.name}`} data-awaiting={r.awaiting} className="align-top border-t border-pl-border">
                    <td className="pr-3 py-1 whitespace-nowrap"><span className="font-semibold">{r.name}</span><div className="text-[10px] text-pl-muted">{[r.field, r.rig].filter(Boolean).join(', ')}</div>{r.operation ? <div className="text-[10px] text-pl-muted">{r.operation}</div> : null}</td>
                    <td className="pr-3 py-1 whitespace-nowrap" data-testid={`ws-office-bit-${r.name}`}>{Number.isFinite(r.bitMdM) ? fmtDepth(r.bitMdM, unit) : 'n/a'}<div className="text-[10px] text-pl-muted">{r.bitAtUtc ? `${hhmm(r.bitAtUtc, r.offsetMin)} rig` : ''}</div></td>
                    <td className="pr-3 py-1 whitespace-nowrap" data-testid={`ws-office-lagged-${r.name}`}>{Number.isFinite(r.laggedMdM) ? fmtDepth(r.laggedMdM, unit) : 'n/a'}{r.lagNote ? <div className="text-[10px] text-pl-muted whitespace-normal max-w-[14rem]">{r.lagNote}</div> : null}</td>
                    <td className="pr-3 py-1 whitespace-nowrap">{r.rop && Number.isFinite(r.rop.mPerHr) ? `${(unit === 'ft' ? r.rop.mPerHr / 0.3048 : r.rop.mPerHr).toFixed(1)} ${unit}/hr` : 'n/a'}</td>
                    <td className="pr-3 py-1 whitespace-nowrap">{r.spm == null ? 'n/a' : r.spm > 0 ? `${r.spm} spm` : 'off'}</td>
                    <td className="pr-3 py-1 whitespace-nowrap">{r.lastSample ? `No ${r.lastSample.no}, ${fmtDepth(r.lastSample.mdM, unit)}` : 'none caught'}<div className="text-[10px] text-pl-muted">{r.lastSample ? `${hhmm(r.lastSample.atUtc, r.offsetMin)} rig` : ''}</div></td>
                    <td className={`pr-3 py-1 ${waits.length ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid={`ws-office-awaiting-${r.name}`}>{waits.length ? waits.map((w) => <div key={w}>{w}</div>) : 'nothing awaiting'}</td>
                    <td className="pr-3 py-1 whitespace-nowrap">{r.lastActivityUtc ? `${hhmm(r.lastActivityUtc, r.offsetMin)} rig` : 'n/a'}</td>
                    <td className="pr-3 py-1" data-testid={`ws-office-follow-${r.name}`}>{r.follow && r.follow.atUtc ? `${hhmm(r.follow.atUtc, r.offsetMin)} rig: ` : ''}{followText(r.follow, online)}</td>
                    <td className="py-1"><button type="button" className="px-1.5 py-0.5 rounded border border-pl-border hover:bg-pl-sunken" onClick={() => onOpen(r.wellId)} data-testid={`ws-office-open-${r.name}`}>Open</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
