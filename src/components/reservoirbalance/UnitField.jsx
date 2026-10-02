// A number field of the Material Balance Studio that a person can type in
// (PL11) and that shows and takes its value in the display unit (PL3).
//
// The value handed in and committed out is in the ENGINE unit (psia, STB,
// 1/psi, ft ...): the field converts at the door through lib/mbalUnits.js,
// so state never changes unit. While it has focus the text is kept as typed:
// an empty box, "-", "2." and "1e" stay on screen and nothing is snapped to
// 0. A complete number is committed; an empty box commits null.
import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const COMPLETE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** A stored number as text for an input: no float noise, no thousands separators. */
export const numberForInput = (v) => {
  if (v == null || v === '' || !Number.isFinite(Number(v))) return '';
  const n = Number(v);
  if (n !== 0 && (Math.abs(n) < 1e-4 || Math.abs(n) >= 1e15)) return String(Number(n.toPrecision(10)));
  return String(parseFloat(n.toPrecision(10)));
};

/**
 * @param {{id?: string, label: string, quantity?: ?string, unitText?: string, units?: object,
 *   value: ?number, onCommit: function(?number): void, placeholder?: string, hint?: string,
 *   error?: string, testId?: string, disabled?: boolean, required?: boolean, className?: string}} p
 *   `quantity` is a key of lib/mbalUnits (pressure, depth, compressibility ...);
 *   without it the field is dimensionless and `unitText` is printed as given.
 */
export default function UnitField({
  id, label, quantity = null, unitText = '', units = null, value, onCommit, placeholder, hint, error, testId, disabled = false, required = false, className,
}) {
  const toView = (v) => (quantity && units ? units.to(quantity, Number(v)) : Number(v));
  const toEngine = (v) => (quantity && units ? units.from(quantity, v) : v);
  const shown = value == null || value === '' || !Number.isFinite(Number(value)) ? '' : numberForInput(toView(value));
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown); }, [shown, focused]);
  const unit = quantity && units ? units.label(quantity) : unitText;
  const change = (e) => {
    const t = e.target.value;
    setText(t);
    const trimmed = t.trim();
    if (trimmed === '') { onCommit(null); return; }
    if (COMPLETE.test(trimmed) && Number.isFinite(Number(trimmed))) onCommit(toEngine(Number(trimmed)));
  };
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-xs text-pl-text flex items-center justify-between gap-2">
        <span>{label}{required ? ' *' : ''}</span>
        {unit ? <span className="text-[10px] text-pl-muted font-mono shrink-0" data-testid={testId ? `${testId}-unit` : undefined}>{unit}</span> : null}
      </Label>
      <Input id={id} inputMode="decimal" value={text} onChange={change} placeholder={placeholder} disabled={disabled}
        onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setText(shown); }}
        aria-invalid={error ? 'true' : undefined} data-testid={testId}
        className={cn('h-9', error ? 'border-pl-danger' : '')} />
      {hint && !error ? <p className="text-[10px] text-pl-muted leading-relaxed">{hint}</p> : null}
      {error ? <p className="text-[10px] text-pl-danger-text leading-relaxed">{error}</p> : null}
    </div>
  );
}
