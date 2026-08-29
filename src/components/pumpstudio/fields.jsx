// Shared field primitives for the pump studio panels.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePump } from '@/contexts/PumpStudioContext';

export const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
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
      className="h-9 bg-slate-800 border-slate-700"
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
      className="h-9 bg-slate-800 border-slate-700"
    />
  );
};

export const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

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
