// Small shared primitives for the Nodal Analysis Studio panels.
// Mirrors the welltest primitives so the studios stay visually identical;
// chart colors tuned for the white Petrolord chart background.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';
import { unitLabel, fromOilfield, displayInputString, storeInputString } from '@/utils/nodal/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { createUnitDraft } from '@/hooks/useUnitDraft';

export const fmt = {
  num: (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : NaN;
  },
  pct: (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : `${(v * 100).toFixed(1)}%`),
  f1: (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toFixed(1)),
  f2: (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toFixed(2)),
  f3: (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toFixed(3)),
  int: (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Math.round(v).toLocaleString()),
  sig3: (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toPrecision(3)),
  sci: (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toExponential(2)),
};

export const LINE = {
  ipr: '#2563eb', // inflow curve
  vlp: '#dc2626', // outflow curve
  operating: '#059669', // operating point marker
  traverse: '#7c3aed', // pressure vs depth
  gradient: '#d97706',
  gasLift: '#0891b2',
  secondary: '#334155',
};

export const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-pl-muted uppercase mb-3 tracking-widest">{children}</h3>
);

export const Field = ({ label, value, onChange, placeholder, suffix, onBlur }) => (
  <div className="space-y-1">
    <Label className="text-xs text-pl-muted">{label}{suffix ? <span className="text-pl-muted ml-1">({suffix})</span> : null}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} className="h-9" />
  </div>
);

// WTA-U1-021: typing in SI keeps the text as typed while it is the source of
// the stored value. The hook is the shared one in src/hooks/useUnitDraft.js
// (same as Well Test WTA-U1-017), bound to the Nodal unit module.
export const useUnitDraft = createUnitDraft({ displayInputString, storeInputString });

// Unit-aware input: state stays oilfield; the field renders and accepts
// values in the active display system.
export const UnitField = ({ kind, system = 'oilfield', label, value, onChange, placeholder, suffixNote }) => {
  const d = useUnitDraft(kind, value, system, onChange);
  return (
    <Field
      label={label}
      suffix={`${unitLabel(kind, system)}${suffixNote ? `, ${suffixNote}` : ''}`}
      value={d.value}
      onChange={d.onChange}
      onBlur={d.onBlur}
      placeholder={placeholder}
    />
  );
};

export const fmtU = (kind, v, system, digits = fmt.f2) =>
  digits(fromOilfield(kind, v, system));

export const valueWithUnit = (kind, v, system, digits = fmt.f2) => {
  const label = unitLabel(kind, system);
  return `${fmtU(kind, v, system, digits)}${label ? ` ${label}` : ''}`;
};

export const Kpi = ({ title, value, unit, accent, sub }) => (
  <Card className={accent ? 'ring-1 ring-pl-primary/30' : undefined}>
    <CardContent className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-pl-muted leading-tight">{title}</div>
      <div className="text-xl font-bold mt-1 font-pl-mono tabular-nums">{value}{unit ? <span className="text-xs text-pl-muted ml-1">{unit}</span> : null}</div>
      {sub ? <div className="text-[11px] text-pl-muted mt-0.5">{sub}</div> : null}
    </CardContent>
  </Card>
);

export const ChartCard = ({ title, height = 264, children }) => (
  <Card>
    <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent className="p-0">
      <ChartFrame height={height}>{children}</ChartFrame>
    </CardContent>
  </Card>
);

export const WarningBanner = ({ warnings }) => {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text px-4 py-3 text-xs space-y-1">
      {warnings.map((w, i) => <div key={i}>{w}</div>)}
    </div>
  );
};
