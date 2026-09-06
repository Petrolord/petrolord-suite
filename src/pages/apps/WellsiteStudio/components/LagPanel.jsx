// The lag readout (spec section 14) in the dock: lag strokes at the
// bit, lag time at the current rate, the lagged sample depth now and
// the bottoms-up time, with the pump log beside them. Every number
// says what it was computed with; pumps off means no lag time.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toRigLocal } from '@/lib/wellsite/time';
import { fmtDepth } from '../services/units';

export default function LagPanel({ lag, pumpEvents, onPump, unit, offsetMin, nowMs }) {
  const [spm, setSpm] = useState('');
  const [note, setNote] = useState('');
  const local = (ms) => toRigLocal(ms, offsetMin).hhmm;
  const fmtMin = (m) => (m == null ? 'undefined' : m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
  const inp = 'bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';
  const submit = async (e) => { e.preventDefault(); const v = Number(spm); if (!Number.isFinite(v) || v < 0) return; await onPump(v, note); setSpm(''); setNote(''); };
  return (
    <div className="p-3 space-y-3 text-xs" data-testid="ws-lag-panel">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">Lag</div>
      {!lag.available ? (
        <div className="text-slate-400" data-testid="ws-lag-note">{lag.note}</div>
      ) : (
        <div className="space-y-1">
          <Row label="Bit" value={fmtDepth(lag.bitMdM, unit)} testId="ws-lag-bit" />
          <Row label="Lag strokes" value={Number.isFinite(lag.lagStrokes) ? `${Math.round(lag.lagStrokes)} stk` : ''} testId="ws-lag-strokes" />
          <Row label="Pumps" value={lag.spmNow > 0 ? `${lag.spmNow} spm` : 'off'} testId="ws-lag-spm" />
          <Row label="Lag time at this rate" value={fmtMin(lag.lagTimeMin)} testId="ws-lag-time" />
          <Row label="Lagged sample depth" value={Number.isFinite(lag.laggedMdM) ? fmtDepth(lag.laggedMdM, unit) : 'not yet at surface'} testId="ws-lag-lagged" />
          <Row label="Bottoms up from now" value={lag.bottomsUpUtcMs ? local(lag.bottomsUpUtcMs) : 'undefined'} testId="ws-lag-bottoms-up" />
          {(lag.note || (lag.warnings || []).length > 0) && <div className="text-amber-400" data-testid="ws-lag-note">{lag.note || lag.warnings[0]}</div>}
        </div>
      )}
      <div className="text-[10px] uppercase tracking-wide text-slate-500 pt-2">Pump log</div>
      <form onSubmit={submit} className="flex items-center gap-1 flex-wrap">
        <input className={`${inp} w-16`} type="number" placeholder="spm" value={spm} onChange={(e) => setSpm(e.target.value)} data-testid="ws-lag-pump-spm" />
        <input className={`${inp} w-28`} placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="ws-lag-pump-note" />
        <Button size="sm" type="submit" data-testid="ws-lag-pump-save">Record</Button>
        <Button size="sm" type="button" variant="outline" onClick={() => onPump(0, 'Pumps off')} data-testid="ws-lag-pump-off">Off</Button>
      </form>
      <table className="w-full">
        <tbody>
          {[...pumpEvents].reverse().slice(0, 6).map((p) => (
            <tr key={p.id} className="text-slate-400"><td className="pr-2">{local(Date.parse(p.occurred_at))}</td><td className="pr-2 text-slate-200">{p.payload.spm > 0 ? `${p.payload.spm} spm` : 'off'}</td><td className="text-slate-500">{p.payload.note || ''}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-slate-600">Rig time {local(nowMs)}. Lag is counted in strokes; time follows the pump log.</div>
    </div>
  );
}

function Row({ label, value, testId }) {
  return <div className="flex justify-between gap-2"><span className="text-slate-500">{label}</span><span className="text-slate-100" data-testid={testId}>{value}</span></div>;
}
