// Ribbon · Wells · Display: the "Well projection distance" box (tester
// feedback 2026-09-22). Wells and their tops draw on a section when the
// path passes within this many metres of it; empty = the default
// corridor of 1.5 bins.

import React, { useEffect, useState } from 'react';

/**
 * @param {Object} p
 * @param {?number} p.distanceM current distance (null = default)
 * @param {(v: string) => void} p.onChange
 * @param {boolean} [p.disabled]
 */
export default function WellProjectionInput({ distanceM, onChange, disabled = false }) {
  const [text, setText] = useState(distanceM == null ? '' : String(distanceM));
  useEffect(() => { setText(distanceM == null ? '' : String(distanceM)); }, [distanceM]);
  const commit = () => onChange(text.trim());
  return (
    <label
      className="flex flex-col gap-0.5 text-[10px] text-slate-500"
      title="Wells and their tops draw on a section where the path passes within this distance of it. Leave empty for the default of 1.5 bins."
    >
      Well projection distance (m)
      <input
        type="number"
        min="0"
        step="any"
        data-testid="sl-well-projection"
        value={text}
        placeholder="1.5 bins"
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } }}
        className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs w-24 disabled:opacity-40"
      />
    </label>
  );
}
