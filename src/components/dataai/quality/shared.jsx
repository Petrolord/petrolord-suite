// Small pieces shared by the Data Quality Studio panels (Data & AI D1).
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { DEFAULT_SOURCES } from '@/utils/dataAi/qcProfile';

/**
 * A text field that keeps exactly what was typed; the engine reads it. A
 * blank means the engine default, shown as the placeholder.
 */
export const TextInput = ({
  label, value, onChange, placeholder, testId, unit, source, className = '', width = 'w-24',
}) => (
  <label className={`block text-[11px] text-pl-muted ${className}`}>
    <span>{label}{unit ? <span className="text-pl-muted"> ({unit})</span> : null}</span>
    <input
      type="text"
      inputMode="decimal"
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={label}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
      className={`mt-0.5 block h-7 ${width} rounded border border-pl-border-strong bg-pl-surface px-2 font-mono text-xs text-pl-text`}
    />
    {source ? <span className="mt-0.5 block text-[10px] leading-tight text-pl-muted">{source}</span> : null}
  </label>
);

/** A parameter with its Petrolord default named as a choice. */
export const Param = ({ name, label, value, onChange, unit, testId, width }) => (
  <TextInput
    label={label}
    value={value}
    onChange={onChange}
    unit={unit}
    testId={testId}
    width={width}
    source={DEFAULT_SOURCES[name] ? `Default: ${DEFAULT_SOURCES[name]}` : null}
  />
);

export const Toggle = ({ label, checked, onChange, testId }) => (
  <label className="flex items-center gap-2 text-xs text-pl-text">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} className="h-3.5 w-3.5 accent-pl-primary" />
    <span>{label}</span>
  </label>
);

export const SelectField = ({
  label, value, onChange, options, testId, className = '', emptyLabel,
}) => (
  <label className={`block text-[11px] text-pl-muted ${className}`}>
    <span>{label}</span>
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      data-testid={testId}
      className="mt-0.5 block h-7 w-full rounded border border-pl-border-strong bg-pl-surface px-1 text-xs text-pl-text"
    >
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </label>
);

/** The engine's refusal, verbatim, with the field it names. */
export const EngineError = ({ result, prefix }) => {
  if (!result?.error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded border border-pl-danger/40 bg-pl-danger-bg p-2 text-xs text-pl-danger-text">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{prefix ? `${prefix}: ` : ''}{result.error}{Number.isInteger(result.entry) ? ` (entry ${result.entry} of the channel)` : ''}</span>
    </div>
  );
};

export const Note = ({ children, tone = 'info', testId }) => (
  <p
    data-testid={testId}
    className={`flex items-start gap-2 text-[11px] leading-relaxed ${tone === 'warn' ? 'text-pl-warning-text' : 'text-pl-muted'}`}
  >
    {tone === 'warn' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
    <span>{children}</span>
  </p>
);

export const Section = ({ title, children, right, testId }) => (
  <section data-testid={testId} className="rounded-lg border border-pl-border bg-pl-surface p-3">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-pl-text">{title}</h3>
      {right}
    </div>
    <div className="space-y-2">{children}</div>
  </section>
);

/** Six significant figures, for chart axes, tooltips and chart captions. Reason text uses qcDisplay.js. */
export const fmt = (x) => {
  if (x === null || x === undefined || Number.isNaN(x)) return '';
  if (x === Infinity) return 'infinity';
  if (x === -Infinity) return 'minus infinity';
  return String(Number(Number(x).toPrecision(6)));
};
