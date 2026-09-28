// Shared field primitives for the corrosion studio panels.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCorrosion } from '@/contexts/CorrosionStudioContext';

export const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-pl-muted">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-pl-muted">{hint}</p>}
  </div>
);

export const NumberInput = ({ section, name, step = 'any' }) => {
  const { inputs, setSection } = useCorrosion();
  return (
    <Input
      type="number"
      step={step}
      value={inputs[section][name] ?? ''}
      onChange={(e) => setSection(section, name, e.target.value)}
      className="h-9"
    />
  );
};

export const TextInput = ({ section, name }) => {
  const { inputs, setSection } = useCorrosion();
  return (
    <Input
      type="text"
      value={inputs[section][name] ?? ''}
      onChange={(e) => setSection(section, name, e.target.value)}
      className="h-9"
    />
  );
};

export const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

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
    <div className="shrink-0">
      <p className="text-sm text-pl-text">{label}</p>
      {hint && <p className="text-[11px] text-pl-muted">{hint}</p>}
    </div>
    {/* Short figures stay on one line; a sentence value (the binding
        constraint) wraps right-aligned instead of running off the rail. */}
    <p className={`min-w-0 text-right text-sm font-semibold text-pl-text font-pl-mono tabular-nums ${String(value).length > 24 ? '' : 'whitespace-nowrap'}`}>{value}</p>
  </div>
);

/**
 * Engine notes print some quantities in exponent form ("5.100e-2 bar") or
 * to six decimals ("0.050763 psia"). Read them as plain decimals to three
 * significant figures for the screen (COR-T1-001).
 */
export const readable = (text) => String(text ?? '')
  .replace(/(-?\d+(?:\.\d+)?)e([+-]\d+)/g, (m, a, b) => {
    const v = Number(a) * 10 ** Number(b);
    return Number.isFinite(v) ? String(Number(v.toPrecision(3))) : m;
  })
  .replace(/\b(\d+\.\d{5,})\b/g, (m) => String(Number(Number(m).toPrecision(3))));

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

/**
 * What the studio does NOT provide, and which of its numbers are not
 * sourced. Both lists come straight from the engine, so they cannot
 * drift away from what the engine actually holds back.
 */
export const HeldNote = ({ notProvided = [], limits = [] }) => {
  if (!notProvided.length && !limits.length) return null;
  return (
    <div className="rounded-md border border-pl-border bg-pl-surface px-3 py-2 space-y-2">
      {notProvided.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold">
            What this studio does not provide
          </p>
          <ul className="mt-1 space-y-0.5">
            {notProvided.map((n) => (
              <li key={n} className="text-[11px] text-pl-muted">{n}</li>
            ))}
          </ul>
        </div>
      )}
      {limits.length > 0 && (
        <details>
          <summary className="text-[10px] uppercase tracking-widest text-pl-muted font-bold cursor-pointer">
            Numbers in this model that are not sourced ({limits.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {limits.map((l) => (
              <li key={l.slice(0, 40)} className="text-[11px] text-pl-muted">{l}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

export const CATEGORY_ACCENT = {
  negligible: 'text-pl-success-text',
  low: 'text-pl-success-text',
  moderate: 'text-pl-warning-text',
  high: 'text-pl-warning-text',
  severe: 'text-pl-danger-text',
};
