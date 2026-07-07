import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { GitMerge, ArrowLeft, Beaker, RotateCcw, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { analyzeFractionalFlow, sampleFractionalFlowData } from '@/utils/fractionalFlowCalculations';

// Line colors tuned for the white Petrolord chart background (dark enough to
// read on white, distinct in B&W). Kept local; palette lives in chartTheme.
const LINE = { water: '#2563eb', oil: '#059669', fw: '#7c3aed', tangent: '#d97706', ref: '#dc2626' };

const DEFAULTS = { Swc: '0.2', Sor: '0.2', krwMax: '0.4', kroMax: '1.0', nw: '2', no: '2', muW: '0.5', muO: '5.0' };

const PARAM_FIELDS = [
  { k: 'Swc', label: 'Swc — connate water' },
  { k: 'Sor', label: 'Sor — residual oil' },
  { k: 'krwMax', label: 'krw @ Sor (endpoint)' },
  { k: 'kroMax', label: 'kro @ Swc (endpoint)' },
  { k: 'nw', label: 'nw — water exponent' },
  { k: 'no', label: 'no — oil exponent' },
];
const FLUID_FIELDS = [
  { k: 'muW', label: 'μw — water visc. (cp)' },
  { k: 'muO', label: 'μo — oil visc. (cp)' },
];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const pct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);
const f2 = (v) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(2));
const f3 = (v) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(3));

export default function FractionalFlowAnalyzer() {
  const [inputs, setInputs] = useState(DEFAULTS);

  const p = useMemo(
    () => ({ Swc: num(inputs.Swc), Sor: num(inputs.Sor), krwMax: num(inputs.krwMax), kroMax: num(inputs.kroMax), nw: num(inputs.nw), no: num(inputs.no) }),
    [inputs],
  );
  const muW = num(inputs.muW);
  const muO = num(inputs.muO);

  const valid = 1 - p.Swc - p.Sor > 0.01 && muW > 0 && muO > 0 && p.krwMax > 0 && p.kroMax > 0;
  const result = useMemo(() => (valid ? analyzeFractionalFlow(p, muW, muO) : null), [valid, p, muW, muO]);

  const krData = useMemo(
    () => (result ? result.curves.map((c) => ({ Sw: Number(c.Sw.toFixed(3)), krw: Number(c.krw.toFixed(4)), kro: Number(c.kro.toFixed(4)) })) : []),
    [result],
  );

  // fw curve + Welge tangent overlay (line from (Swc,0) to (SwAvgBt,1)).
  const fwData = useMemo(() => {
    if (!result) return [];
    const { bl } = result;
    return result.curves.map((c) => {
      const tan = bl.fwPrimeF != null ? bl.fwPrimeF * (c.Sw - p.Swc) : null;
      const tangent = tan != null && c.Sw <= (bl.SwAvgBt ?? -Infinity) && tan <= 1.0001 ? Number(Math.min(1, tan).toFixed(4)) : null;
      return { Sw: Number(c.Sw.toFixed(3)), fw: Number(c.fw.toFixed(4)), tangent };
    });
  }, [result, p.Swc]);

  const recData = useMemo(
    () => (result ? result.recovery.filter((r) => r.Qi <= 8).map((r) => ({ Qi: Number(r.Qi.toFixed(3)), ED: Number((r.ED * 100).toFixed(2)) })) : []),
    [result],
  );

  const bl = result?.bl;
  const M = result?.M;
  const mobilityTone = M == null ? 'neutral' : M <= 1 ? 'good' : M <= 3 ? 'info' : 'warn';
  const TONE = {
    good: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    info: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
    warn: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    neutral: 'text-slate-400 border-slate-600/40 bg-slate-700/20',
  };

  const setField = (k, v) => setInputs((prev) => ({ ...prev, [k]: v }));
  const loadSample = () => {
    const s = sampleFractionalFlowData();
    setInputs({ Swc: String(s.params.Swc), Sor: String(s.params.Sor), krwMax: String(s.params.krwMax), kroMax: String(s.params.kroMax), nw: String(s.params.nw), no: String(s.params.no), muW: String(s.muW), muO: String(s.muO) });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <Helmet><title>Fractional Flow (Buckley-Leverett) | Petrolord Suite</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/reservoir" className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/30"><GitMerge className="w-6 h-6 text-violet-400" /></div>
            <div>
              <h1 className="text-2xl font-bold">Fractional Flow (Buckley-Leverett)</h1>
              <p className="text-sm text-slate-400">Corey rel-perm → water fractional flow → Welge tangent, breakthrough &amp; oil recovery.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadSample}><Beaker className="w-4 h-4 mr-1" /> Sample</Button>
            <Button variant="outline" size="sm" onClick={() => setInputs(DEFAULTS)}><RotateCcw className="w-4 h-4 mr-1" /> Reset</Button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Kpi title="Mobility ratio M" value={f2(M)} accent />
          <Kpi title="Front Sw (Swf)" value={f3(bl?.Swf)} />
          <Kpi title="fw at front" value={f2(bl?.fwf)} />
          <Kpi title="PV inj. @ breakthrough" value={f2(bl?.QiBt)} unit="PV" />
          <Kpi title="Recovery @ BT" value={pct(bl?.EDbt)} />
          <Kpi title="Ultimate recovery ED" value={pct(bl?.EDmax)} />
        </div>

        {/* Mobility interpretation */}
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${TONE[mobilityTone]}`}>
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold">Endpoint mobility ratio M = {f2(M)}. </span>
            {M == null ? 'Enter valid inputs.' : M <= 1
              ? 'Favorable displacement (M ≤ 1) — piston-like sweep, late water breakthrough.'
              : M <= 3
              ? 'Moderately unfavorable (1 < M ≤ 3) — some viscous fingering; earlier breakthrough.'
              : 'Unfavorable displacement (M > 3) — strong fingering, early breakthrough, prolonged high-water-cut tail.'}
          </div>
        </div>

        {!valid && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-sm">
            Check inputs: need 1 − Swc − Sor &gt; 0 and positive viscosities / endpoints.
          </div>
        )}

        {/* Inputs */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3"><CardTitle className="text-base">Corey relative permeability &amp; fluids</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {PARAM_FIELDS.map((fld) => <Field key={fld.k} fld={fld} inputs={inputs} setField={setField} />)}
            {FLUID_FIELDS.map((fld) => <Field key={fld.k} fld={fld} inputs={inputs} setField={setField} />)}
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          <ChartCard title="Relative permeability">
            <LineChart data={krData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="Sw" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1)} />
              <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} domain={[0, 'auto']} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
              <Line type="monotone" dataKey="krw" name="krw" stroke={LINE.water} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="kro" name="kro" stroke={LINE.oil} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>

          <ChartCard title="Fractional flow fw with Welge tangent">
            <LineChart data={fwData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="Sw" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1)} />
              <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} domain={[0, 1]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
              {bl?.Swf != null && <ReferenceLine x={Number(bl.Swf.toFixed(3))} stroke={LINE.fw} strokeDasharray="4 4" label={{ value: 'Swf', fill: LINE.fw, fontSize: 11, position: 'top' }} />}
              <Line type="monotone" dataKey="fw" name="fw" stroke={LINE.fw} strokeWidth={2} dot={false} />
              <Line type="linear" dataKey="tangent" name="Welge tangent" stroke={LINE.tangent} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
            </LineChart>
          </ChartCard>
        </div>

        <ChartCard title="Oil recovery vs pore volumes injected">
          <LineChart data={recData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="Qi" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} type="number" domain={[0, 'dataMax']} tickFormatter={(v) => v.toFixed(1)} label={{ value: 'PV injected', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} domain={[0, 'auto']} label={{ value: 'ED (%)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 20 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} />
            {bl?.EDmax != null && <ReferenceLine y={Number((bl.EDmax * 100).toFixed(1))} stroke={LINE.ref} strokeDasharray="5 5" label={{ value: 'ED max', fill: LINE.ref, fontSize: 11, position: 'right' }} />}
            <Line type="monotone" dataKey="ED" name="Recovery ED" stroke={LINE.oil} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <p className="text-xs text-slate-500">
          Classic 1-D Buckley-Leverett: horizontal, immiscible, no capillary/gravity term. Front saturation from the Welge tangent to the fw curve from (Swc, 0); PV injected at breakthrough = 1 / fw′(Swf). Ultimate displacement efficiency E<sub>D</sub> = (1 − Sor − Swc)/(1 − Swc).
        </p>
      </div>
    </div>
  );
}

const Kpi = ({ title, value, unit, accent }) => (
  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
    <Card className={`bg-slate-900 border-slate-800 ${accent ? 'ring-1 ring-violet-500/30' : ''}`}>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 leading-tight">{title}</div>
        <div className="text-xl font-bold mt-1">{value}{unit ? <span className="text-xs text-slate-500 ml-1">{unit}</span> : null}</div>
      </CardContent>
    </Card>
  </motion.div>
);

const Field = ({ fld, inputs, setField }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{fld.label}</Label>
    <Input value={inputs[fld.k]} onChange={(e) => setField(fld.k, e.target.value)} className="h-9 bg-slate-800 border-slate-700" />
  </div>
);

const ChartCard = ({ title, children }) => (
  <Card className="bg-slate-900 border-slate-800">
    <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent className="p-0">
      <div className="relative h-72 bg-white rounded-b-lg">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        <ChartLogo />
      </div>
    </CardContent>
  </Card>
);
