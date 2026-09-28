// Small shared primitives for the Well Test Analysis Studio panels.
// Design system (rollout batch 1A): the app wraps itself in <ThemedApp>, so
// every class here is a theme role; cards and inputs use the adapted ui
// defaults. Chart colors stay tuned for the white Petrolord chart background.
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
  // three significant figures; from 1,000 up written out with separators
  // rather than toPrecision's "2.25e+3" (WTA-T1-003)
  sig3: (v) => {
    if (v == null || !Number.isFinite(v)) return '—';
    const r = Number(Number(v).toPrecision(3));
    return Math.abs(r) >= 1000 && Math.abs(r) < 1e15 ? r.toLocaleString('en-US') : Number(v).toPrecision(3);
  },
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
  <h3 className="text-[10px] font-bold text-pl-accent-text uppercase mb-3 tracking-widest">{children}</h3>
);

export const Field = ({ label, value, onChange, placeholder, suffix }) => (
  <div className="space-y-1">
    <Label className="text-xs text-pl-muted">{label}{suffix ? <span className="text-pl-muted ml-1">({suffix})</span> : null}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9" />
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
  <Card className={accent ? 'border-pl-primary/60 ring-1 ring-pl-primary/30' : undefined}>
    <CardContent className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-pl-muted leading-tight">{title}</div>
      <div className="text-xl font-semibold mt-1 font-pl-mono tabular-nums text-pl-text">{value}{unit ? <span className="font-pl-sans text-xs font-normal text-pl-muted ml-1">{unit}</span> : null}</div>
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

// Log-cycle ticks for Recharts log axes: powers of ten spanning the data.
export const logTicks = (values) => {
  // A loop, not Math.min(...values): a high-frequency gauge can carry more
  // points than the argument spread allows (RangeError), and that would take
  // the whole plot down.
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!(Number.isFinite(v) && v > 0)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!(min <= max)) return undefined;
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  return Array.from({ length: hi - lo + 1 }, (_, i) => Math.pow(10, lo + i));
};

export const logTickFormatter = (v) => {
  if (!Number.isFinite(v)) return '';
  if (v >= 1000 || v < 0.01) return v.toExponential(0);
  return String(v);
};
