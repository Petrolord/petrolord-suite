// Shared field primitives for the pump studio panels.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePump } from '@/contexts/PumpStudioContext';

export const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-pl-muted">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-pl-muted">{hint}</p>}
  </div>
);

export const NumberInput = ({ section, name, step = 'any' }) => {
  const { inputs, setSection } = usePump();
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
  const { inputs, setSection } = usePump();
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
