import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Waves, ArrowLeft, Beaker, HelpCircle, Info, AlertTriangle, Settings2,
  Calculator, Plus, Trash2, Download,
} from 'lucide-react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import ChartFrame from '@/components/charts/ChartFrame';
import AquiferInfluxHelpGuide from '@/components/reservoir/AquiferInfluxHelpGuide';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { computeInflux, sampleAquiferData } from '@/utils/aquiferInfluxCalculations';

const METHODS = [
  { code: 'veh', label: 'van Everdingen-Hurst', blurb: 'Rigorous constant-terminal-pressure superposition for a radial (edge) aquifer. The reference method.' },
  { code: 'carter-tracy', label: 'Carter-Tracy', blurb: 'Marching approximation to vEH for large / effectively-infinite aquifers. No superposition sum.' },
  { code: 'fetkovich', label: 'Fetkovich', blurb: 'Finite-aquifer productivity-index method. Needs aquifer volume W and index J (or geometry to derive them).' },
];

// Shared radial-aquifer parameters (used by all three methods).
const PARAM_FIELDS = [
  ['k', 'Permeability k', 'md'],
  ['muw', 'Water viscosity μw', 'cp'],
  ['phi', 'Porosity φ', 'frac'],
  ['ct', 'Total compressibility ct', '1/psi'],
  ['h', 'Aquifer thickness h', 'ft'],
  ['rR', 'Reservoir radius rR', 'ft'],
  ['theta', 'Encroachment angle θ', 'deg'],
];

// Extra inputs shown only for Fetkovich.
const FETKOVICH_FIELDS = [
  ['re', 'Aquifer outer radius re', 'ft'],
  ['W', 'Aquifer volume W (optional)', 'rb'],
  ['J', 'Productivity index J (optional)', 'rb/d/psi'],
];

const s = (o) => Object.fromEntries(
  Object.entries(o).map(([k, v]) => [k, v == null ? '' : String(v)]),
);

const fmtWe = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 3 })} MMrb`);
const fmtRate = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('en-US', { maximumFractionDigits: 0 })} rb/d`);
const fmtNum = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d }));

const LEVEL_COLOR = {
  none: 'text-slate-400', weak: 'text-amber-400', moderate: 'text-sky-400',
  strong: 'text-lime-400', active: 'text-sky-400',
};

export default function AquiferInfluxCalculator() {
  const { toast } = useToast();
  const [helpOpen, setHelpOpen] = useState(false);

  const sample = sampleAquiferData();
  const [method, setMethod] = useState('veh');
  const [params, setParams] = useState(s(sample.params));
  const [rows, setRows] = useState(sample.history.map((r) => ({ t: String(r.t), p: String(r.p) })));

  const numericParams = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(params)) {
      const n = parseFloat(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  }, [params]);

  const history = useMemo(
    () => rows
      .map((r) => ({ t: parseFloat(r.t), p: parseFloat(r.p) }))
      .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.p)),
    [rows],
  );

  const result = useMemo(
    () => computeInflux({ method, params: numericParams, history }),
    [method, numericParams, history],
  );

  const chartData = useMemo(
    () => (result.series || []).map((pt) => ({ t: pt.t, p: pt.p, We: pt.We / 1e6 })),
    [result],
  );

  const currentMethod = METHODS.find((m) => m.code === method);
  const finalTD = result.series?.length ? result.series[result.series.length - 1].tD : null;

  const setParam = (k, v) => setParams((p) => ({ ...p, [k]: v }));
  const setRow = (i, key, v) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, { t: '', p: '' }]);
  const delRow = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const loadSample = () => {
    const d = sampleAquiferData();
    setMethod('veh');
    setParams(s(d.params));
    setRows(d.history.map((r) => ({ t: String(r.t), p: String(r.p) })));
    toast({ title: 'Sample loaded', description: 'An edge-water-drive aquifer case is ready.' });
  };

  const importCsv = () => {
    const text = window.prompt('Paste pressure history as "time_days, pressure_psia" per line:');
    if (!text) return;
    const parsed = text.split(/\r?\n/).map((line) => {
      const [t, p] = line.split(/[,\t;]/).map((x) => x.trim());
      return { t, p };
    }).filter((r) => Number.isFinite(parseFloat(r.t)) && Number.isFinite(parseFloat(r.p)));
    if (!parsed.length) {
      toast({ title: 'No rows parsed', description: 'Expected lines like "365, 3700".', variant: 'destructive' });
      return;
    }
    setRows(parsed);
    toast({ title: 'History imported', description: `${parsed.length} rows loaded.` });
  };

  const exportCsv = () => {
    const lines = ['time_days,pressure_psia,We_rb'];
    (result.series || []).forEach((pt) => lines.push(`${pt.t},${pt.p},${pt.We.toFixed(2)}`));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aquifer_influx.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const cls = result.classification || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <Helmet><title>Aquifer Influx Calculator | Petrolord Suite</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/reservoir" className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30"><Waves className="w-6 h-6 text-sky-400" /></div>
            <div>
              <h1 className="text-2xl font-bold">Aquifer Influx Calculator</h1>
              <p className="text-sm text-slate-400">Cumulative water influx We(t) from a boundary-pressure history — van Everdingen-Hurst, Fetkovich, or Carter-Tracy.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadSample}><Beaker className="w-4 h-4 mr-1" /> Sample</Button>
            <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}><HelpCircle className="w-4 h-4 mr-1" /> Help</Button>
          </div>
        </div>

        {/* Method selector */}
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button key={m.code} onClick={() => setMethod(m.code)}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${method === m.code ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}>
              {m.label}
            </button>
          ))}
        </div>
        {currentMethod && <p className="text-xs text-slate-500 -mt-3">{currentMethod.blurb}</p>}

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi title="Cumulative Influx We" value={fmtWe(result.cumulativeWe)} accent />
          <Kpi title="Latest Influx Rate" value={fmtRate(result.rate)} />
          <Kpi title="Aquifer Strength" value={cls.label || '—'} valueClass={LEVEL_COLOR[cls.level] || 'text-slate-200'} />
          <Kpi title={method === 'fetkovich' ? 'Encroachable Water Wei' : 'Final tD'}
            value={method === 'fetkovich' ? fmtWe(result.Wei) : fmtNum(finalTD, 1)} />
        </div>

        {result.error && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">{result.error}</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: parameters + history */}
          <div className="space-y-6">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4 text-sky-400" /> Aquifer parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {PARAM_FIELDS.map(([k, lbl, unit]) => (
                    <Field key={k} label={`${lbl} (${unit})`} value={params[k] ?? ''} onChange={(v) => setParam(k, v)} />
                  ))}
                </div>
                {method === 'fetkovich' && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800">
                    {FETKOVICH_FIELDS.map(([k, lbl, unit]) => (
                      <Field key={k} label={`${lbl} (${unit})`} value={params[k] ?? ''} onChange={(v) => setParam(k, v)} />
                    ))}
                  </div>
                )}
                {method === 'fetkovich' && (
                  <p className="text-xs text-slate-500 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Leave W and J blank to derive them from the geometry (re, rR, θ, φ, h, k, μw) using a radial no-flow-boundary aquifer.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2"><Calculator className="w-4 h-4 text-sky-400" /> Boundary-pressure history</CardTitle>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={importCsv}>Import</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={exportCsv}><Download className="w-3.5 h-3.5" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr className="text-slate-400 border-b border-slate-800">
                        <th className="text-left py-1.5 font-medium">Time (days)</th>
                        <th className="text-left font-medium">Pressure (psia)</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b border-slate-800/60">
                          <td className="py-1 pr-2">
                            <Input value={r.t} onChange={(e) => setRow(i, 't', e.target.value)} className="h-8 bg-slate-800 border-slate-700" />
                          </td>
                          <td className="py-1 pr-2">
                            <Input value={r.p} onChange={(e) => setRow(i, 'p', e.target.value)} className="h-8 bg-slate-800 border-slate-700" />
                          </td>
                          <td className="text-center">
                            <button onClick={() => delRow(i)} className="text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button variant="outline" size="sm" className="mt-3 h-8" onClick={addRow}><Plus className="w-3.5 h-3.5 mr-1" /> Add row</Button>
                <p className="text-xs text-slate-500 mt-2">First row sets the initial pressure pi at t = 0 (We = 0). Enter the reservoir-boundary pressure as it declines.</p>
              </CardContent>
            </Card>
          </div>

          {/* Right: chart + results */}
          <div className="space-y-6">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-base">Water influx &amp; pressure history</CardTitle></CardHeader>
              <CardContent className="p-0">
                {chartData.length >= 2 ? (
                  <ChartFrame height={300}>
                    <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="t" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                        label={{ value: 'Time (days)', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }} />
                      <YAxis yAxisId="we" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                        label={{ value: 'We (MMrb)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }} />
                      <YAxis yAxisId="p" orientation="right" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                        domain={['auto', 'auto']}
                        label={{ value: 'Pressure (psia)', angle: 90, position: 'insideRight', fill: CHART_COLORS.axisText, fontSize: 11 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                        formatter={(v, name) => (name === 'We' ? [fmtWe(v * 1e6), 'We'] : [`${fmtNum(v, 0)} psia`, 'Pressure'])}
                        labelFormatter={(t) => `t = ${t} d`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="we" type="monotone" dataKey="We" name="We" stroke="#0284c7" fill="#0284c7" fillOpacity={0.15} strokeWidth={2} />
                      <Line yAxisId="p" type="monotone" dataKey="p" name="Pressure" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ChartFrame>
                ) : (
                  <div className="h-72 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
                    Enter at least two pressure points to compute a water-influx history.
                  </div>
                )}
                {cls.note && <p className="text-xs text-slate-500 px-6 pb-4">{cls.note}</p>}
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-base">Influx results</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                      <th className="text-left py-1.5 font-medium">t (days)</th>
                      <th className="text-right font-medium">p (psia)</th>
                      {method !== 'fetkovich' && <th className="text-right font-medium">tD</th>}
                      <th className="text-right font-medium">We (MMrb)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.series || []).map((pt, i) => (
                      <tr key={i} className="border-b border-slate-800/60">
                        <td className="py-1.5 text-slate-200">{fmtNum(pt.t, 0)}</td>
                        <td className="text-right font-mono text-slate-400">{fmtNum(pt.p, 0)}</td>
                        {method !== 'fetkovich' && <td className="text-right font-mono text-slate-500">{fmtNum(pt.tD, 1)}</td>}
                        <td className="text-right font-mono text-sky-400">{(pt.We / 1e6).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 mt-3 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Screening estimate. Confirm against reservoir simulation or an MBAL history match before use in reserves work.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AquiferInfluxHelpGuide isOpen={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

const Kpi = ({ title, value, accent, valueClass }) => (
  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
    <Card className={`bg-slate-900 border-slate-800 ${accent ? 'ring-1 ring-sky-500/30' : ''}`}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
        <div className={`text-2xl font-bold mt-1 ${valueClass || ''}`}>{value}</div>
      </CardContent>
    </Card>
  </motion.div>
);

const Field = ({ label, value, onChange }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 bg-slate-800 border-slate-700" />
  </div>
);
