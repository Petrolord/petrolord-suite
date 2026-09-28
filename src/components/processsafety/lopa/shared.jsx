// Small pieces shared by the LOPA & SIL Studio panels (PS1).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Info } from 'lucide-react';
import { LOPA_OUTCOME } from '@/utils/processSafety/lopaStudy';

/**
 * A text field that keeps exactly what was typed. Numbers stay text until the
 * engine reads them, so "1e-5" survives being typed one character at a time
 * and a blank stays blank (absent) instead of becoming zero.
 */
export const NumField = ({
  label, unit, value, onChange, placeholder, error, testId, className = '',
}) => (
  <div className={className}>
    <Label className="text-[11px] text-pl-muted">
      {label}{unit ? <span className="text-pl-muted"> ({unit})</span> : null}
    </Label>
    <Input
      type="text"
      inputMode="decimal"
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={unit ? `${label} (${unit})` : label}
      aria-invalid={error ? 'true' : undefined}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 text-sm font-mono ${error ? 'border-pl-danger' : ''}`}
    />
  </div>
);

export const TextField = ({ label, value, onChange, placeholder, className = '' }) => (
  <div className={className}>
    <Label className="text-[11px] text-pl-muted">{label}</Label>
    <Input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-sm"
    />
  </div>
);

/** The engine's refusal, verbatim, with the field it names. */
export const EngineError = ({ result, prefix }) => {
  if (!result?.error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded border border-pl-danger/40 bg-pl-danger-bg p-2 text-xs text-pl-danger-text">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{prefix ? `${prefix}: ` : ''}{result.error}</span>
    </div>
  );
};

export const Warnings = ({ warnings }) => {
  if (!warnings || warnings.length === 0) return null;
  return (
    <ul className="space-y-1">
      {warnings.map((w) => (
        <li key={w} className="flex items-start gap-2 rounded border border-pl-warning/40 bg-pl-warning-bg p-2 text-xs text-pl-warning-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
};

/** The engine's basis object, printed key by key so nothing is paraphrased. */
export const BasisList = ({ basis, title = 'Basis' }) => {
  if (!basis) return null;
  const rows = Object.entries(basis).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object');
  if (rows.length === 0) return null;
  return (
    <details className="rounded border border-pl-border bg-pl-surface p-2 text-xs">
      <summary className="cursor-pointer text-pl-muted hover:text-pl-text">{title}</summary>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[9rem_1fr] gap-2">
            <dt className="font-mono text-pl-muted">{k}</dt>
            <dd className="text-pl-text">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
};

export const Stat = ({ label, value, unit, emphasis = false, testId }) => (
  <div className="rounded-lg border border-pl-border bg-pl-surface p-3">
    <div className="text-[11px] text-pl-muted">{label}{unit ? ` (${unit})` : ''}</div>
    <div data-testid={testId} className={`font-mono ${emphasis ? 'text-lg font-semibold text-pl-text' : 'text-sm text-pl-text'}`}>{value}</div>
  </div>
);

const OUTCOME_TONE = {
  [LOPA_OUTCOME.NO_SIF_REQUIRED]: 'border-pl-success/40 bg-pl-success-bg text-pl-success-text',
  [LOPA_OUTCOME.BELOW_SIL1]: 'border-pl-info/40 bg-pl-info-bg text-pl-info-text',
  [LOPA_OUTCOME.SIL1]: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  [LOPA_OUTCOME.SIL2]: 'border-pl-warning bg-pl-warning-bg font-semibold text-pl-warning-text',
  [LOPA_OUTCOME.SIL3]: 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text',
  [LOPA_OUTCOME.BEYOND_SIL3]: 'border-pl-danger bg-pl-danger font-semibold text-pl-danger-fg',
};

/** The engine's outcome state, shown exactly as the engine names it. */
export const OutcomeBadge = ({ outcome, testId }) => (
  <span
    data-testid={testId}
    className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${OUTCOME_TONE[outcome] || 'border-pl-border-strong text-pl-text'}`}
  >
    {outcome}
  </span>
);

export const Note = ({ children }) => (
  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-pl-muted">
    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
    <span>{children}</span>
  </p>
);
