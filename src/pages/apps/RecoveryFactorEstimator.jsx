import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Percent, ArrowLeft, Beaker, HelpCircle, Info, AlertTriangle, Layers, Calculator,
} from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import ChartFrame from '@/components/charts/ChartFrame';
import RecoveryFactorHelpGuide from '@/components/reservoir/RecoveryFactorHelpGuide';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import {
  DRIVE_MECHANISMS, estimateRecovery, stoiipVolumetric, ogipVolumetric, sampleRecoveryData,
} from '@/utils/recoveryFactorCalculations';

const BAR = { low: '#94a3b8', est: '#059669', high: '#2563eb' };

// Oil vs gas method menus.
const METHODS = {
  oil: [
    { code: 'analog', label: 'Drive-mechanism analog' },
    { code: 'api_solution_gas', label: 'API — solution-gas drive' },
    { code: 'api_water_drive', label: 'API — water drive' },
  ],
  gas: [
    { code: 'analog', label: 'Drive-mechanism analog' },
    { code: 'gas_pz', label: 'p/z depletion (exact)' },
    { code: 'gas_water_drive', label: 'Water-drive gas (trapping)' },
  ],
};

const DEFAULT_DRIVE = { oil: 'water_drive', gas: 'gas_volumetric' };

// Correlation input specs per method (key, label, unit).
const CORR_FIELDS = {
  api_solution_gas: [
    ['phi', 'Porosity φ', 'frac'], ['swi', 'Swi', 'frac'], ['bob', 'Bob', 'RB/STB'],
    ['k', 'Permeability k', 'md'], ['muob', 'μob', 'cp'], ['pb', 'Bubble-pt pb', 'psia'], ['pa', 'Abandon pa', 'psia'],
  ],
  api_water_drive: [
    ['phi', 'Porosity φ', 'frac'], ['swi', 'Swi', 'frac'], ['boi', 'Boi', 'RB/STB'],
    ['k', 'Permeability k', 'md'], ['muwi', 'μwi', 'cp'], ['muoi', 'μoi', 'cp'],
    ['pi', 'Initial pi', 'psia'], ['pa', 'Abandon pa', 'psia'],
  ],
  gas_pz: [
    ['pi', 'Initial pi', 'psia'], ['zi', 'zi', '—'], ['pa', 'Abandon pa', 'psia'], ['za', 'za', '—'],
  ],
  gas_water_drive: [
    ['swi', 'Swi', 'frac'], ['sgr', 'Residual gas Sgr', 'frac'], ['sweep', 'Sweep efficiency', 'frac'],
  ],
};

const VOL_FIELDS_OIL = [
  ['area', 'Area A', 'acres'], ['thickness', 'Net pay h', 'ft'], ['phi', 'Porosity φ', 'frac'],
  ['sw', 'Water sat Sw', 'frac'], ['ntg', 'Net-to-gross', 'frac'], ['boi', 'Boi', 'RB/STB'],
];
const VOL_FIELDS_GAS = [
  ['area', 'Area A', 'acres'], ['thickness', 'Net pay h', 'ft'], ['phi', 'Porosity φ', 'frac'],
  ['sw', 'Water sat Sw', 'frac'], ['ntg', 'Net-to-gross', 'frac'], ['bgi', 'Bgi', 'ft³/scf'],
];

const s = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));

const fmtPct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);
const fmtRes = (v, phase) => {
  if (v == null || !Number.isFinite(v)) return '—';
  return phase === 'gas'
    ? `${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} Bscf`
    : `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} MMSTB`;
};
const fmtInPlace = (v, phase) => {
  if (v == null || !Number.isFinite(v)) return '—';
  return phase === 'gas'
    ? `${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} Bscf`
    : `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} MMSTB`;
};

export default function RecoveryFactorEstimator() {
  const { toast } = useToast();
  const [helpOpen, setHelpOpen] = useState(false);

  const [phase, setPhase] = useState('oil');
  const [method, setMethod] = useState('analog');
  const [driveCode, setDriveCode] = useState(DEFAULT_DRIVE.oil);
  const [inPlaceMode, setInPlaceMode] = useState('volumetric'); // 'direct' | 'volumetric'
  const [ooipDirect, setOoipDirect] = useState('');
  const [vol, setVol] = useState(s(sampleRecoveryData().volumetric));
  const [corr, setCorr] = useState(s(sampleRecoveryData().correlationInputs));

  const drives = useMemo(() => DRIVE_MECHANISMS.filter((d) => d.phase === phase), [phase]);

  const switchPhase = (p) => {
    setPhase(p);
    setMethod('analog');
    setDriveCode(DEFAULT_DRIVE[p]);
  };

  // Resolve in-place volume (STB or scf).
  const inPlace = useMemo(() => {
    if (inPlaceMode === 'direct') {
      const n = parseFloat(ooipDirect);
      return Number.isFinite(n) ? n : null;
    }
    return phase === 'gas' ? ogipVolumetric(vol) : stoiipVolumetric(vol);
  }, [inPlaceMode, ooipDirect, phase, vol]);

  const result = useMemo(
    () => estimateRecovery({ method, driveCode, ooip: inPlace, correlationInputs: corr }),
    [method, driveCode, inPlace, corr],
  );

  const chartData = useMemo(() => {
    const rows = [];
    if (Number.isFinite(result.reservesLow)) rows.push({ name: 'Low', value: result.reservesLow, fill: BAR.low });
    if (Number.isFinite(result.reserves)) rows.push({ name: 'Estimate', value: result.reserves, fill: BAR.est });
    if (Number.isFinite(result.reservesHigh)) rows.push({ name: 'High', value: result.reservesHigh, fill: BAR.high });
    return rows;
  }, [result]);

  const loadSample = () => {
    const d = sampleRecoveryData();
    setPhase('oil');
    setMethod('analog');
    setDriveCode('water_drive');
    setInPlaceMode('volumetric');
    setVol(s(d.volumetric));
    setCorr(s(d.correlationInputs));
    toast({ title: 'Sample loaded', description: 'A water-drive oil case is ready.' });
  };

  const corrFields = CORR_FIELDS[method] || [];
  const volFields = phase === 'gas' ? VOL_FIELDS_GAS : VOL_FIELDS_OIL;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <Helmet><title>Recovery Factor Estimator | Petrolord Suite</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/reservoir" className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="p-2 rounded-lg bg-lime-500/10 border border-lime-500/30"><Percent className="w-6 h-6 text-lime-400" /></div>
            <div>
              <h1 className="text-2xl font-bold">Recovery Factor Estimator</h1>
              <p className="text-sm text-slate-400">Estimate recovery factor and convert OOIP / OGIP into recoverable reserves.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadSample}><Beaker className="w-4 h-4 mr-1" /> Sample</Button>
            <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}><HelpCircle className="w-4 h-4 mr-1" /> Help</Button>
          </div>
        </div>

        {/* Phase toggle */}
        <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
          {['oil', 'gas'].map((p) => (
            <button
              key={p}
              onClick={() => switchPhase(p)}
              className={`px-5 py-2 text-sm font-medium capitalize transition-colors ${phase === p ? 'bg-lime-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi title="Recovery Factor" value={fmtPct(result.rf)} accent />
          <Kpi title="RF Range (analog)" value={`${fmtPct(result.rfLow)} – ${fmtPct(result.rfHigh)}`} />
          <Kpi title={phase === 'gas' ? 'OGIP' : 'OOIP'} value={fmtInPlace(inPlace, phase)} />
          <Kpi title="Recoverable Reserves" value={fmtRes(result.reserves, phase)} accent />
        </div>

        {/* Warnings */}
        {result.warnings?.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: inputs */}
          <div className="space-y-6">
            {/* In-place */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4 text-lime-400" /> In-place volume</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="inline-flex rounded-md border border-slate-700 overflow-hidden text-xs">
                  {[['volumetric', 'Compute from volumetrics'], ['direct', 'Enter directly']].map(([m, lbl]) => (
                    <button key={m} onClick={() => setInPlaceMode(m)}
                      className={`px-3 py-1.5 ${inPlaceMode === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {inPlaceMode === 'direct' ? (
                  <Field label={phase === 'gas' ? 'OGIP (scf)' : 'OOIP (STB)'} value={ooipDirect} onChange={setOoipDirect} />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {volFields.map(([k, lbl, unit]) => (
                      <Field key={k} label={`${lbl} (${unit})`} value={vol[k] ?? ''} onChange={(v) => setVol((p) => ({ ...p, [k]: v }))} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Method */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Calculator className="w-4 h-4 text-lime-400" /> Method</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {METHODS[phase].map((m) => (
                    <button key={m.code} onClick={() => setMethod(m.code)}
                      className={`px-3 py-1.5 rounded-md text-xs border ${method === m.code ? 'bg-lime-600 border-lime-500 text-white' : 'border-slate-700 text-slate-400 hover:text-white'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Drive mechanism (analog band always shown) */}
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Primary drive mechanism (sets analog band)</Label>
                  <select value={driveCode} onChange={(e) => setDriveCode(e.target.value)}
                    className="w-full h-9 rounded-md bg-slate-800 border border-slate-700 px-2 text-sm">
                    {drives.map((d) => <option key={d.code} value={d.code}>{d.label} ({fmtPct(d.low)}–{fmtPct(d.high)})</option>)}
                  </select>
                  {result.analog?.notes && <p className="text-xs text-slate-500">{result.analog.notes}</p>}
                </div>

                {/* Correlation inputs */}
                {corrFields.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                    {corrFields.map(([k, lbl, unit]) => (
                      <Field key={k} label={`${lbl} (${unit})`} value={corr[k] ?? ''} onChange={(v) => setCorr((p) => ({ ...p, [k]: v }))} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: chart + reference */}
          <div className="space-y-6">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-base">Recoverable reserves range</CardTitle></CardHeader>
              <CardContent className="p-0">
                {chartData.length ? (
                  <ChartFrame height={260}>
                    <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                      <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                        tickFormatter={(v) => (phase === 'gas' ? (v / 1e9).toFixed(1) : (v / 1e6).toFixed(0))} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                        formatter={(v) => [fmtRes(v, phase), 'Reserves']} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        <LabelList dataKey="value" position="top" formatter={(v) => fmtRes(v, phase)}
                          style={{ fill: CHART_COLORS.axisText, fontSize: 11 }} />
                      </Bar>
                    </BarChart>
                  </ChartFrame>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
                    Enter an in-place volume and pick a method to see the reserves range.
                  </div>
                )}
                <p className="text-xs text-slate-500 px-6 pb-4">
                  Y-axis in {phase === 'gas' ? 'Bscf' : 'MMSTB'}. Low/High use the analog band for the selected drive mechanism; Estimate uses the selected method.
                </p>
              </CardContent>
            </Card>

            {/* Reference table */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-base">{phase === 'gas' ? 'Gas' : 'Oil'} drive-mechanism reference</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                      <th className="text-left py-1.5 font-medium">Mechanism</th>
                      <th className="text-right font-medium">Low</th>
                      <th className="text-right font-medium">Typical</th>
                      <th className="text-right font-medium">High</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drives.map((d) => (
                      <tr key={d.code} className={`border-b border-slate-800/60 ${d.code === driveCode ? 'bg-lime-500/5' : ''}`}>
                        <td className="py-1.5 text-slate-200">{d.label}</td>
                        <td className="text-right font-mono text-slate-400">{fmtPct(d.low)}</td>
                        <td className="text-right font-mono text-emerald-400">{fmtPct(d.typical)}</td>
                        <td className="text-right font-mono text-slate-400">{fmtPct(d.high)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 mt-3 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Indicative screening ranges from industry literature — confirm against reservoir-specific data and simulation.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <RecoveryFactorHelpGuide isOpen={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

const Kpi = ({ title, value, accent }) => (
  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
    <Card className={`bg-slate-900 border-slate-800 ${accent ? 'ring-1 ring-lime-500/30' : ''}`}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
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
