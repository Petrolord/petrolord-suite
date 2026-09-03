// Tiny inline form for naming a picked top or zone (PT3, 2026-09-03).
// Rendered by the track viewers at the click position, inside the canvas
// wrapper (no portal, so pointer capture on the canvas is not disturbed).
// Enter confirms, Escape cancels, an empty name is refused inline.

import React, { useEffect, useRef, useState } from 'react';

export default function TopNamePopover({
  x, y, title = 'Name', defaultValue = '', names = [], placeholder = 'Top name',
  onConfirm, onCancel, testIdPrefix = 'petro-top',
}) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const confirm = () => {
    const v = value.trim();
    if (!v) { setError('The name is required.'); return; }
    onConfirm(v);
  };
  const listId = `${testIdPrefix}-names`;
  return (
    <div
      className="absolute z-20 rounded border border-slate-300 bg-white shadow-lg p-2 text-xs w-56"
      style={{ left: Math.max(4, x), top: Math.max(4, y) }}
      data-testid={`${testIdPrefix}-popover`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-slate-600 mb-1">{title}</div>
      <input
        ref={inputRef}
        list={listId}
        className="w-full rounded border border-slate-300 px-1.5 py-1 text-slate-900"
        value={value}
        placeholder={placeholder}
        data-testid={`${testIdPrefix}-name`}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); confirm(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
      />
      <datalist id={listId}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>
      {error && <div className="text-red-600 mt-1" data-testid={`${testIdPrefix}-name-error`}>{error}</div>}
      <div className="flex gap-1 mt-1.5 justify-end">
        <button type="button" className="px-2 py-0.5 rounded border border-slate-300 text-slate-700" onClick={onCancel} data-testid={`${testIdPrefix}-cancel`}>Cancel</button>
        <button type="button" className="px-2 py-0.5 rounded bg-cyan-600 text-white" onClick={confirm} data-testid={`${testIdPrefix}-confirm`}>OK</button>
      </div>
    </div>
  );
}
