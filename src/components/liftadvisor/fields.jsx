// Shared field primitives for the lift advisor panels.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLiftAdvisor } from '@/contexts/LiftAdvisorContext';

export const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
  </div>
);

export const NumberInput = ({ section, name, step = 'any' }) => {
  const { inputs, setSection } = useLiftAdvisor();
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

export const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');
