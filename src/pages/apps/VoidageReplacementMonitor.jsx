import React, { useState, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Droplets, ArrowLeft, Plus, Trash2, Upload, Download, RotateCcw, Beaker, Info,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { computeVRRSeries, summarizeVRR, classifyVRR, sampleVRRData } from '@/utils/vrrCalculations';

// Line colors tuned for the white Petrolord chart background.
const LINE = { inst: '#2563eb', cum: '#059669', ref: '#dc2626' };

const COLS = [
  { key: 'label', label: 'Period', unit: '', width: 'w-28' },
  { key: 'Np', label: 'Oil Prod', unit: 'STB' },
  { key: 'Wp', label: 'Water Prod', unit: 'STB' },
  { key: 'Gp', label: 'Gas Prod', unit: 'Mscf' },
  { key: 'Wi', label: 'Water Inj', unit: 'bbl' },
  { key: 'Gi', label: 'Gas Inj', unit: 'Mscf' },
];

const TONE = {
  good: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  warn: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  info: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  neutral: 'text-slate-400 border-slate-600/40 bg-slate-700/20',
};

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const emptyRow = () => ({ label: '', Np: '', Wp: '', Gp: '', Wi: '', Gi: '' });

export default function VoidageReplacementMonitor() {
  const { toast } = useToast();
  const fileRef = useRef(null);

  const [fvf, setFvf] = useState({ Bo: '1.25', Bw: '1.02', Bg: '0.9', Rs: '550' });
  const [periods, setPeriods] = useState([emptyRow()]);

  const series = useMemo(() => computeVRRSeries(periods, fvf), [periods, fvf]);
  const summary = useMemo(() => summarizeVRR(series), [series]);

  const chartData = useMemo(
    () =>
      series
        .filter((r) => r.producedVoidage > 0)
        .map((r) => ({
          label: r.label || `P${r.index + 1}`,
          instantaneous: r.instantaneousVRR != null ? Number(r.instantaneousVRR.toFixed(3)) : null,
          cumulative: r.cumulativeVRR != null ? Number(r.cumulativeVRR.toFixed(3)) : null,
        })),
    [series],
  );

  const updateCell = (i, key, value) =>
    setPeriods((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const addRow = () => setPeriods((prev) => [...prev, emptyRow()]);
  const removeRow = (i) => setPeriods((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [emptyRow()]));

  const loadSample = () => {
    const s = sampleVRRData();
    setFvf({ Bo: String(s.fvf.Bo), Bw: String(s.fvf.Bw), Bg: String(s.fvf.Bg), Rs: String(s.fvf.Rs) });
    setPeriods(s.periods.map((p) => ({ ...emptyRow(), ...p, Np: String(p.Np), Wp: String(p.Wp), Gp: String(p.Gp), Wi: String(p.Wi), Gi: String(p.Gi) })));
    toast({ title: 'Sample loaded', description: 'A 6-month waterflood dataset is ready.' });
  };

  const clearAll = () => {
    setPeriods([emptyRow()]);
    toast({ title: 'Cleared' });
  };

  const exportCsv = () => {
    const header = COLS.map((c) => c.key).join(',');
    const rows = periods.map((p) => COLS.map((c) => p[c.key] ?? '').join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vrr_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = String(reader.result).trim().split(/\r?\n/);
        const header = lines[0].split(',').map((h) => h.trim());
        const parsed = lines.slice(1).map((line) => {
          const cells = line.split(',');
          const row = emptyRow();
          header.forEach((h, idx) => {
            if (h in row) row[h] = (cells[idx] ?? '').trim();
          });
          return row;
        });
        if (parsed.length) {
          setPeriods(parsed);
          toast({ title: 'Imported', description: `${parsed.length} periods loaded.` });
        }
      } catch (err) {
        toast({ title: 'Import failed', description: 'Expected columns: label,Np,Wp,Gp,Wi,Gi', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const status = summary?.status ?? classifyVRR(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <Helmet><title>Voidage Replacement Monitor | Petrolord Suite</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/reservoir" className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30"><Droplets className="w-6 h-6 text-sky-400" /></div>
            <div>
              <h1 className="text-2xl font-bold">Voidage Replacement Monitor</h1>
              <p className="text-sm text-slate-400">Track VRR to confirm produced reservoir voidage is being replaced by injection.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadSample}><Beaker className="w-4 h-4 mr-1" /> Sample</Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" /> Import</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export</Button>
            <Button variant="outline" size="sm" onClick={clearAll}><RotateCcw className="w-4 h-4 mr-1" /> Clear</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi title="Cumulative VRR" value={fmt(summary?.cumulativeVRR, 2)} accent />
          <Kpi title="Latest Instantaneous VRR" value={fmt(summary?.latestInstantaneousVRR, 2)} />
          <Kpi title="Total Produced Voidage" value={fmt(summary?.totalProducedVoidage)} unit="RB" />
          <Kpi title="Total Injected Voidage" value={fmt(summary?.totalInjectedVoidage)} unit="RB" />
        </div>

        {/* Status banner */}
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${TONE[status.tone]}`}>
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Reservoir voidage status (cumulative VRR = {fmt(summary?.cumulativeVRR, 2)})</div>
            <div className="text-sm opacity-90">{status.label}</div>
          </div>
        </div>

        {/* FVF / PVT inputs */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3"><CardTitle className="text-base">Fluid properties (reservoir)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FvfInput label="Bo (RB/STB)" k="Bo" fvf={fvf} setFvf={setFvf} />
            <FvfInput label="Bw (RB/STB)" k="Bw" fvf={fvf} setFvf={setFvf} />
            <FvfInput label="Bg (RB/Mscf)" k="Bg" fvf={fvf} setFvf={setFvf} />
            <FvfInput label="Rs (scf/STB)" k="Rs" fvf={fvf} setFvf={setFvf} />
          </CardContent>
        </Card>

        {/* Chart */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-base">VRR trend</CardTitle></CardHeader>
          <CardContent className="p-0">
            {chartData.length ? (
              <div className="relative h-72 bg-white rounded-b-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                    <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} domain={[0, 'auto']} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} />
                    <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                    <ReferenceLine y={1} stroke={LINE.ref} strokeDasharray="5 5" label={{ value: 'VRR = 1', fill: LINE.ref, fontSize: 11, position: 'right' }} />
                    <Line type="monotone" dataKey="instantaneous" name="Instantaneous" stroke={LINE.inst} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke={LINE.cum} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-slate-500 text-sm">Enter production &amp; injection volumes to see the VRR trend.</div>
            )}
          </CardContent>
        </Card>

        {/* Data table */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">Production &amp; injection by period</CardTitle>
            <Button size="sm" onClick={addRow}><Plus className="w-4 h-4 mr-1" /> Add period</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  {COLS.map((c) => (
                    <TableHead key={c.key} className="text-slate-400 whitespace-nowrap">
                      {c.label}{c.unit ? <span className="text-slate-600 ml-1">({c.unit})</span> : null}
                    </TableHead>
                  ))}
                  <TableHead className="text-slate-400 text-right whitespace-nowrap">Inst. VRR</TableHead>
                  <TableHead className="text-slate-400 text-right whitespace-nowrap">Cum. VRR</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((row, i) => {
                  const band = classifyVRR(row.instantaneousVRR);
                  return (
                    <TableRow key={i} className="border-slate-800">
                      {COLS.map((c) => (
                        <TableCell key={c.key} className="p-1">
                          <Input
                            value={periods[i][c.key] ?? ''}
                            onChange={(e) => updateCell(i, c.key, e.target.value)}
                            placeholder={c.key === 'label' ? `P${i + 1}` : '0'}
                            className={`h-8 bg-slate-800 border-slate-700 ${c.key === 'label' ? 'w-24' : 'w-24 text-right'}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell className={`text-right font-mono ${band.tone === 'warn' ? 'text-amber-400' : band.tone === 'info' ? 'text-sky-400' : band.tone === 'good' ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {fmt(row.instantaneousVRR, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-300">{fmt(row.cumulativeVRR, 2)}</TableCell>
                      <TableCell className="p-1">
                        <button onClick={() => removeRow(i)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-slate-500 mt-3">
              Voidage is computed in reservoir barrels. Only free (excess) produced gas adds voidage — solution gas (Rs × oil) is already in B<sub>o</sub>. Per-period B-factors can be added later; the app currently applies one fluid-property set to all periods.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const Kpi = ({ title, value, unit, accent }) => (
  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
    <Card className={`bg-slate-900 border-slate-800 ${accent ? 'ring-1 ring-sky-500/30' : ''}`}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
        <div className="text-2xl font-bold mt-1">{value}{unit ? <span className="text-sm text-slate-500 ml-1">{unit}</span> : null}</div>
      </CardContent>
    </Card>
  </motion.div>
);

const FvfInput = ({ label, k, fvf, setFvf }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    <Input value={fvf[k]} onChange={(e) => setFvf((p) => ({ ...p, [k]: e.target.value }))} className="h-9 bg-slate-800 border-slate-700" />
  </div>
);
