// Ribbon · Wells · Display: the "Well projection distance" box (tester
// feedback 2026-09-22). Wells and their tops draw on a section when the
// path passes within this many metres of it; empty = the default
// corridor of 1.5 bins.

import React, { useEffect, useState } from 'react';
import { RIBBON_FIELD } from './Ribbon';

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
      className="inline-flex items-center gap-1 text-[10px] leading-none text-pl-muted whitespace-nowrap"
      title="Wells and their tops draw on a section where the path passes within this distance of it. Leave empty for the default of 1.5 bins."
    >
      <span>Well projection distance (m)</span>
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
        className={`${RIBBON_FIELD} w-24`}
      />
    </label>
  );
}
