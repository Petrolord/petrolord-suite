import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FlaskConical, ArrowLeft, Beaker, Info, CheckCircle2, XCircle, MinusCircle,
} from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import {
  FORMATION_OPTIONS, screenAllMethods, sampleEorScreeningData,
} from '@/utils/eorScreeningCalculations';

// R4 (Reservoir-ROADMAP.md): honest replacement for the archived EOR
// Designer shell. Pure client-side screening on the published Taber,
// Martin & Seright (1997) criteria — shortlisting, not design.

const FIELDS = [
  { key: 'gravityApi', label: 'Oil gravity', unit: '°API' },
  { key: 'viscosityCp', label: 'Oil viscosity', unit: 'cp' },
  { key: 'oilSatPct', label: 'Oil saturation', unit: '% PV' },
  { key: 'netThicknessFt', label: 'Net thickness', unit: 'ft' },
  { key: 'permeabilityMd', label: 'Average permeability', unit: 'md' },
  { key: 'depthFt', label: 'Depth', unit: 'ft' },
  { key: 'temperatureF', label: 'Reservoir temperature', unit: '°F' },
];

const STATUS_META = {
  pass: { icon: CheckCircle2, cls: 'text-emerald-600', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40' },
  fail: { icon: XCircle, cls: 'text-red-600', chip: 'bg-red-500/15 text-red-300 border-red-600/40' },
  na: { icon: MinusCircle, cls: 'text-slate-400', chip: 'bg-slate-500/15 text-slate-400 border-slate-600/40' },
};

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export default function EorScreeningTool() {
  const sample = useMemo(() => sampleEorScreeningData(), []);
  const [form, setForm] = useState(() =>
    Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, String(v)])));
  const [expanded, setExpanded] = useState(null);

  const input = useMemo(() => ({
    gravityApi: num(form.gravityApi),
    viscosityCp: num(form.viscosityCp),
    oilSatPct: num(form.oilSatPct),
    formation: form.formation || null,
    netThicknessFt: num(form.netThicknessFt),
    permeabilityMd: num(form.permeabilityMd),
    depthFt: num(form.depthFt),
    temperatureF: num(form.temperatureF),
  }), [form]);

  const results = useMemo(() => screenAllMethods(input), [input]);
  const qualified = results.filter((r) => r.qualified);

  const chartData = results.map((r) => ({
    name: r.name,
    score: Math.round(r.score * 100),
    qualified: r.qualified,
  }));

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <Helmet>
        <title>EOR Screening - Petrolord Suite</title>
        <meta name="description" content="Screen a reservoir against the published Taber-Martin-Seright EOR criteria." />
      </Helmet>
      <div className="p-4 md:p-8 h-full flex flex-col">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <Link to="/dashboard/reservoir">
              <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Reservoir Management
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-3 rounded-xl">
              <FlaskConical className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-white">EOR Screening</h1>
              <p className="text-lime-200 text-md md:text-lg">
                Technical screening on the published Taber, Martin &amp; Seright (1997) criteria
              </p>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col xl:flex-row gap-6 flex-grow min-h-0">
          {/* Inputs */}
          <Card className="bg-slate-900/70 border-slate-800 xl:w-80 shrink-0 h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Beaker className="w-4 h-4 text-lime-300" /> Reservoir &amp; fluid
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs text-slate-400">{f.label} ({f.unit})</Label>
                  <Input
                    type="number" step="any" value={form[f.key] ?? ''} onChange={set(f.key)}
                    className="h-8 bg-slate-800 border-slate-700 text-sm text-slate-100"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Formation</Label>
                <Select value={form.formation} onValueChange={(v) => setForm((f) => ({ ...f, formation: v }))}>
                  <SelectTrigger className="h-8 bg-slate-800 border-slate-700 text-sm">
                    <SelectValue placeholder="Select formation" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline" size="sm"
                className="w-full border-slate-700 text-slate-300"
                onClick={() => setForm(Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, String(v)])))}
              >
                Load sample (West-Texas-style CO2 candidate)
              </Button>
              <p className="text-[11px] text-slate-500 flex gap-1.5">
                <Info size={13} className="shrink-0 mt-0.5" />
                Screening shortlists candidate methods; it does not design or predict recovery.
                Blank inputs leave criteria unscored rather than assumed.
              </p>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="flex-1 min-w-0 space-y-4">
            <Card className="bg-slate-900/70 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-base">
                  Method ranking
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {qualified.length} of {results.length} methods qualify on every screened criterion
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-white rounded-lg p-3">
                  <ChartFrame height={280}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                      <CartesianGrid {...GRID_STYLE} horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine} unit="%" />
                      <YAxis type="category" dataKey="name" width={190} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} stroke={CHART_COLORS.axisLine} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}% of screened criteria met`, 'Score']} />
                      <Bar dataKey="score" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                        {chartData.map((d) => (
                          <Cell key={d.name} fill={d.qualified ? '#059669' : '#94a3b8'} />
                        ))}
                        <LabelList dataKey="score" position="right" formatter={(v) => `${v}%`} style={{ fill: CHART_COLORS.axisText, fontSize: 11 }} />
                      </Bar>
                    </BarChart>
                  </ChartFrame>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {results.map((r) => {
                const open = expanded === r.id;
                return (
                  <Card key={r.id} className={`bg-slate-900/70 border ${r.qualified ? 'border-emerald-700/50' : 'border-slate-800'}`}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 flex items-center gap-3"
                      onClick={() => setExpanded(open ? null : r.id)}
                    >
                      {r.qualified
                        ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                        : <XCircle size={18} className="text-slate-500 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-100 font-medium truncate">{r.name}</div>
                        <div className="text-[11px] text-slate-500">{r.group} · {r.passes}/{r.applicable} screened criteria met</div>
                      </div>
                      <Badge variant="outline" className={r.qualified
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40'
                        : 'bg-slate-500/15 text-slate-400 border-slate-600/40'}>
                        {r.qualified ? 'Qualified' : 'Screened out'}
                      </Badge>
                    </button>
                    {open && (
                      <CardContent className="pt-0 pb-4">
                        <div className="text-[11px] text-slate-500 mb-2">Oil composition guide: {r.composition}</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-slate-500 border-b border-slate-800">
                                <th className="py-1.5 pr-3">Criterion</th>
                                <th className="py-1.5 pr-3">Required (Taber et al. 1997)</th>
                                <th className="py-1.5 pr-3">This reservoir</th>
                                <th className="py-1.5">Verdict</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.verdicts.map((v) => {
                                const meta = STATUS_META[v.status];
                                const IconEl = meta.icon;
                                return (
                                  <tr key={v.criterion} className="border-b border-slate-800/60 text-slate-300">
                                    <td className="py-1.5 pr-3 text-slate-200">{v.criterion}</td>
                                    <td className="py-1.5 pr-3">{v.required}{v.preferred != null ? ` (typical ${v.preferred})` : ''}</td>
                                    <td className="py-1.5 pr-3">{v.actual != null ? `${v.actual}${v.unit ? ` ${v.unit}` : ''}` : '—'}</td>
                                    <td className="py-1.5">
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${meta.chip}`}>
                                        <IconEl size={11} /> {v.status === 'na' ? 'not scored' : v.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500">
              Criteria per Taber, Martin &amp; Seright, "EOR Screening Criteria Revisited", SPE Reservoir
              Engineering (1997). "Typical" values are the paper's current-project averages and are shown
              for context only; qualification uses the hard limits.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
