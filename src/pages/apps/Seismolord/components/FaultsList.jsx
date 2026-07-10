import React from 'react';
import { Slash, Trash2, Loader2 } from 'lucide-react';

export const FAULT_COLORS = ['#fb923c', '#e879f9', '#4ade80', '#f87171', '#38bdf8'];
export const faultColor = (index) => FAULT_COLORS[index % FAULT_COLORS.length];

/** Compact fault list shown inside the viewer card. */
export default function FaultsList({ faults, visibleIds, busyId, onToggle, onDelete }) {
  if (!faults.length) {
    return (
      <p className="text-xs text-slate-500">
        No faults yet — enable “Pick fault”, click points along the fault on a
        section, then Save fault.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {faults.map((f, idx) => (
        <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2 min-w-0 cursor-pointer">
            <input
              type="checkbox"
              className="accent-orange-400"
              checked={visibleIds.has(f.id)}
              onChange={() => onToggle(f)}
            />
            <Slash className="w-3.5 h-3.5 shrink-0" style={{ color: faultColor(idx) }} />
            <span className="text-slate-200 truncate">{f.name}</span>
            <span className="text-slate-500 text-xs whitespace-nowrap">
              {f.sticks.length} stick{f.sticks.length === 1 ? '' : 's'}
            </span>
          </label>
          <button
            type="button"
            className="text-red-400/70 hover:text-red-400 shrink-0"
            onClick={() => onDelete(f)}
            disabled={busyId === f.id}
            title="Delete fault"
          >
            {busyId === f.id
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
