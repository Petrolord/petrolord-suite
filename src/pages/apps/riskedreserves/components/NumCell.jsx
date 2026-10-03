// A numeric input a person can type in (Risked Reserves Valuation U1,
// shared by the prospect table and the economics panel since U2-002).

import React, { useEffect, useState } from 'react';

export const cell = 'w-full rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus disabled:opacity-70';

/**
 * A number a person can type: the text is the user's own while the field
 * has focus (clearing it, "2." and "-" stay as typed), the parsed value is
 * committed on every keystroke in the app's own unit, and a blank commits
 * a blank, never a zero.
 */
export default function NumCell({ value, onCommit, show = (x) => x, read = (x) => x, className = '', ...rest }) {
  const shown = (v) => (v === '' || v === null || v === undefined ? '' : (Number.isFinite(Number(v)) ? String(parseFloat(Number(show(Number(v))).toPrecision(6))) : String(v)));
  const [text, setText] = useState(() => shown(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown(value)); }, [value, focused, show]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (raw) => {
    setText(raw);
    const t = raw.trim().replace(/\s/g, '');
    if (t === '' || t === '-' || t === '.' || t === '-.') { onCommit(''); return; }
    // a comma decimal ("0,3") is read as 0.3; "1,234.5" as 1234.5
    const cleaned = /^-?\d*,\d*$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
    const n = Number(cleaned);
    onCommit(Number.isFinite(n) ? Number(read(n).toPrecision(10)) : raw);
  };
  return (
    <input className={`${cell} text-right font-pl-mono tabular-nums ${className}`} value={text} inputMode="decimal"
      onChange={(e) => change(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...rest} />
  );
}
