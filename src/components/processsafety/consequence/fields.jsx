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
    <Label className="text-[11px] text-pl-muted">{label}</Label>
    <select
      aria-label={label}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 text-sm text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
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
    <Label className="text-[11px] text-pl-muted">
      {label}{unit ? <span className="text-pl-muted"> ({unit})</span> : null}
    </Label>
    <div
      data-testid={testId}
      className="flex h-8 items-center gap-2 rounded-md border border-pl-info/40 bg-pl-info-bg px-2 font-mono text-sm text-pl-info-text"
      title={`Carried over from ${from}`}
    >
      <Link2 className="h-3.5 w-3.5 flex-shrink-0 text-pl-info-text" />
      <span className="truncate">{value}</span>
    </div>
    <div className="mt-0.5 text-[10px] text-pl-info-text">from {from}</div>
  </div>
);

/** The engine's state word, shown exactly as the engine names it. */
export const StateBadge = ({ state, testId }) => {
  const tone = {
    REACHED: 'border-pl-success/40 bg-pl-success-bg text-pl-success-text',
    NOT_REACHED: 'border-pl-info/40 bg-pl-info-bg text-pl-info-text',
    BEYOND_SEARCH_RANGE: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
    CHOKED: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
    SUBSONIC: 'border-pl-info/40 bg-pl-info-bg text-pl-info-text',
  }[state] || 'border-pl-border-strong text-pl-text';
  return (
    <span data-testid={testId} className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${tone}`}>
      {state}
    </span>
  );
};

export const Panel = ({ title, children, testId }) => (
  <section data-testid={testId} className="space-y-3 rounded-lg border border-pl-border bg-pl-surface p-4">
    {title ? <h3 className="text-sm font-semibold text-pl-text">{title}</h3> : null}
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
