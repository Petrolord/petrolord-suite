// The event quick bar (spec section 28): one click starts a common
// event with the time, the user and the current bit depth captured; a
// user-defined event asks for its label (two interactions). Open
// duration events show with an End button.

import React, { useState } from 'react';
import { EVENT_TYPES } from '../services/events';
import { toRigLocal } from '@/lib/wellsite/time';

export default function EventBar({ events, onStart, onEnd, offsetMin, compact = false }) {
  const [label, setLabel] = useState('');
  const [asking, setAsking] = useState(false);
  const open = events.filter((e) => e.duration && e.endUtcMs == null);
  const local = (ms) => toRigLocal(ms, offsetMin).hhmm;
  const types = compact ? EVENT_TYPES.filter((t) => ['drilling', 'connection', 'circulation', 'trip_in', 'trip_out', 'bottoms_up', 'losses', 'gains', 'gas_event', 'cavings', 'sweep', 'user_defined'].includes(t.code)) : EVENT_TYPES;
  return (
    <div className="space-y-2" data-testid="ws-event-bar">
      <div className="flex flex-wrap gap-1">
        {types.map((t) => (
          <button key={t.code} type="button" data-testid={`ws-event-${t.code}`} title={`${t.name} (${t.hotkey})`}
            onClick={() => { if (t.code === 'user_defined') setAsking(true); else onStart({ type: t.code }); }}
            className="px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800">
            {t.name}
          </button>
        ))}
      </div>
      {asking && (
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (label.trim()) { onStart({ type: 'user_defined', label: label.trim() }); setLabel(''); setAsking(false); } }}>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="what happened" data-testid="ws-event-label" className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 w-64" />
          <button type="submit" data-testid="ws-event-label-start" className="px-2 py-1 text-xs rounded border border-cyan-500/60 text-cyan-300">Start</button>
          <button type="button" onClick={() => setAsking(false)} className="px-2 py-1 text-xs text-slate-500">Cancel</button>
        </form>
      )}
      {open.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="ws-event-open">
          {open.map((e) => (
            <span key={e.id} className="flex items-center gap-2 px-2 py-1 text-xs rounded border border-amber-500/50 text-amber-200 bg-amber-500/5" data-testid={`ws-event-open-${e.type}`}>
              {e.label} since {local(e.startUtcMs)}
              <button type="button" onClick={() => onEnd(e)} data-testid={`ws-event-end-${e.type}`} className="px-1.5 py-0.5 rounded border border-amber-500/60 hover:bg-amber-500/10">End</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
