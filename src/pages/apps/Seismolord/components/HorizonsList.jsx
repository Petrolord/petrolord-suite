import React from 'react';
import { Layers, Trash2, Loader2 } from 'lucide-react';

export const HORIZON_COLORS = ['#22d3ee', '#f59e0b', '#a3e635', '#f472b6', '#c084fc', '#fb7185'];

export const horizonColor = (index) => HORIZON_COLORS[index % HORIZON_COLORS.length];

/** Compact horizon list shown inside the viewer card. */
export default function HorizonsList({ horizons, visibleIds, busyId, onToggle, onDelete }) {
  if (!horizons.length) {
    return (
      <p className="text-xs text-slate-500">
        No horizons yet — enable “Pick seed”, click an event on the section, then Track 3D.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {horizons.map((h, idx) => (
        <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2 min-w-0 cursor-pointer">
            <input
              type="checkbox"
              className="accent-cyan-500"
              checked={visibleIds.has(h.id)}
              onChange={() => onToggle(h)}
            />
            <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: horizonColor(idx) }} />
            <span className="text-slate-200 truncate">{h.name}</span>
            <span className="text-slate-500 text-xs whitespace-nowrap">
              {h.stats?.coverage != null ? `${Math.round(h.stats.coverage * 100)}%` : ''}
              {h.stats?.min_twt_ms != null
                ? ` · ${h.stats.min_twt_ms.toFixed(0)}–${h.stats.max_twt_ms.toFixed(0)} ms`
                : ''}
            </span>
          </label>
          <button
            type="button"
            className="text-red-400/70 hover:text-red-400 shrink-0"
            onClick={() => onDelete(h)}
            disabled={busyId === h.id}
            title="Delete horizon"
          >
            {busyId === h.id
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
