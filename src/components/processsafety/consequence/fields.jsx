// Small pieces the Consequence Modelling Studio panels share (PS2). The
// number field, refusal box, warnings, basis list, stat and note are PS1's
// (../lopa/shared.jsx), reused as they are.
import React from 'react';
import { Label } from '@/components/ui/label';
import { Link2 } from 'lucide-react';
import {
  BasisList, EngineError, Note, NumField, Stat, TextField, Warnings,
} from '@/components/processsafety/lopa/shared';

export {
  BasisList, EngineError, Note, NumField, Stat, TextField, Warnings,
};

/** A native select, so the choice reads the same in a screen reader and a test. */
export const SelectField = ({
  label, value, onChange, options, testId, className = '',
}) => (
  <div className={className}>
    <Label className="text-[11px] text-slate-400">{label}</Label>
    <select
      aria-label={label}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
    >
      {options.map((o) => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.id} value={o.id}>{o.label}</option>))}
    </select>
  </div>
);

/** True when the engine refused THIS input, so the field is marked. */
export const refused = (result, ...fields) => Boolean(result?.error && fields.includes(result.field));

/**
 * A value carried over from another step, shown read-only where the typed
 * field would be, with where it came from.
 */
export const LinkedValue = ({
  label, unit, value, from, testId,
}) => (
  <div>
    <Label className="text-[11px] text-slate-400">
      {label}{unit ? <span className="text-slate-500"> ({unit})</span> : null}
    </Label>
    <div
      data-testid={testId}
      className="flex h-8 items-center gap-2 rounded-md border border-sky-700/60 bg-sky-950/30 px-2 font-mono text-sm text-sky-100"
      title={`Carried over from ${from}`}
    >
      <Link2 className="h-3.5 w-3.5 flex-shrink-0 text-sky-300" />
      <span className="truncate">{value}</span>
    </div>
    <div className="mt-0.5 text-[10px] text-sky-300/80">from {from}</div>
  </div>
);

/** The engine's state word, shown exactly as the engine names it. */
export const StateBadge = ({ state, testId }) => {
  const tone = {
    REACHED: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200',
    NOT_REACHED: 'border-sky-500/50 bg-sky-950/40 text-sky-200',
    BEYOND_SEARCH_RANGE: 'border-amber-500/50 bg-amber-950/30 text-amber-100',
    CHOKED: 'border-orange-500/50 bg-orange-950/30 text-orange-100',
    SUBSONIC: 'border-sky-500/50 bg-sky-950/40 text-sky-200',
  }[state] || 'border-slate-600 text-slate-300';
  return (
    <span data-testid={testId} className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${tone}`}>
      {state}
    </span>
  );
};

export const Panel = ({ title, children, testId }) => (
  <section data-testid={testId} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
    {title ? <h3 className="text-sm font-semibold text-slate-200">{title}</h3> : null}
    {children}
  </section>
);

export const Grid = ({ children, cols = 'md:grid-cols-3' }) => (
  <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${cols}`}>{children}</div>
);

/** A result block: the engine's refusal, or its numbers, warning and basis. */
export const Result = ({
  result, children, basisTitle = 'Basis (model and source)',
}) => {
  if (!result) return null;
  if (result.error) return <EngineError result={result} />;
  return (
    <div className="space-y-2">
      {children}
      {result.warning ? <Warnings warnings={[`Engine warning: ${result.warning}`]} /> : null}
      <BasisList basis={result.basis} title={basisTitle} />
    </div>
  );
};
