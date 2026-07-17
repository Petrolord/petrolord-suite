// Small shared primitives for the Waterflood Design Studio panels.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';

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
};

// Chart line colors tuned for the white Petrolord chart background.
export const LINE = { water: '#2563eb', oil: '#059669', fw: '#7c3aed', tangent: '#d97706', ref: '#dc2626', alt: '#0891b2' };
export const SCENARIO_COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#b45309'];

export const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

export const Field = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 bg-slate-800 border-slate-700" />
  </div>
);

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
