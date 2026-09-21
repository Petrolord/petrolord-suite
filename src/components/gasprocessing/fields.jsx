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
    <Label className="text-xs text-slate-400">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
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
        className={`h-9 bg-slate-800 ${issue ? 'border-amber-600' : 'border-slate-700'}`}
      />
      {issue && <p className="text-[11px] text-amber-400">{issue}</p>}
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
export const accentFor = (v, accent = 'text-slate-100') => (
  v === null || v === undefined || v === '' || Number.isFinite(typeof v === 'number' ? v : Number(v))
    ? accent
    : 'text-amber-400'
);

export const Stat = ({ label, value, unit, hint, accent = 'text-slate-100' }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`text-lg font-semibold tabular-nums ${accent}`}>
      {value} {unit && <span className="text-xs font-normal text-slate-500">{unit}</span>}
    </p>
    {hint && <p className="text-[11px] text-slate-600 mt-0.5">{hint}</p>}
  </div>
);

export const Row = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
    <div>
      <p className="text-sm text-slate-300">{label}</p>
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
    <p className="text-sm font-semibold text-slate-100 tabular-nums whitespace-nowrap">{value}</p>
  </div>
);

export const ErrorNote = ({ children }) => (
  <div className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
    {children}
  </div>
);

export const WarnNote = ({ children }) => (
  <div className="rounded-md border border-yellow-700/50 bg-yellow-950/20 px-3 py-2 text-[12px] text-yellow-300">
    {children}
  </div>
);
