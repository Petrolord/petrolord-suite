// A number input that edits an SI value through a display unit (RP0).
// The text the user is typing is kept locally so a half-typed "95"
// never round-trips through the conversion and snaps; the SI value
// updates on every finite keystroke (the panels recompute live, as
// before) and the text resyncs from the SI value when the unit or the
// value changes while the field is not focused.

import React, { useEffect, useRef, useState } from 'react';

export default function UnitInput({
  value, unit, toDisplay, fromDisplay, digits = 1, onChange, testid, title, className = '',
}) {
  const shown = Number.isFinite(value) ? toDisplay(value, unit) : NaN;
  const format = (d) => (Number.isFinite(d) ? String(Number(d.toFixed(digits))) : '');
  const [text, setText] = useState(() => format(shown));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(format(shown)); }, [shown, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      data-testid={testid}
      type="number"
      step="any"
      value={text}
      title={title}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(format(shown)); }}
      onChange={(e) => {
        setText(e.target.value);
        const d = parseFloat(e.target.value);
        onChange(Number.isFinite(d) ? fromDisplay(d, unit) : NaN);
      }}
      className={className}
    />
  );
}
