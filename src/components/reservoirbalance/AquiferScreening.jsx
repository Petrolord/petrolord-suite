// Aquifer tab, Screening segment (MB4) — the absorbed Aquifer Influx
// Calculator. Ported from the retired standalone page
// (src/pages/apps/AquiferInfluxCalculator.jsx) onto the Material Balance
// Studio: same client engine (src/utils/aquiferInfluxCalculations.js, the
// MB2 Dake-gated one), same three methods, plus what absorption enables:
//   - the pressure history seeds from the case's production data,
//   - Carter-Tracy takes the finite-aquifer radius ratio reD (MB2),
//   - a server-comparison overlay shows the engine's We from the last run,
//   - "Use in model" writes the screened parameters into the case's default
//     run config (jest-guarded mapping in lib/aquiferScreeningMapping.js).
import React, { useMemo, useState } from 'react';
import {
  Beaker, Info, AlertTriangle, Settings2, Calculator, Plus, Trash2,
  Download, ArrowRightCircle,
} from 'lucide-react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { computeInflux, sampleAquiferData } from '@/utils/aquiferInfluxCalculations';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { upsertCaseDefaultConfig, updateCase } from '@/pages/apps/reservoir-balance/lib/api';
import { mapScreeningToAquiferParams } from '@/pages/apps/reservoir-balance/lib/aquiferScreeningMapping';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import UnitField from './UnitField';

const METHODS = [
  { code: 'veh', label: 'van Everdingen-Hurst', blurb: 'Rigorous constant-terminal-pressure superposition for a radial (edge) aquifer. The reference method.' },
  { code: 'carter-tracy', label: 'Carter-Tracy', blurb: 'Marching approximation to vEH. Set the radius ratio for a finite aquifer; leave blank for effectively infinite.' },
  { code: 'fetkovich', label: 'Fetkovich', blurb: 'Finite-aquifer productivity-index method. Needs aquifer volume W and index J (or geometry to derive them).' },
];

// [key, label, quantity of lib/mbalUnits or null, unit text]. The screening
// engine works in oilfield units; a field shows and takes the display unit.
const PARAM_FIELDS = [
  ['k', 'Permeability k', null, 'mD'],
  ['muw', 'Water viscosity', 'viscosity', ''],
  ['phi', 'Porosity', null, 'fraction'],
  ['ct', 'Total compressibility ct', 'compressibility', ''],
  ['h', 'Aquifer thickness h', 'depth', ''],
  ['rR', 'Reservoir radius rR', 'depth', ''],
  ['theta', 'Encroachment angle', null, 'degrees'],
];

const FETKOVICH_FIELDS = [
  ['re', 'Aquifer outer radius re', 'depth', ''],
  ['W', 'Aquifer volume W (optional)', 'resVolumeMM', ''],
  ['J', 'Productivity index J (optional)', 'aquiferIndex', ''],
];

const s = (o) => Object.fromEntries(
  Object.entries(o).map(([k, v]) => [k, v == null ? '' : String(v)]),
);

const fmtNum = (v, d = 0) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : v.toLocaleString('en-US', { maximumFractionDigits: d }));

// Aquifer strength is a classification, so it reads in the text colour
// (the design system keeps colour for status); "none" is muted.
const LEVEL_COLOR = {
  none: 'text-pl-muted', weak: 'text-pl-text', moderate: 'text-pl-text',
  strong: 'text-pl-text', active: 'text-pl-text',
};

// Case production data -> screening pressure history rows (t in days from the
// first observation). Requires dated rows; undated (pot-style) data cannot
// seed a time-marching screen.
export function historyFromProductionData(productionData) {
  const dated = (productionData ?? []).filter(
    (r) => r.observation_date && Number.isFinite(r.pressure_psia),
  );
  if (dated.length < 2) return null;
  const t0 = new Date(dated[0].observation_date).getTime();
  if (!Number.isFinite(t0)) return null;
  return dated.map((r) => ({
    t: Math.round((new Date(r.observation_date).getTime() - t0) / 86_400_000),
    p: r.pressure_psia,
  }));
}

const AquiferScreening = () => {
  const { toast } = useToast();
  const {
    caseId, caseData, lastResult, applyCasePatch, refreshRunInputs, units,
  } = useMaterialBalanceStudio();
  const weScale = units.scaled('resVolume', 1e6); // We in millions, on the axis and in the table
  const fmtWe = (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : `${weScale.to(v).toLocaleString('en-US', { maximumFractionDigits: 3 })} ${weScale.label}`);
  const fmtRate = (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : `${units.to('resRate', v).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${units.label('resRate')}`);
  const pDigits = units.unit('pressure') === 'psi' || units.unit('pressure') === 'kPa' ? 0 : 2;

  const sample = sampleAquiferData();
  const [method, setMethod] = useState('carter-tracy');
  const [params, setParams] = useState(s({ ...sample.params, reD: '' }));
  const [rows, setRows] = useState(() => {
    const seeded = historyFromProductionData(caseData?.production_data);
    const src = seeded ?? sample.history;
    return src.map((r) => ({ t: String(r.t), p: String(r.p) }));
  });
  const [applying, setApplying] = useState(false);

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
    () => (result.series || []).map((pt) => ({ t: pt.t, p: units.to('pressure', pt.p), We: weScale.to(pt.We) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, units],
  );

  // Server-comparison overlay: the last run's We history (rb_results
  // plot_data.We, reservoir barrels) against days from the first observation.
  const serverSeries = useMemo(() => {
    const we = lastResult?.plot_data?.We;
    if (!Array.isArray(we) || !we.some((v) => Number.isFinite(v) && v > 0)) return null;
    const t = historyFromProductionData(caseData?.production_data);
    if (!t || t.length !== we.length) return null;
    return t.map((row, i) => ({ t: row.t, WeServer: weScale.to(we[i] ?? 0) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult, caseData, units]);

  const currentMethod = METHODS.find((m) => m.code === method);
  const finalTD = result.series?.length ? result.series[result.series.length - 1].tD : null;

  const setParam = (k, v) => setParams((p) => ({ ...p, [k]: v }));
  const setRow = (i, key, v) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, { t: '', p: '' }]);
  const delRow = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const loadFromCase = () => {
    const seeded = historyFromProductionData(caseData?.production_data);
    if (!seeded) {
      toast({
        title: 'No dated pressure history',
        description: 'The case needs at least two production rows with observation dates and pressures.',
        variant: 'destructive',
      });
      return;
    }
    setRows(seeded.map((r) => ({ t: String(r.t), p: String(r.p) })));
    toast({ title: 'Case history loaded', description: `${seeded.length} pressure points from the Data tab.` });
  };

  const loadSample = () => {
    const d = sampleAquiferData();
    setParams(s({ ...d.params, reD: '' }));
    setRows(d.history.map((r) => ({ t: String(r.t), p: String(r.p) })));
    toast({ title: 'Sample loaded', description: 'An edge-water-drive aquifer case is ready.' });
  };

  const exportCsv = () => {
    // the display units, named in the header
    const lines = [`Time (days),Pressure (${units.label('pressure')}),We (${units.label('resVolume')})`];
    (result.series || []).forEach((pt) => lines.push(`${pt.t},${parseFloat(units.to('pressure', pt.p).toPrecision(8))},${parseFloat(units.to('resVolume', pt.We).toPrecision(8))}`));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aquifer_influx.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const applyToModel = async () => {
    const mapped = mapScreeningToAquiferParams(method, numericParams, result);
    if (!mapped) {
      toast({
        title: 'Cannot apply',
        description: 'Fill the screening parameters the selected method needs first.',
        variant: 'destructive',
      });
      return;
    }
    setApplying(true);
    const { error } = await upsertCaseDefaultConfig(caseId, {
      aquifer_model: mapped.aquifer_model,
      aquifer_params: mapped.aquifer_params,
    });
    if (!error && caseData && !caseData.has_aquifer) {
      const res = await updateCase(caseId, { has_aquifer: true });
      if (!res?.error) applyCasePatch?.({ has_aquifer: true });
    }
    setApplying(false);
    if (error) {
      toast({ title: 'Apply failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Aquifer model applied', description: `${mapped.note} The next run uses it.` });
    // re-read the run settings without reloading the case: a file waiting on the Data tab stays there
    refreshRunInputs?.();
  };

  const cls = result.classification || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Influx method"
          value={method}
          onValueChange={setMethod}
          options={METHODS.map((m) => ({ value: m.code, label: m.label }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadFromCase}>Load case history</Button>
          <Button variant="outline" size="sm" onClick={loadSample}><Beaker className="w-4 h-4 mr-1" /> Sample</Button>
          <Button size="sm" onClick={applyToModel} disabled={applying || !!result.error}>
            <ArrowRightCircle className="w-4 h-4 mr-1" /> Use in model
          </Button>
        </div>
      </div>
      {currentMethod && <p className="text-xs text-pl-muted">{currentMethod.blurb}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Cumulative Influx We" value={fmtWe(result.cumulativeWe)} accent />
        <Kpi title="Latest Influx Rate" value={fmtRate(result.rate)} />
        <Kpi title="Aquifer Strength" value={cls.label || EMPTY_VALUE} valueClass={LEVEL_COLOR[cls.level] || 'text-pl-text'} word />
        <Kpi title={method === 'fetkovich' ? 'Encroachable Water Wei' : 'Final tD'}
          value={method === 'fetkovich' ? fmtWe(result.Wei) : fmtNum(finalTD, 1)} />
      </div>

      {result.error && (
        <div className="flex items-start gap-3 rounded-lg border border-pl-warning/40 bg-pl-warning-bg px-4 py-3 text-pl-warning-text">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">{result.error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: parameters + history */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4 text-pl-muted" /> Aquifer parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {PARAM_FIELDS.map(([k, lbl, quantity, unitText]) => (
                  <UnitField key={k} testId={`mbal-screen-${k}`} label={lbl} quantity={quantity} unitText={unitText} units={units}
                    value={params[k] === '' || params[k] == null ? null : Number(params[k])} onCommit={(v) => setParam(k, v == null ? '' : String(v))} />
                ))}
                {method === 'carter-tracy' && (
                  <UnitField testId="mbal-screen-reD" label="Radius ratio reD" unitText="aquifer over reservoir"
                    value={params.reD === '' || params.reD == null ? null : Number(params.reD)} onCommit={(v) => setParam('reD', v == null ? '' : String(v))} placeholder="blank: infinite" />
                )}
              </div>
              {method === 'carter-tracy' && (
                <p className="text-xs text-pl-muted flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  With reD set, the march uses the exact bounded-circle pD (the Dake Exercise 9.2 benchmark path). Blank keeps the infinite-acting line source.
                </p>
              )}
              {method === 'fetkovich' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-pl-border">
                  {FETKOVICH_FIELDS.map(([k, lbl, quantity, unitText]) => (
                    <UnitField key={k} testId={`mbal-screen-${k}`} label={lbl} quantity={quantity} unitText={unitText} units={units}
                      value={params[k] === '' || params[k] == null ? null : Number(params[k])} onCommit={(v) => setParam(k, v == null ? '' : String(v))} />
                  ))}
                </div>
              )}
              {method === 'fetkovich' && (
                <p className="text-xs text-pl-muted flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Leave W and J blank to derive them from the geometry (outer radius, reservoir radius, angle, porosity, thickness, permeability and water viscosity) for a radial aquifer with a no-flow outer boundary.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><Calculator className="w-4 h-4 text-pl-muted" /> Boundary-pressure history</CardTitle>
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={exportCsv}><Download className="w-3.5 h-3.5" /></Button>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-pl-surface">
                    <tr className="text-pl-muted border-b border-pl-border">
                      <th className="text-left py-1.5 font-medium">Time (days)</th>
                      <th className="text-left font-medium">Pressure ({units.label('pressure')})</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-pl-border">
                        <td className="py-1 pr-2">
                          <UnitField bare label={`Time, row ${i + 1}`} value={r.t === '' ? null : Number(r.t)} onCommit={(v) => setRow(i, 't', v == null ? '' : String(v))} inputClassName="text-sm font-sans" />
                        </td>
                        <td className="py-1 pr-2">
                          <UnitField bare label={`Pressure, row ${i + 1}`} quantity="pressure" units={units} value={r.p === '' ? null : Number(r.p)} onCommit={(v) => setRow(i, 'p', v == null ? '' : String(v))} inputClassName="text-sm font-sans" />
                        </td>
                        <td className="text-center">
                          <button type="button" aria-label={`Delete row ${i + 1}`} onClick={() => delRow(i)} className="text-pl-muted hover:text-pl-danger-text"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" className="mt-3 h-8" onClick={addRow}><Plus className="w-3.5 h-3.5 mr-1" /> Add row</Button>
              <p className="text-xs text-pl-muted mt-2">The first row is the initial pressure at time zero, where the influx is zero. Load case history brings the dated pressures of the Data tab. The sheet opens on a sample aquifer: type the parameters of the reservoir before using its numbers.</p>
            </CardContent>
          </Card>
        </div>

        {/* Right: chart + results */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Water influx &amp; pressure history</CardTitle></CardHeader>
            <CardContent className="p-0">
              {chartData.length >= 2 ? (
                <ChartFrame height={300} logoHeight={24} exportFilename="aquifer-screening-influx">
                  <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      label={{ value: 'Time (days)', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }} />
                    <YAxis yAxisId="we" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      label={{ value: `We (${weScale.label})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }} />
                    <YAxis yAxisId="p" orientation="right" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      domain={['auto', 'auto']}
                      label={{ value: `Pressure (${units.label('pressure')})`, angle: 90, position: 'insideRight', fill: CHART_COLORS.axisText, fontSize: 11 }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                      formatter={(v, name) => {
                        if (name === 'We (screening)' || name === 'We (last run)') return [`${fmtNum(v, 3)} ${weScale.label}`, name];
                        return [`${fmtNum(v, pDigits)} ${units.label('pressure')}`, 'Pressure'];
                      }}
                      labelFormatter={(t) => `t = ${t} d`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="we" type="monotone" dataKey="We" name="We (screening)" stroke="#0284c7" fill="#0284c7" fillOpacity={0.15} strokeWidth={2} />
                    {serverSeries && (
                      <Line yAxisId="we" data={serverSeries} dataKey="WeServer" name="We (last run)"
                        stroke="#16a34a" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                    )}
                    <Line yAxisId="p" type="monotone" dataKey="p" name="Pressure" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ChartFrame>
              ) : (
                <div className="h-72 flex items-center justify-center text-pl-muted text-sm px-6 text-center">
                  Enter at least two pressure points to compute a water-influx history.
                </div>
              )}
              {serverSeries && (
                <p className="text-xs text-pl-muted px-6 pb-2">
                  The dashed line is the server engine&apos;s We from the last completed run. Screening and run We should broadly agree when the same model and parameters are applied; small differences reflect the two implementations (exact bounded-circle pD here, blended pD in the server march).
                </p>
              )}
              {cls.note && <p className="text-xs text-pl-muted px-6 pb-4">{cls.note}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Influx results</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-pl-muted border-b border-pl-border">
                    <th className="text-left py-1.5 font-medium">t (days)</th>
                    <th className="text-right font-medium">p ({units.label('pressure')})</th>
                    {method !== 'fetkovich' && <th className="text-right font-medium">tD</th>}
                    <th className="text-right font-medium">We ({weScale.label})</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.series || []).map((pt, i) => (
                    <tr key={i} className="border-b border-pl-border">
                      <td className="py-1.5 text-pl-text">{fmtNum(pt.t, 0)}</td>
                      <td className="text-right font-mono text-pl-muted">{fmtNum(units.to('pressure', pt.p), pDigits)}</td>
                      {method !== 'fetkovich' && <td className="text-right font-mono text-pl-muted">{fmtNum(pt.tD, 1)}</td>}
                      <td className="text-right font-mono text-pl-text">{weScale.to(pt.We).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-pl-muted mt-3 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Screening estimate. Use in model writes these parameters to the case; the history-matched run remains the authority for reserves work.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Numbers in the mono face; a word value (the strength class) stays in sans.
const Kpi = ({ title, value, accent, valueClass, word = false }) => (
  <Card className={accent ? 'border-pl-primary/60 ring-1 ring-pl-primary/30' : undefined}>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-pl-muted">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${word ? '' : 'font-pl-mono tabular-nums'} ${valueClass || 'text-pl-text'}`}>{value}</div>
    </CardContent>
  </Card>
);

export default AquiferScreening;
