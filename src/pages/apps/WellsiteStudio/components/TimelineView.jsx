// The well event timeline (spec section 27): every event beside the
// depth it happened at, in rig time, with durations; open events end
// from here. Events of the current report day by default.

import React, { useMemo, useState } from 'react';
import EventBar from './EventBar';
import { eventsInPeriod, timeByType, EVENT_TYPES } from '../services/events';
import { reportPeriod, previousTours, toRigLocal } from '@/lib/wellsite/time';
import { fmtDepth } from '../services/units';

export default function TimelineView({ events, onStart, onEnd, tourCfg, offsetMin, unit, nowMs, currentUserName }) {
  const [scope, setScope] = useState('day');
  const period = useMemo(() => {
    if (scope === 'tour') { const t = previousTours(nowMs + 1, tourCfg, { count: 1 })[0]; return { startUtc: t.startUtc, endUtc: nowMs, label: `${t.label} tour` }; }
    if (scope === 'all') return { startUtc: 0, endUtc: nowMs, label: 'whole well' };
    const p = reportPeriod(nowMs, tourCfg);
    return { startUtc: p.startUtc, endUtc: nowMs, label: `report day ${p.dateLabel}` };
  }, [scope, nowMs, tourCfg]);
  const rows = useMemo(() => eventsInPeriod(events, period, nowMs).sort((a, b) => b.startUtcMs - a.startUtcMs), [events, period, nowMs]);
  const byType = useMemo(() => timeByType(events, period, nowMs), [events, period, nowMs]);
  const local = (ms) => toRigLocal(ms, offsetMin).hhmm;
  const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

  return (
    <div className="p-4 space-y-4" data-testid="ws-timeline">
      <h2 className="text-sm font-semibold text-slate-100">Timeline</h2>
      <EventBar events={events} onStart={onStart} onEnd={onEnd} offsetMin={offsetMin} />
      <div className="flex items-center gap-2 text-[11px]">
        {[['day', 'Report day'], ['tour', 'This tour'], ['all', 'Whole well']].map(([k, l]) => (
          <button key={k} type="button" data-testid={`ws-timeline-scope-${k}`} onClick={() => setScope(k)} className={`px-2 py-0.5 rounded border ${scope === k ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}>{l}</button>
        ))}
        <span className="text-slate-500">{period.label}, {rows.length} event(s)</span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-slate-400" data-testid="ws-timeline-bytype">
        {Object.entries(byType).filter(([, m]) => m > 0).map(([t, m]) => <span key={t} className="px-2 py-0.5 rounded bg-slate-800/80">{(EVENT_TYPES.find((x) => x.code === t) || { name: t }).name} {fmtMin(m)}</span>)}
      </div>
      <table className="text-xs text-slate-300 w-full">
        <thead><tr className="text-[10px] uppercase text-slate-500"><th className="text-left pr-3">Start</th><th className="text-left pr-3">End</th><th className="text-left pr-3">Event</th><th className="text-left pr-3">Depth</th><th className="text-left pr-3">Duration</th><th className="text-left">By</th></tr></thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.id} data-testid={`ws-timeline-row-${i}`} data-type={e.type} className={e.stillOpen ? 'text-amber-200' : ''}>
              <td className="pr-3 whitespace-nowrap">{local(e.startUtcMs)}</td>
              <td className="pr-3 whitespace-nowrap">{e.duration ? (e.endUtcMs == null ? 'open' : local(e.endUtcMs)) : ''}</td>
              <td className="pr-3">{e.label}{e.note ? <span className="text-slate-500">, {e.note}</span> : null}</td>
              <td className="pr-3 whitespace-nowrap">{Number.isFinite(e.mdM) ? fmtDepth(e.mdM, unit) : ''}</td>
              <td className="pr-3 whitespace-nowrap">{e.duration ? fmtMin(e.durationMin) : ''}</td>
              <td className="whitespace-nowrap text-slate-500">{e.by === 'me' ? currentUserName : (e.by || '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
