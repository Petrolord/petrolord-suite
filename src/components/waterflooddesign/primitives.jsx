// Small shared primitives for the Waterflood Design Studio panels (also
// pulled by SCAL Studio and Fluid Systems Studio). Theme roles only.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChartPanel } from '@/components/ui/chart-panel';
import ChartFrame from '@/components/charts/ChartFrame';
import { EMPTY_VALUE } from '@/lib/emptyValue';

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
};

// Chart line colors tuned for the white Petrolord chart background.
export const LINE = { water: '#2563eb', oil: '#059669', fw: '#7c3aed', tangent: '#d97706', ref: '#dc2626', alt: '#0891b2' };
export const SCENARIO_COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#b45309'];

export const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-pl-muted uppercase mb-3 tracking-widest">{children}</h3>
);

export const Field = ({ label, value, onChange, placeholder, testId }) => (
  <div className="space-y-1">
    <Label className="text-xs text-pl-muted">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9" data-testid={testId} />
  </div>
);

// A unit-aware input (WF-U1, PL3): shows the stored (oilfield) value in the
// display unit of `u` and stores what is typed back in oilfield units. The
// label carries the unit. `testId` names the input for tests.
export const UField = ({ label, kind, u, value, onChange, placeholder, testId }) => {
  const [draft, setDraft] = React.useState(null);
  const shown = draft != null ? draft : (u ? u.text(kind, value) : value);
  const unit = u ? u.label(kind) : '';
  return (
    <div className="space-y-1">
      <Label className="text-xs text-pl-muted">{unit ? `${label} (${unit})` : label}</Label>
      <Input
        value={shown ?? ''}
        inputMode="decimal"
        data-testid={testId}
        onChange={(e) => {
          const text = e.target.value;
          const stored = u ? u.toState(kind, text) : text;
          if (stored == null) { setDraft(text); return; }
          setDraft(u && u.system !== 'oilfield' ? text : null);
          onChange(stored);
        }}
        onBlur={() => setDraft(null)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );
};

// WF-U2-014 (closes WF-U1-023): the unit-aware input without its label, for
// table cells. In SI the text being typed ("2.", "-") is kept as a draft
// while the stored oilfield value follows each complete number, as UField.
export const UInput = ({ kind, u, value, onChange, placeholder, ariaLabel, testId, className = 'h-8 text-xs' }) => {
  const [draft, setDraft] = React.useState(null);
  const shown = draft != null ? draft : (u ? u.text(kind, value) : value);
  return (
    <Input
      value={shown ?? ''}
      inputMode="decimal"
      aria-label={ariaLabel}
      data-testid={testId}
      onChange={(e) => {
        const text = e.target.value;
        const stored = u ? u.toState(kind, text) : text;
        if (stored == null) { setDraft(text); return; }
        setDraft(u && u.system !== 'oilfield' ? text : null);
        onChange(stored);
      }}
      onBlur={() => setDraft(null)}
      placeholder={placeholder}
      className={className}
    />
  );
};

export const Kpi = ({ title, value, unit, accent }) => (
  <Card className={accent ? 'ring-1 ring-pl-primary/40' : undefined}>
    <CardContent className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-pl-muted leading-tight">{title}</div>
      <div className="text-xl font-semibold mt-1 font-pl-mono tabular-nums text-pl-text">{value}{unit ? <span className="text-xs font-pl-sans font-normal text-pl-muted ml-1">{unit}</span> : null}</div>
    </CardContent>
  </Card>
);

// A titled white chart card (data-canvas="chart"): white in both themes.
export const ChartCard = ({ title, height = 264, children }) => (
  <ChartPanel title={title}>
    <ChartFrame height={height}>{children}</ChartFrame>
  </ChartPanel>
);

export const WarningBanner = ({ warnings }) => {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text px-4 py-3 text-xs space-y-1">
      {warnings.map((w, i) => <div key={i}>{w}</div>)}
    </div>
  );
};
