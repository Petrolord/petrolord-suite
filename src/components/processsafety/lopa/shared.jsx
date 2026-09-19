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
    <Label className="text-[11px] text-slate-400">
      {label}{unit ? <span className="text-slate-500"> ({unit})</span> : null}
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
      className={`h-8 bg-slate-950 text-sm font-mono ${error ? 'border-red-500/70' : 'border-slate-700'}`}
    />
  </div>
);

export const TextField = ({ label, value, onChange, placeholder, className = '' }) => (
  <div className={className}>
    <Label className="text-[11px] text-slate-400">{label}</Label>
    <Input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 bg-slate-950 border-slate-700 text-sm"
    />
  </div>
);

/** The engine's refusal, verbatim, with the field it names. */
export const EngineError = ({ result, prefix }) => {
  if (!result?.error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded border border-red-500/40 bg-red-950/40 p-2 text-xs text-red-200">
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
        <li key={w} className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-xs text-amber-100">
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
    <details className="rounded border border-slate-800 bg-slate-900/40 p-2 text-xs">
      <summary className="cursor-pointer text-slate-400 hover:text-slate-200">{title}</summary>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[9rem_1fr] gap-2">
            <dt className="font-mono text-slate-500">{k}</dt>
            <dd className="text-slate-300">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
};

export const Stat = ({ label, value, unit, emphasis = false, testId }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
    <div className="text-[11px] text-slate-400">{label}{unit ? ` (${unit})` : ''}</div>
    <div data-testid={testId} className={`font-mono ${emphasis ? 'text-lg text-white' : 'text-sm text-slate-200'}`}>{value}</div>
  </div>
);

const OUTCOME_TONE = {
  [LOPA_OUTCOME.NO_SIF_REQUIRED]: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200',
  [LOPA_OUTCOME.BELOW_SIL1]: 'border-sky-500/50 bg-sky-950/40 text-sky-200',
  [LOPA_OUTCOME.SIL1]: 'border-amber-500/50 bg-amber-950/30 text-amber-100',
  [LOPA_OUTCOME.SIL2]: 'border-orange-500/50 bg-orange-950/30 text-orange-100',
  [LOPA_OUTCOME.SIL3]: 'border-red-500/50 bg-red-950/30 text-red-100',
  [LOPA_OUTCOME.BEYOND_SIL3]: 'border-fuchsia-500/60 bg-fuchsia-950/40 text-fuchsia-100',
};

/** The engine's outcome state, shown exactly as the engine names it. */
export const OutcomeBadge = ({ outcome, testId }) => (
  <span
    data-testid={testId}
    className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${OUTCOME_TONE[outcome] || 'border-slate-600 text-slate-300'}`}
  >
    {outcome}
  </span>
);

export const Note = ({ children }) => (
  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
    <span>{children}</span>
  </p>
);
