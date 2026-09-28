// Shared field primitives for the gas processing panels.
//
// FC4-0 finding F-U3. `NumberInput` used to be a bare `type="number"`
// with no bounds and `fmt` used to render NaN and Infinity as `--`,
// which is the same thing it renders for a box nobody has typed in.
// Twenty-one of the FC4 findings were LIVE rather than theoretical
// because of that pair: every fail-silent path in the engine arrived on
// screen looking exactly like an empty field.
//
// Two rules hold here now.
//  1. A box carries the bounds of the quantity it holds, and says so
//     under itself the moment the value leaves them. The refusal is at
//     the box, before the engine is called at all.
//  2. An absent value and a value that is not a number are different
//     things on screen and read differently.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGasProcessing, FIELD_LIMITS, fieldIssue } from '@/contexts/GasProcessingContext';

export const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-pl-muted">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-pl-muted">{hint}</p>}
  </div>
);

export const NumberInput = ({ section, name, step = 'any' }) => {
  const { inputs, setSection } = useGasProcessing();
  const limit = FIELD_LIMITS[section]?.[name];
  const raw = inputs[section][name] ?? '';
  const issue = fieldIssue(section, name, raw);
  return (
    <div className="space-y-1">
      <Input
        type="number"
        step={step}
        min={limit?.min}
        max={limit?.max}
        value={raw}
        aria-label={limit?.label || name}
        aria-invalid={issue ? 'true' : undefined}
        onChange={(e) => setSection(section, name, e.target.value)}
        className={`h-9${issue ? ' border-pl-warning' : ''}`}
      />
      {issue && <p className="text-[11px] text-pl-warning-text">{issue}</p>}
    </div>
  );
};

/**
 * Nothing at all renders as `--`. A value that is present but is not a
 * finite number says which way it broke, because a blank that means
 * "you have not typed this yet" and a blank that means "the arithmetic
 * failed" are two different messages to the same user.
 */
export const NOT_A_NUMBER = 'not a number';
export const INFINITE = 'infinite';
export const MINUS_INFINITE = 'minus infinite';
export const ABSENT = '--';

export const fmt = (v, digits = 0) => {
  if (v === null || v === undefined || v === '') return ABSENT;
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isFinite(n)) {
    return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  if (Number.isNaN(n)) return NOT_A_NUMBER;
  return n > 0 ? INFINITE : MINUS_INFINITE;
};

/** Amber for a value that is present and is not a finite number. */
export const accentFor = (v, accent = 'text-pl-text') => (
  v === null || v === undefined || v === '' || Number.isFinite(typeof v === 'number' ? v : Number(v))
    ? accent
    : 'text-pl-warning-text'
);

export const Stat = ({ label, value, unit, hint, accent = 'text-pl-text' }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-pl-muted">{label}</p>
    <p className={`text-lg font-semibold font-pl-mono tabular-nums ${accent}`}>
      {value} {unit && <span className="text-xs font-normal text-pl-muted">{unit}</span>}
    </p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

export const Row = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-pl-border last:border-0">
    <div>
      <p className="text-sm text-pl-text">{label}</p>
      {hint && <p className="text-[11px] text-pl-muted">{hint}</p>}
    </div>
    <p className="text-sm font-semibold text-pl-text font-pl-mono tabular-nums whitespace-nowrap">{value}</p>
  </div>
);

export const ErrorNote = ({ children }) => (
  <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg px-3 py-2 text-sm text-pl-warning-text">
    {children}
  </div>
);

export const WarnNote = ({ children }) => (
  <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg px-3 py-2 text-[12px] text-pl-warning-text">
    {children}
  </div>
);
