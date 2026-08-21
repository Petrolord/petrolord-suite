import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, GitCompare, DollarSign, TrendingUp, Clock, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { CONFIG_SECTIONS, labelForConfigKey, unitForConfigKey, formatConfigValue } from './epeConfigLabels';

// Wave D (audit 4.6): comparison is capped so the table and chart stay
// readable; six runs also matches the series palette below.
const MAX_COMPARE = 6;

// Distinguishable line hues on the white chart surface (from the validated
// stream-palette hues in chartTheme).
const SERIES_COLORS = ['#2563eb', '#059669', '#d97706', '#a21caf', '#0891b2', '#9f1239'];

const AXIS_TICK = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };

const EpeRunComparison = () => {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [availableRuns, setAvailableRuns] = useState([]);
  const [selectedRunIds, setSelectedRunIds] = useState([]);
  const [comparisonResults, setComparisonResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingComparison, setLoadingComparison] = useState(false);

  useEffect(() => {
    const fetchRuns = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Authentication Error', description: 'Could not get user.', variant: 'destructive' });
        navigate('/login');
        return;
      }

      const { data, error } = await supabase
        .from('epe_runs')
        .select('id, run_name, created_at')
        .eq('case_id', caseId)
        .eq('user_id', user.id)
        // Wave A: failed/running runs have no results to compare
        .or('status.is.null,status.eq.complete')
        .order('created_at', { ascending: false });

      if (error) {
        toast({ title: 'Error fetching runs', description: error.message, variant: 'destructive' });
      } else {
        setAvailableRuns(data);
      }
      setLoading(false);
    };
    fetchRuns();
  }, [caseId, toast, navigate]);

  const handleCheckboxChange = (runId) => {
    setSelectedRunIds(prev => {
      if (prev.includes(runId)) return prev.filter(id => id !== runId);
      if (prev.length >= MAX_COMPARE) {
        toast({ title: 'Selection limit', description: `Compare up to ${MAX_COMPARE} runs at a time. Deselect one to add another.` });
        return prev;
      }
      return [...prev, runId];
    });
  };

  const handleCompare = async () => {
    if (selectedRunIds.length < 2) {
      toast({ title: 'Selection Error', description: 'Please select at least two runs to compare.', variant: 'destructive' });
      return;
    }
    setLoadingComparison(true);
    setComparisonResults([]);

    try {
      const fetchedResults = await Promise.all(
        selectedRunIds.map(async (runId) => {
          const { data: runData, error: runError } = await supabase
            .from('epe_runs')
            .select('run_name, run_config_id')
            .eq('id', runId)
            .single();
          if (runError) throw new Error(`Failed to fetch run name for ${runId}: ${runError.message}`);

          // maybeSingle: a run whose engine call failed has no results row;
          // show it as "no results" instead of failing the whole comparison.
          const { data: resultData, error: resultError } = await supabase
            .from('epe_results')
            .select('kpis, cash_flow_data')
            .eq('run_id', runId)
            .maybeSingle();
          if (resultError) throw new Error(`Failed to fetch results for run ${runId}: ${resultError.message}`);

          let config = null;
          if (runData.run_config_id) {
            const { data: cfgData } = await supabase
              .from('epe_run_configs')
              .select('*')
              .eq('id', runData.run_config_id)
              .maybeSingle();
            config = cfgData || null;
          }

          return {
            id: runId,
            name: runData.run_name,
            kpis: resultData?.kpis || null,
            cashFlowData: Array.isArray(resultData?.cash_flow_data) ? resultData.cash_flow_data : null,
            config,
          };
        })
      );
      setComparisonResults(fetchedResults);
    } catch (error) {
      console.error('Comparison failed:', error);
      toast({ title: 'Comparison Failed', description: error.message || 'An error occurred during comparison.', variant: 'destructive' });
    } finally {
      setLoadingComparison(false);
    }
  };

  const formatCurrency = (value) => {
    if (typeof value !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(value);
  };

  // Wave D: deltas vs run 1 for every numeric KPI row, in the row's own unit.
  const formatDelta = (d, kind) => {
    const sign = d >= 0 ? '+' : '';
    switch (kind) {
      case 'currency': return `${sign}${formatCurrency(d)}`;
      case 'pp': return `${sign}${d.toFixed(2)} pp`;
      case 'years': return `${sign}${d.toFixed(2)} yrs`;
      case 'usdbbl': return `${sign}$${d.toFixed(1)}/bbl`;
      default: return `${sign}${d}`;
    }
  };

  // KPI row specs shared by the table and the CSV export. `num` extracts the
  // numeric value used for deltas; `get`+`fmt` produce the display value.
  const KPI_ROWS = [
    { label: 'NPV', icon: <DollarSign className="w-4 h-4 mr-2 text-green-400" />, get: (k) => k?.npv, num: (k) => k?.npv, fmt: formatCurrency, delta: 'currency' },
    { label: 'IRR', icon: <TrendingUp className="w-4 h-4 mr-2 text-blue-400" />, get: (k) => k?.irr, num: (k) => k?.irr, fmt: (v) => v != null ? `${v.toFixed(2)}%` : 'N/A', delta: 'pp' },
    {
      label: 'Payback', icon: <Clock className="w-4 h-4 mr-2 text-orange-400" />,
      get: (k) => (typeof k?.payback_years === 'number' ? k.payback_years : (k?.payback ?? null)),
      num: (k) => (typeof k?.payback_years === 'number' ? k.payback_years : null),
      fmt: (v) => (typeof v === 'number' ? `${v.toFixed(2)} years` : (v ?? 'N/A')),
      delta: 'years',
    },
    { label: 'Breakeven oil price', get: (k) => k?.breakeven_oil_price_usd_bbl, num: (k) => k?.breakeven_oil_price_usd_bbl, fmt: (v) => v != null ? `$${Number(v).toFixed(1)}/bbl` : '—', delta: 'usdbbl' },
    { label: 'Government take', get: (k) => k?.government_take_pct, num: (k) => k?.government_take_pct, fmt: (v) => v != null ? `${Number(v).toFixed(1)}%` : '—', delta: 'pp' },
    { label: 'Government take (discounted)', get: (k) => k?.government_take_pct_discounted, num: (k) => k?.government_take_pct_discounted, fmt: (v) => v != null ? `${Number(v).toFixed(1)}%` : '—', delta: 'pp' },
    { label: 'Total revenue', get: (k) => k?.total_revenue, num: (k) => k?.total_revenue, fmt: formatCurrency, delta: 'currency' },
    { label: 'Total CAPEX', get: (k) => k?.total_capex, num: (k) => k?.total_capex, fmt: formatCurrency, delta: 'currency' },
    { label: 'Total OPEX', get: (k) => k?.total_opex, num: (k) => k?.total_opex, fmt: formatCurrency, delta: 'currency' },
    { label: 'Total tax', get: (k) => k?.total_tax, num: (k) => k?.total_tax, fmt: formatCurrency, delta: 'currency' },
  ];

  // Wave D: cumulative net cash flow overlay. One series per run keyed by a
  // unique display name; missing years stay undefined so lines simply end.
  const overlay = useMemo(() => {
    const withData = comparisonResults.filter(r => r.cashFlowData && r.cashFlowData.length > 0);
    if (withData.length === 0) return null;
    const seen = new Map();
    const series = withData.map((r) => {
      const n = (seen.get(r.name) || 0) + 1;
      seen.set(r.name, n);
      return { ...r, seriesKey: n > 1 ? `${r.name} (${n})` : r.name };
    });
    const byYear = new Map();
    for (const run of series) {
      for (const row of run.cashFlowData) {
        const cum = typeof row.cumulative_nominal === 'number' ? row.cumulative_nominal : row.cumulative_cash_flow;
        if (typeof row.year !== 'number' || typeof cum !== 'number') continue;
        if (!byYear.has(row.year)) byYear.set(row.year, { year: row.year });
        byYear.get(row.year)[run.seriesKey] = cum;
      }
    }
    return {
      series,
      data: Array.from(byYear.values()).sort((a, b) => a.year - b.year),
    };
  }, [comparisonResults]);

  // Wave D: labeled CSV of everything on screen (config, KPIs, deltas).
  const downloadCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const base = comparisonResults[0];
    const lines = [];
    lines.push(['Metric', ...comparisonResults.map(r => r.name)].map(esc).join(','));

    lines.push(esc('CONFIGURATION'));
    for (const section of CONFIG_SECTIONS) {
      for (const [key] of section.fields) {
        if (section.regime && !comparisonResults.some(r => r.config?.fiscal_regime === section.regime)) continue;
        const values = comparisonResults.map(r => formatConfigValue(key, r.config?.[key]));
        if (values.every(v => v === null)) continue;
        const unit = unitForConfigKey(key);
        const label = unit && unit !== 'table' ? `${labelForConfigKey(key)} (${unit})` : labelForConfigKey(key);
        lines.push([label, ...values.map(v => v ?? '')].map(esc).join(','));
      }
    }

    lines.push(esc('RESULTS'));
    for (const row of KPI_ROWS) {
      lines.push([row.label, ...comparisonResults.map(r => r.kpis ? row.fmt(row.get(r.kpis)) : 'no results')].map(esc).join(','));
      const baseNum = row.num(base?.kpis);
      if (typeof baseNum === 'number') {
        const deltas = comparisonResults.map((r, i) => {
          if (i === 0) return 'base';
          const v = row.num(r.kpis);
          return typeof v === 'number' ? formatDelta(v - baseNum, row.delta) : '';
        });
        lines.push([`${row.label} vs ${base.name}`, ...deltas].map(esc).join(','));
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'epe-run-comparison.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet><title>Compare Runs - Petroleum Economics Studio</title></Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link to={`/dashboard/apps/economics/epe/cases/${caseId}`}>
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Case Details</Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-3 rounded-xl"><GitCompare className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-4xl font-bold text-white">Compare Economic Runs</h1>
              <p className="text-lime-200 text-lg">Select runs to compare for Case ID: {caseId}</p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-1">Available Runs</h2>
          <p className="text-sm text-slate-400 mb-4">Pick 2 to {MAX_COMPARE} runs. The first selected run is the comparison base.</p>
          {loading ? (
            <div className="text-center py-8 text-white">Loading runs...</div>
          ) : availableRuns.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No runs available for this case.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableRuns.map(run => (
                <div key={run.id} className="flex items-center space-x-2 bg-gray-800 p-3 rounded-md">
                  <Checkbox
                    id={run.id}
                    checked={selectedRunIds.includes(run.id)}
                    onCheckedChange={() => handleCheckboxChange(run.id)}
                    className="border-slate-500 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                  />
                  <label htmlFor={run.id} className="text-white cursor-pointer flex-grow">
                    {run.run_name} <span className="text-xs text-slate-400">({new Date(run.created_at).toLocaleDateString()})</span>
                  </label>
                </div>
              ))}
            </div>
          )}
          <Button onClick={handleCompare} disabled={selectedRunIds.length < 2 || loadingComparison} className="mt-6 w-full bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600">
            {loadingComparison ? 'Comparing...' : 'Compare Selected Runs'}
          </Button>
        </motion.div>

        {comparisonResults.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">Comparison Results</h2>
              <Button variant="outline" size="sm" onClick={downloadCsv}>
                <Download className="w-4 h-4 mr-2" /> Download comparison (CSV)
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-white">Metric</TableHead>
                  {comparisonResults.map(run => (
                    <TableHead key={run.id} className="text-white">{run.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* What differs between the configs (the old table showed
                    results with no way to see WHY they differ) */}
                {[
                  ['Fiscal regime', (r) => formatConfigValue('fiscal_regime', r.config?.fiscal_regime) ?? '—'],
                  ['Oil price', (r) => r.config?.oil_price_usd_bbl != null ? `$${r.config.oil_price_usd_bbl}/bbl` : '—'],
                  ['Gas price', (r) => r.config?.gas_price_usd_mscf != null ? `$${r.config.gas_price_usd_mscf}/mscf` : '—'],
                  ['Discount rate', (r) => r.config?.discount_rate_pct != null ? `${r.config.discount_rate_pct}%` : '—'],
                  ['Base year / PV basis', (r) => r.config ? `${r.config.base_year ?? '—'} / ${r.config.present_value_basis ?? '—'}` : '—'],
                ].map(([label, get]) => (
                  <TableRow key={label} className="border-slate-800">
                    <TableCell className="text-slate-400 text-sm">{label}</TableCell>
                    {comparisonResults.map(run => (
                      <TableCell key={run.id} className="text-slate-300 text-sm">{get(run)}</TableCell>
                    ))}
                  </TableRow>
                ))}

                {KPI_ROWS.map(({ label, icon, get, num, fmt, delta }) => {
                  const baseNum = num(comparisonResults[0]?.kpis);
                  return (
                    <TableRow key={label} className="border-slate-800">
                      <TableCell className="font-medium text-white"><span className="flex items-center">{icon}{label}</span></TableCell>
                      {comparisonResults.map((run, i) => {
                        if (run.kpis === null) {
                          return <TableCell key={run.id} className="text-slate-500 italic">no results</TableCell>;
                        }
                        const v = get(run.kpis);
                        const n = num(run.kpis);
                        const d = i > 0 && typeof n === 'number' && typeof baseNum === 'number' ? n - baseNum : null;
                        return (
                          <TableCell key={run.id} className="text-lime-300">
                            {fmt(v)}
                            {d !== null && (
                              <span className={`block text-xs ${d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatDelta(d, delta)} vs {comparisonResults[0].name}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Wave D: cumulative net cash flow overlay */}
            {overlay && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-white mb-2">Cumulative net cash flow</h3>
                <ChartFrame height={340} logoHeight={24} exportFilename="epe-comparison-cumulative-ncf">
                  <LineChart data={overlay.data} margin={CHART_MARGINS.legend}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="year" tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} />
                    <YAxis tickFormatter={formatCurrency} tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} width={90} />
                    <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} labelFormatter={(y) => `Year ${y}`} />
                    <Legend {...LEGEND_PROPS} />
                    {overlay.series.map((run, i) => (
                      <Line
                        key={run.id}
                        type="monotone"
                        dataKey={run.seriesKey}
                        stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ChartFrame>
                <p className="text-xs text-slate-500 mt-1">
                  Nominal cumulative net cash flow per run. Runs without stored yearly data are not plotted.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </>
  );
};

export default EpeRunComparison;
