// A number field of Decline Curve Analysis that a person can type in (PL11)
// and that shows and takes its value in the display unit (PL3).
//
// The value handed in and committed out is in the state's unit (bbl/d,
// Mscf/d, days): `toView` and `toEngine` convert at the door, so state never
// changes unit. While the field has focus the text stays as typed: an empty
// box, "-", "2." and "1e" stay on screen and nothing snaps to 0. A complete
// number is committed; an empty box commits `emptyValue` (null unless given).
import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const COMPLETE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** A stored number as text for an input: no float noise. */
export const numberForInput = (v, digits = 10) => {
  if (v == null || v === '' || !Number.isFinite(Number(v))) return '';
  return String(parseFloat(Number(v).toPrecision(digits)));
};

const same = (v) => v;

/**
 * @param {{id: string, label: string, unit?: string, value: ?number, onCommit: function(?number): void,
 *   toView?: function(number): number, toEngine?: function(number): number, emptyValue?: ?number,
 *   placeholder?: string, hint?: string, testId?: string, disabled?: boolean, integer?: boolean,
 *   className?: string, inputClassName?: string, labelClassName?: string}} p
 */
export default function DcaNumberField({
  id, label, unit = '', value, onCommit, toView = same, toEngine = same, emptyValue = null, placeholder, hint, testId, disabled = false,
  integer = false, className, inputClassName, labelClassName, digits = 7,
}) {
  const shown = value == null || value === '' || !Number.isFinite(Number(value)) ? '' : numberForInput(toView(Number(value)), digits);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown); }, [shown, focused]);
  const change = (e) => {
    const t = e.target.value;
    setText(t);
    const trimmed = t.trim();
    if (trimmed === '') { onCommit(emptyValue); return; }
    if (COMPLETE.test(trimmed) && Number.isFinite(Number(trimmed))) {
      const n = Number(trimmed);
      onCommit(integer ? Math.round(toEngine(n)) : toEngine(n));
    }
  };
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id} className={cn('text-xs text-pl-text flex items-center justify-between gap-2', labelClassName)}>
        <span>{label}</span>
        {unit ? <span className="text-[10px] text-pl-muted font-mono shrink-0" data-testid={testId ? `${testId}-unit` : undefined}>{unit}</span> : null}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={change}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setText(shown); }}
        data-testid={testId}
        className={cn('h-8 text-xs', inputClassName)}
      />
      {hint ? <p className="text-[10px] text-pl-muted leading-relaxed">{hint}</p> : null}
    </div>
  );
}
