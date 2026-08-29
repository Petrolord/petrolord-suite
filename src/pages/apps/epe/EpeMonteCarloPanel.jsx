import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Download, Plus, X } from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend as RLegend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import TornadoChart from '@/pages/apps/ReservoirCalcPro/components/results/TornadoChart';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';

// Risk (Monte Carlo) tab for the EPE results viewer (D2,
// docs/scope/Economics-ROADMAP.md). Sampling and fiscal math run
// server-side in the epe-monte-carlo edge function; this panel only
// configures distributions and renders the returned summaries.
//
// Wave C (docs/scope/EPE-Industry-Audit.md 3.3/3.4/3.5/3.7): per-variable
// distribution types (the sampler always supported four; the UI now exposes
// them), an editable correlation list, IRR and payback distributions,
// NPV standard error + convergence trace, and a CSV results export.

const VAR_LABELS = {
  oil_price: 'Oil price ($/bbl)',
  gas_price: 'Gas price ($/mscf)',
  capex_scale: 'CAPEX multiplier',
  opex_scale: 'OPEX multiplier',
  production_scale: 'Production multiplier',
};
const VAR_KEYS = Object.keys(VAR_LABELS);

const DIST_TYPES = [
  ['triangular', 'Triangular'],
  ['uniform', 'Uniform'],
  ['normal', 'Normal'],
  ['lognormal', 'Lognormal'],
];

// Which numeric cells each distribution type shows. Normal and lognormal are
// parameterized by mean and standard deviation (value space); their Low/High
// act as optional truncation bounds, matching the sampler's Dist contract.
const CELLS_BY_TYPE = {
  triangular: [['min', 'Low'], ['mode', 'Most likely'], ['max', 'High']],
  uniform: [['min', 'Low'], ['max', 'High']],
  normal: [['mean', 'Mean'], ['stdDev', 'Std dev'], ['min', 'Low (opt.)'], ['max', 'High (opt.)']],
  lognormal: [['mean', 'Mean'], ['stdDev', 'Std dev'], ['min', 'Low (opt.)'], ['max', 'High (opt.)']],
};

const fmtM = (n) => {
  if (n == null || isNaN(n)) return 'N/A';
  const m = n / 1e6;
  if (Math.abs(m) >= 1000) return `$${(m / 1000).toFixed(2)}B`;
  return `$${m.toFixed(1)}M`;
};
const fmtPct = (n) => (n == null || isNaN(n) ? 'N/A' : `${Number(n).toFixed(1)}%`);
const fmtYr = (n) => (n == null || isNaN(n) ? 'N/A' : `${Number(n).toFixed(2)} yr`);

const AXIS_TICK = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };

const StatCard = ({ title, value, accent }) => (
  <div className="bg-white/5 p-4 rounded-lg">
    <p className="text-xs text-slate-300 uppercase tracking-wide">{title}</p>
    <p className={`text-2xl font-bold mt-1 ${accent || 'text-white'}`}>{value}</p>
  </div>
);

const DistRow = ({ varKey, spec, onChange }) => (
  <div className="flex flex-wrap items-center gap-3 py-2 border-b border-white/10">
    <label className="flex items-center gap-2 w-56 text-sm text-white">
      <input
        type="checkbox"
        checked={spec.enabled}
        onChange={(e) => onChange(varKey, { ...spec, enabled: e.target.checked })}
        className="accent-lime-400"
      />
      {VAR_LABELS[varKey]}
    </label>
    <select
      value={spec.type}
      disabled={!spec.enabled}
      onChange={(e) => onChange(varKey, { ...spec, type: e.target.value })}
      className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs disabled:opacity-40"
    >
      {DIST_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    {CELLS_BY_TYPE[spec.type].map(([field, label]) => (
      <label key={field} className="text-xs text-slate-300 flex items-center gap-1">
        {label}
        <input
          type="number"
          step="any"
          value={spec[field] ?? ''}
          disabled={!spec.enabled}
          onChange={(e) => onChange(varKey, { ...spec, [field]: e.target.value })}
          className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs disabled:opacity-40"
        />
      </label>
    ))}
  </div>
);

// Validate one variable spec and build its Dist payload; returns
// { dist } or { error }.
const buildDist = (key, spec) => {
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const min = num(spec.min);
  const max = num(spec.max);
  if (spec.type === 'triangular') {
    const mode = num(spec.mode);
    if (min === null || mode === null || max === null || !(min <= mode && mode <= max) || !(max > min)) {
      return { error: `${VAR_LABELS[key]}: Low, Most likely, and High must be increasing.` };
    }
    return { dist: { type: 'triangular', min, mode, max } };
  }
  if (spec.type === 'uniform') {
    if (min === null || max === null || !(max > min)) {
      return { error: `${VAR_LABELS[key]}: High must be greater than Low.` };
    }
    return { dist: { type: 'uniform', min, max } };
  }
  // normal / lognormal
  const mean = num(spec.mean);
  const stdDev = num(spec.stdDev);
  if (mean === null || stdDev === null || !(stdDev > 0)) {
    return { error: `${VAR_LABELS[key]}: Mean and a positive Std dev are required.` };
  }
  if (spec.type === 'lognormal' && !(mean > 0)) {
    return { error: `${VAR_LABELS[key]}: a lognormal mean must be positive.` };
  }
  if (min !== null && max !== null && !(max > min)) {
    return { error: `${VAR_LABELS[key]}: the High truncation bound must exceed the Low bound.` };
  }
  const dist = { type: spec.type, mean, stdDev };
  if (min !== null) dist.min = min;
  if (max !== null) dist.max = max;
  return { dist };
};

const csvEscape = (v) => (v == null ? '' : String(v));

const EpeMonteCarloPanel = ({ runConfigId }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  // Wave E: org sharing is read-only; reviewers see saved results but only
  // the config owner may launch simulations (the edge function enforces
  // this server-side too).
  const isOwnConfig = !cfg?.user_id || !user?.id || cfg.user_id === user.id;
  const [vars, setVars] = useState(null);
  const [iterations, setIterations] = useState(1000);
  // Wave C: editable correlation pairs (the old oil/gas rho 0.7 checkbox is
  // now just the default first row).
  const [correlations, setCorrelations] = useState([{ a: 'oil_price', b: 'gas_price', rho: '0.7' }]);
  // Wave A (audit finding 1.7): a run is only auditable if it can be
  // reproduced. Blank = new random seed; a set seed reproduces the run
  // exactly (the sampler is seeded end to end).
  const [seedInput, setSeedInput] = useState('');
  const [running, setRunning] = useState(false);
  // Per-iteration sample of the most recent run in this session. Saved runs
  // do not carry it, so this is null after reloading one.
  const [samples, setSamples] = useState(null);
  const [mcRun, setMcRun] = useState(null); // { results, created_at, mc_config }

  // Load the run config (for distribution defaults) and the latest saved MC run.
  useEffect(() => {
    if (!runConfigId) return;
    (async () => {
      const { data: cfgRow } = await supabase
        .from('epe_run_configs').select('*').eq('id', runConfigId).single();
      if (cfgRow) {
        setCfg(cfgRow);
        const oil = Number(cfgRow.oil_price_usd_bbl) || 80;
        const gas = Number(cfgRow.gas_price_usd_mscf) || 3;
        const tri = (enabled, min, mode, max) => ({
          enabled, type: 'triangular', min, mode, max, mean: mode, stdDev: '',
        });
        setVars({
          oil_price: tri(true, (oil * 0.7).toFixed(1), oil, (oil * 1.3).toFixed(1)),
          gas_price: tri(false, (gas * 0.7).toFixed(2), gas, (gas * 1.3).toFixed(2)),
          capex_scale: tri(true, 0.8, 1.0, 1.3),
          opex_scale: tri(false, 0.9, 1.0, 1.15),
          production_scale: tri(false, 0.85, 1.0, 1.1),
        });
      }
      const { data: prior } = await supabase
        .from('epe_mc_runs')
        .select('id, results, mc_config, created_at')
        .eq('run_config_id', runConfigId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (prior && prior.length > 0) {
        setMcRun(prior[0]);
        // A reloaded run carries its summary, not its sample.
        setSamples(null);
      }
    })();
  }, [runConfigId]);

  const setVar = (key, spec) => setVars((v) => ({ ...v, [key]: spec }));
  const setCorrCell = (i, key, value) => setCorrelations((rows) =>
    rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const addCorrRow = () => setCorrelations((rows) => [...rows, { a: 'oil_price', b: 'capex_scale', rho: '0.5' }]);
  const delCorrRow = (i) => setCorrelations((rows) => rows.filter((_, idx) => idx !== i));

  const runMonteCarlo = async () => {
    if (!vars) return;
    const variables = {};
    for (const [key, spec] of Object.entries(vars)) {
      if (!spec.enabled) continue;
      const built = buildDist(key, spec);
      if (built.error) {
        toast({ variant: 'destructive', title: 'Check distribution inputs', description: built.error });
        return;
      }
      variables[key] = built.dist;
    }
    if (Object.keys(variables).length === 0) {
      toast({ variant: 'destructive', title: 'No uncertain inputs', description: 'Enable at least one input distribution to run the simulation.' });
      return;
    }
    // Only correlations whose BOTH variables are enabled are sent.
    const activeCorrelations = [];
    for (const row of correlations) {
      if (!variables[row.a] || !variables[row.b] || row.a === row.b) continue;
      const rho = Number(row.rho);
      if (!Number.isFinite(rho) || rho <= -1 || rho >= 1) {
        toast({ variant: 'destructive', title: 'Check correlations', description: `Correlation between ${VAR_LABELS[row.a]} and ${VAR_LABELS[row.b]} must be between -1 and 1 (exclusive).` });
        return;
      }
      activeCorrelations.push({ a: row.a, b: row.b, rho });
    }

    setRunning(true);
    try {
      const mcConfig = { iterations, variables, correlations: activeCorrelations };
      const seedNum = Number(seedInput);
      if (seedInput !== '' && Number.isFinite(seedNum)) mcConfig.seed = Math.floor(seedNum);
      const { data, error } = await supabase.functions.invoke('epe-monte-carlo', {
        body: { run_config_id: runConfigId, mc_config: mcConfig },
      });
      if (error) throw new Error(error.message || 'Monte Carlo run failed.');
      if (data?.error) throw new Error(data.error);
      setMcRun({ results: data.results, mc_config: mcConfig, created_at: new Date().toISOString() });
      // Economics E5: the per-iteration sample comes back with the run but is
      // not stored with it, so it is available for this run only.
      setSamples(Array.isArray(data.samples) ? data.samples : null);
      toast({ title: 'Simulation complete', description: `${data.results.iterations} iterations through the fiscal engine.` });
    } catch (err) {
      console.error('[EpeMonteCarloPanel]', err);
      toast({ variant: 'destructive', title: 'Monte Carlo failed', description: err.message });
    } finally {
      setRunning(false);
    }
  };

  const results = mcRun?.results;

  // Wave C: percentile + CDF + fan tables as a CSV, so results feed decks and
  // models without screenshotting charts.
  const downloadCsv = () => {
    if (!results) return;
    const lines = [];
    lines.push('metric,p90,p50,p10,mean,stddev,se');
    const st = (o) => [o?.p90, o?.p50, o?.p10, o?.mean, o?.stdDev, o?.se].map(csvEscape).join(',');
    lines.push(`npv_usd,${st(results.npv)}`);
    if (results.irr && results.irr.p50 != null) lines.push(`irr_pct,${st(results.irr)}`);
    if (results.payback && results.payback.p50 != null) lines.push(`payback_years,${st(results.payback)}`);
    lines.push('');
    lines.push('metric,value');
    lines.push(`prob_npv_positive,${csvEscape(results.probNpvPositive)}`);
    if (results.irr?.nullShare != null) lines.push(`irr_undefined_share,${csvEscape(results.irr.nullShare)}`);
    if (results.payback?.neverShare != null) lines.push(`payback_never_share,${csvEscape(results.payback.neverShare)}`);
    lines.push(`iterations,${csvEscape(results.iterations)}`);
    lines.push(`seed,${csvEscape(results.seed)}`);
    if (results.npv?.cdf?.length) {
      lines.push('');
      lines.push('npv_cdf_value_usd,cumulative_probability_pct');
      results.npv.cdf.forEach((p) => lines.push(`${p.x},${p.y}`));
    }
    if (results.fan?.ncf?.length) {
      lines.push('');
      lines.push('year,ncf_p90,ncf_p50,ncf_p10,cum_p90,cum_p50,cum_p10');
      results.fan.ncf.forEach((r, i) => {
        const c = results.fan.cumulative?.[i] || {};
        lines.push([r.year, r.p90, r.p50, r.p10, c.p90, c.p50, c.p10].map(csvEscape).join(','));
      });
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'epe-mc-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Export every iteration, so a result can be audited rather than believed.
   *
   * The summary CSV above gives percentiles and a hundred-point curve. This
   * gives the sample those came from: one row per iteration with the values
   * that were drawn and the NPV, IRR and payback the fiscal engine returned
   * for them, including the iterations where IRR or payback does not exist,
   * which the percentile arrays drop by design.
   */
  const downloadRawSample = () => {
    if (!samples || samples.length === 0) return;
    const inputKeys = Array.from(
      samples.reduce((set, row) => {
        Object.keys(row.inputs || {}).forEach((k) => set.add(k));
        return set;
      }, new Set()),
    );
    const header = ['iteration', ...inputKeys.map((k) => VAR_LABELS[k] || k), 'npv_usd', 'irr_pct', 'payback_years'];
    const lines = [header.join(',')];
    samples.forEach((row) => {
      lines.push([
        row.i,
        ...inputKeys.map((k) => row.inputs?.[k]),
        row.npv,
        row.irr,
        row.payback,
      ].map(csvEscape).join(','));
    });
    lines.push('');
    lines.push(`# seed,${csvEscape(results?.seed)}`);
    lines.push(`# iterations,${csvEscape(results?.iterations)}`);
    lines.push('# Re-running with this seed and the same configuration reproduces these rows exactly.');
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `epe-monte-carlo-sample-seed-${results?.seed ?? 'run'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cdfData = useMemo(() => (results?.npv?.cdf || []).map((p) => ({ npv: p.x, prob: p.y })), [results]);
  const fanData = useMemo(() => (results?.fan?.cumulative || []).map((r) => ({
    year: r.year, p90: r.p90, band: r.p10 - r.p90, p50: r.p50,
  })), [results]);
  const tornadoRows = useMemo(() => (results?.tornado || []).map((s) => ({
    label: VAR_LABELS[s.parameter] || s.parameter,
    low: s.low / 1e6,
    high: s.high / 1e6,
    lowInputVol: s.lowInputVol / 1e6,
    highInputVol: s.highInputVol / 1e6,
  })), [results]);
  const convergenceData = useMemo(() => (results?.convergence || []), [results]);

  // Legacy runs predate run_config_id; without it there is nothing to sample,
  // so say so instead of showing a loading message forever.
  if (!runConfigId) {
    return (
      <p className="text-slate-300 text-sm py-8">
        This run has no saved configuration, so Monte Carlo cannot sample its inputs.
        Re-run the case from the Run Console to enable the Risk tab.
      </p>
    );
  }
  if (!vars) {
    return <p className="text-slate-300 text-sm py-8">Loading run configuration...</p>;
  }

  const hasIrrStats = results?.irr && results.irr.p50 != null;
  const hasPaybackStats = results?.payback && results.payback.p50 != null;

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <div className="bg-white/5 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-1">Uncertain inputs</h3>
        <p className="text-xs text-slate-300 mb-3">
          Each enabled input is sampled from its distribution and run through the full fiscal engine per iteration. Prices are absolute; multipliers scale the uploaded CAPEX, OPEX, and production data. Normal and lognormal use a mean and standard deviation, with optional Low/High truncation bounds.
        </p>
        {Object.entries(vars).map(([key, spec]) => (
          <DistRow key={key} varKey={key} spec={spec} onChange={setVar} />
        ))}

        {/* Correlations */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-200 font-medium">Correlations</p>
            <Button type="button" variant="outline" size="sm" onClick={addCorrRow}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add pair
            </Button>
          </div>
          {correlations.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {correlations.map((row, i) => {
                const active = vars[row.a]?.enabled && vars[row.b]?.enabled && row.a !== row.b;
                return (
                  <div key={i} className={`flex flex-wrap items-center gap-2 text-xs ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                    <select
                      value={row.a}
                      onChange={(e) => setCorrCell(i, 'a', e.target.value)}
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs"
                    >
                      {VAR_KEYS.map((k) => <option key={k} value={k}>{VAR_LABELS[k]}</option>)}
                    </select>
                    <span>with</span>
                    <select
                      value={row.b}
                      onChange={(e) => setCorrCell(i, 'b', e.target.value)}
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs"
                    >
                      {VAR_KEYS.map((k) => <option key={k} value={k}>{VAR_LABELS[k]}</option>)}
                    </select>
                    <span>rho</span>
                    <input
                      type="number"
                      step="0.05"
                      min="-0.99"
                      max="0.99"
                      value={row.rho}
                      onChange={(e) => setCorrCell(i, 'rho', e.target.value)}
                      className="w-16 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs"
                    />
                    {!active && <span className="italic">inactive (enable both inputs)</span>}
                    <button type="button" onClick={() => delCorrRow(i)} className="text-slate-400 hover:text-red-400" title="Remove pair">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-1.5">
            Pairs apply only while both inputs are enabled. Strongly contradictory correlation sets may be dampened; the sampler keeps the correlation matrix decomposable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 mt-4">
          <label className="text-sm text-slate-200 flex items-center gap-2">
            Iterations
            <select
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-sm"
            >
              {[500, 1000, 2000, 5000].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-200 flex items-center gap-2" title="Blank picks a new random seed. Set a seed to reproduce a run exactly for review or audit.">
            Seed
            <input
              type="number"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder="random"
              className="w-28 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-sm"
            />
          </label>
          {!isOwnConfig && (
            <span className="text-xs text-amber-300">
              Shared run: simulations are disabled. Clone the case to run your own.
            </span>
          )}
          <Button onClick={runMonteCarlo} disabled={running || !isOwnConfig} className="bg-gradient-to-r from-green-500 to-cyan-500 text-white">
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {running ? 'Running simulation...' : 'Run Monte Carlo'}
          </Button>
          {results && samples && samples.length > 0 && (
            <Button
              type="button" variant="outline" onClick={downloadRawSample}
              title="Every iteration: the values drawn and the NPV, IRR and payback they produced"
            >
              <Download className="w-4 h-4 mr-2" /> Raw sample (CSV)
            </Button>
          )}
          {results && (
            <Button type="button" variant="outline" onClick={downloadCsv} title="Percentiles, CDF points, and the yearly fan as a CSV">
              <Download className="w-4 h-4 mr-2" /> Download results (CSV)
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-6">
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard title="NPV P90 (low)" value={fmtM(results.npv.p90)} accent="text-blue-300" />
              <StatCard title="NPV P50" value={fmtM(results.npv.p50)} />
              <StatCard title="NPV P10 (high)" value={fmtM(results.npv.p10)} accent="text-emerald-300" />
              <StatCard title="NPV mean" value={fmtM(results.npv.mean)} />
              <StatCard
                title="P(NPV > 0)"
                value={`${(results.probNpvPositive * 100).toFixed(1)}%`}
                accent={results.probNpvPositive >= 0.8 ? 'text-emerald-300' : results.probNpvPositive >= 0.5 ? 'text-amber-300' : 'text-red-300'}
              />
              <StatCard title="Deterministic base" value={fmtM(results.base?.npv)} />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {results.iterations} iterations, seed {results.seed}
              {results.seed != null && (
                <button
                  type="button"
                  onClick={() => setSeedInput(String(results.seed))}
                  className="ml-1 text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
                  title="Copy this seed into the Seed field so the next run reproduces this one exactly"
                >
                  reuse
                </button>
              )}
              {results.npv?.se != null && (
                <> . Mean NPV {fmtM(results.npv.mean)} with standard error {fmtM(results.npv.se)}</>
              )}
              . NPV on the run basis ({results.base?.pv_basis || 'real'}); fan bands are nominal cash flow. Petroleum convention: P90 is the low case.
            </p>
          </div>

          {/* IRR and payback distributions (Wave C; older saved runs may not have them) */}
          {(hasIrrStats || hasPaybackStats) && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {hasIrrStats && (
                  <>
                    <StatCard title="IRR P90 (low)" value={fmtPct(results.irr.p90)} accent="text-blue-300" />
                    <StatCard title="IRR P50" value={fmtPct(results.irr.p50)} />
                    <StatCard title="IRR P10 (high)" value={fmtPct(results.irr.p10)} accent="text-emerald-300" />
                    <StatCard title="IRR mean" value={fmtPct(results.irr.mean)} />
                  </>
                )}
                {hasPaybackStats && (
                  <>
                    <StatCard title="Payback P90 (yr)" value={fmtYr(results.payback.p90)} />
                    <StatCard title="Payback P50 (yr)" value={fmtYr(results.payback.p50)} />
                    <StatCard title="Payback P10 (yr)" value={fmtYr(results.payback.p10)} />
                    <StatCard title="Payback mean (yr)" value={fmtYr(results.payback.mean)} />
                  </>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {hasIrrStats && results.irr.nullShare > 0 && (
                  <>IRR is undefined in {(results.irr.nullShare * 100).toFixed(1)}% of iterations. </>
                )}
                {hasPaybackStats && results.payback.neverShare > 0 && (
                  <>The project never pays back in {(results.payback.neverShare * 100).toFixed(1)}% of iterations. </>
                )}
                {hasPaybackStats && (
                  <>Payback percentiles are on years, sorted low to high; shorter is better.</>
                )}
              </p>
            </div>
          )}

          {/* NPV cumulative probability */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">NPV cumulative probability</h3>
            <ChartFrame height={420} exportFilename="epe-mc-npv-cdf">
              <ComposedChart data={cdfData} margin={CHART_MARGINS.withLegend}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="npv" tickFormatter={fmtM} tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} type="number" domain={['dataMin', 'dataMax']} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} />
                <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => name === 'Probability' ? `${Number(v).toFixed(1)}%` : fmtM(v)} labelFormatter={(v) => `NPV ${fmtM(v)}`} />
                <ReferenceLine x={0} stroke="#dc2626" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="prob" name="Probability" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} strokeWidth={2} />
              </ComposedChart>
            </ChartFrame>
          </div>

          {/* Convergence of the running mean (Wave C) */}
          {convergenceData.length >= 2 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Convergence of mean NPV</h3>
              <ChartFrame height={180} logoHeight={24} exportFilename="epe-mc-convergence">
                <ComposedChart data={convergenceData} margin={CHART_MARGINS.withLegend}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="n" tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} />
                  <YAxis tickFormatter={fmtM} tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} domain={['auto', 'auto']} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtM(v)} labelFormatter={(v) => `${v} iterations`} />
                  <Line type="monotone" dataKey="mean" name="Running mean" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ChartFrame>
              <p className="text-[11px] text-slate-500 mt-1">A flat tail means the mean has settled; a still-moving tail suggests more iterations.</p>
            </div>
          )}

          {/* Cumulative cash flow fan */}
          {fanData.length >= 2 ? (
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Cumulative cash flow fan (nominal)</h3>
              <ChartFrame height={420} exportFilename="epe-mc-cashflow-fan">
                <ComposedChart data={fanData} margin={CHART_MARGINS.withLegend}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="year" tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} />
                  <YAxis tickFormatter={fmtM} tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} />
                  <RTooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name) => [fmtM(v), name]}
                  />
                  <RLegend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText, paddingTop: 8 }} />
                  <Area stackId="fan" dataKey="p90" name="P90 (low)" stroke="none" fill="transparent" legendType="none" tooltipType="none" />
                  <Area stackId="fan" dataKey="band" name="P90 to P10 range" stroke="none" fill="#2563eb" fillOpacity={0.15} />
                  <Line type="monotone" dataKey="p50" name="P50" stroke="#059669" strokeWidth={2} dot={false} />
                  <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
                </ComposedChart>
              </ChartFrame>
            </div>
          ) : results.fan?.cumulative?.length === 1 && (
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-white mb-2">Cash flow range ({results.fan.cumulative[0].year})</h3>
              <p className="text-sm text-slate-200">
                Net cash flow P90 {fmtM(results.fan.ncf[0].p90)}, P50 {fmtM(results.fan.ncf[0].p50)}, P10 {fmtM(results.fan.ncf[0].p10)}. A multi-year case renders a full fan chart here.
              </p>
            </div>
          )}

          {/* Tornado */}
          {tornadoRows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">NPV sensitivity tornado (conditional P50 by input decile)</h3>
              <ChartFrame height={Math.max(320, 60 + tornadoRows.length * 56)} exportFilename="epe-mc-tornado">
                <TornadoChart
                  rows={tornadoRows}
                  base={(results.tornado[0]?.base ?? 0) / 1e6}
                  unit="$MM"
                  height={Math.max(320, 60 + tornadoRows.length * 56)}
                />
              </ChartFrame>
            </div>
          )}

          {mcRun?.created_at && (
            <p className="text-xs text-slate-500">Saved run from {new Date(mcRun.created_at).toLocaleString()}.</p>
          )}
        </div>
      )}

      {!results && (
        <p className="text-slate-300 text-sm">
          No Monte Carlo run yet for this configuration. Enable the uncertain inputs above and run the simulation to see the NPV distribution, the chance of a positive NPV, and which inputs drive the outcome.
        </p>
      )}
    </div>
  );
};

export default EpeMonteCarloPanel;
