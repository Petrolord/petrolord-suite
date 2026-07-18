// Small shared primitives for the Well Test Analysis Studio panels.
// Mirrors the waterflooddesign primitives so the studios stay visually
// identical; chart colors tuned for the white Petrolord chart background.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';
import { unitLabel, fromOilfield, displayInputString, storeInputString } from '@/utils/welltest/units';

export const fmt = {
  num: (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : NaN;
  },
  pct: (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`),
  f1: (v) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(1)),
  f2: (v) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(2)),
  f3: (v) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(3)),
  int: (v) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString()),
  sig3: (v) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toPrecision(3)),
  sci: (v) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toExponential(2)),
};

export const LINE = {
  dp: '#2563eb', // pressure change
  derivative: '#dc2626', // Bourdet derivative
  model: '#059669', // model pressure overlay
  modelDeriv: '#7c3aed', // model derivative overlay
  fit: '#d97706', // straight-line fits
  rate: '#0891b2',
  pressure: '#334155',
};

export const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

export const Field = ({ label, value, onChange, placeholder, suffix }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}{suffix ? <span className="text-slate-600 ml-1">({suffix})</span> : null}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 bg-slate-800 border-slate-700" />
  </div>
);

// WT8: unit-aware input. State stays oilfield; the field renders and accepts
// values in the active display system.
export const UnitField = ({ kind, system = 'oilfield', label, value, onChange, placeholder, suffixNote }) => (
  <Field
    label={label}
    suffix={`${unitLabel(kind, system)}${suffixNote ? `, ${suffixNote}` : ''}`}
    value={displayInputString(kind, value, system)}
    onChange={(v) => onChange(storeInputString(kind, v, system))}
    placeholder={placeholder}
  />
);

// WT8: format an oilfield value in the active display system.
export const fmtU = (kind, v, system, digits = fmt.f2) =>
  digits(fromOilfield(kind, v, system));

// WT8: "value unit" string in the active display system.
export const valueWithUnit = (kind, v, system, digits = fmt.f2) => {
  const label = unitLabel(kind, system);
  return `${fmtU(kind, v, system, digits)}${label ? ` ${label}` : ''}`;
};

export const Kpi = ({ title, value, unit, accent }) => (
  <Card className={`bg-slate-900 border-slate-800 ${accent ? 'ring-1 ring-cyan-500/30' : ''}`}>
    <CardContent className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 leading-tight">{title}</div>
      <div className="text-xl font-bold mt-1">{value}{unit ? <span className="text-xs text-slate-500 ml-1">{unit}</span> : null}</div>
    </CardContent>
  </Card>
);

export const ChartCard = ({ title, height = 264, children }) => (
  <Card className="bg-slate-900 border-slate-800">
    <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent className="p-0">
      <ChartFrame height={height}>{children}</ChartFrame>
    </CardContent>
  </Card>
);

export const WarningBanner = ({ warnings }) => {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-xs space-y-1">
      {warnings.map((w, i) => <div key={i}>{w}</div>)}
    </div>
  );
};

// Log-cycle ticks for Recharts log axes: powers of ten spanning the data.
export const logTicks = (values) => {
  const finite = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!finite.length) return undefined;
  const lo = Math.floor(Math.log10(Math.min(...finite)));
  const hi = Math.ceil(Math.log10(Math.max(...finite)));
  return Array.from({ length: hi - lo + 1 }, (_, i) => Math.pow(10, lo + i));
};

export const logTickFormatter = (v) => {
  if (!Number.isFinite(v)) return '';
  if (v >= 1000 || v < 0.01) return v.toExponential(0);
  return String(v);
};
