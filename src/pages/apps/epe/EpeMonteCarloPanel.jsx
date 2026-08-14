import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Play } from 'lucide-react';
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

const VAR_LABELS = {
  oil_price: 'Oil price ($/bbl)',
  gas_price: 'Gas price ($/mscf)',
  capex_scale: 'CAPEX multiplier',
  opex_scale: 'OPEX multiplier',
  production_scale: 'Production multiplier',
};

const fmtM = (n) => {
  if (n == null || isNaN(n)) return 'N/A';
  const m = n / 1e6;
  if (Math.abs(m) >= 1000) return `$${(m / 1000).toFixed(2)}B`;
  return `$${m.toFixed(1)}M`;
};

const AXIS_TICK = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };

const StatCard = ({ title, value, accent }) => (
  <div className="bg-white/5 p-4 rounded-lg">
    <p className="text-xs text-slate-300 uppercase tracking-wide">{title}</p>
    <p className={`text-2xl font-bold mt-1 ${accent || 'text-white'}`}>{value}</p>
  </div>
);

const TriangularRow = ({ varKey, spec, onChange }) => (
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
    {['min', 'mode', 'max'].map((field) => (
      <label key={field} className="text-xs text-slate-300 flex items-center gap-1">
        {field === 'min' ? 'Low' : field === 'mode' ? 'Most likely' : 'High'}
        <input
          type="number"
          step="any"
          value={spec[field]}
          disabled={!spec.enabled}
          onChange={(e) => onChange(varKey, { ...spec, [field]: e.target.value })}
          className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs disabled:opacity-40"
        />
      </label>
    ))}
  </div>
);

const EpeMonteCarloPanel = ({ runConfigId }) => {
  const { toast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [vars, setVars] = useState(null);
  const [iterations, setIterations] = useState(1000);
  const [correlatePrices, setCorrelatePrices] = useState(true);
  const [running, setRunning] = useState(false);
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
        setVars({
          oil_price: { enabled: true, min: (oil * 0.7).toFixed(1), mode: oil, max: (oil * 1.3).toFixed(1) },
          gas_price: { enabled: false, min: (gas * 0.7).toFixed(2), mode: gas, max: (gas * 1.3).toFixed(2) },
          capex_scale: { enabled: true, min: 0.8, mode: 1.0, max: 1.3 },
          opex_scale: { enabled: false, min: 0.9, mode: 1.0, max: 1.15 },
          production_scale: { enabled: false, min: 0.85, mode: 1.0, max: 1.1 },
        });
      }
      const { data: prior } = await supabase
        .from('epe_mc_runs')
        .select('id, results, mc_config, created_at')
        .eq('run_config_id', runConfigId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (prior && prior.length > 0) setMcRun(prior[0]);
    })();
  }, [runConfigId]);

  const setVar = (key, spec) => setVars((v) => ({ ...v, [key]: spec }));

  const runMonteCarlo = async () => {
    if (!vars) return;
    const variables = {};
    for (const [key, spec] of Object.entries(vars)) {
      if (!spec.enabled) continue;
      const min = Number(spec.min);
      const mode = Number(spec.mode);
      const max = Number(spec.max);
      if (!(min <= mode && mode <= max) || !(max > min)) {
        toast({ variant: 'destructive', title: 'Check distribution bounds', description: `${VAR_LABELS[key]}: Low, Most likely, and High must be increasing.` });
        return;
      }
      variables[key] = { type: 'triangular', min, mode, max };
    }
    if (Object.keys(variables).length === 0) {
      toast({ variant: 'destructive', title: 'No uncertain inputs', description: 'Enable at least one input distribution to run the simulation.' });
      return;
    }
    const correlations = (correlatePrices && variables.oil_price && variables.gas_price)
      ? [{ a: 'oil_price', b: 'gas_price', rho: 0.7 }]
      : [];

    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('epe-monte-carlo', {
        body: { run_config_id: runConfigId, mc_config: { iterations, variables, correlations } },
      });
      if (error) throw new Error(error.message || 'Monte Carlo run failed.');
      if (data?.error) throw new Error(data.error);
      setMcRun({ results: data.results, mc_config: { iterations, variables, correlations }, created_at: new Date().toISOString() });
      toast({ title: 'Simulation complete', description: `${data.results.iterations} iterations through the fiscal engine.` });
    } catch (err) {
      console.error('[EpeMonteCarloPanel]', err);
      toast({ variant: 'destructive', title: 'Monte Carlo failed', description: err.message });
    } finally {
      setRunning(false);
    }
  };

  const results = mcRun?.results;

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

  if (!vars) {
    return <p className="text-slate-300 text-sm py-8">Loading run configuration...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <div className="bg-white/5 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-1">Uncertain inputs</h3>
        <p className="text-xs text-slate-300 mb-3">
          Each enabled input is sampled from a triangular distribution and run through the full fiscal engine per iteration. Prices are absolute; multipliers scale the uploaded CAPEX, OPEX, and production data.
        </p>
        {Object.entries(vars).map(([key, spec]) => (
          <TriangularRow key={key} varKey={key} spec={spec} onChange={setVar} />
        ))}
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
          <label className="text-sm text-slate-200 flex items-center gap-2">
            <input
              type="checkbox"
              checked={correlatePrices}
              onChange={(e) => setCorrelatePrices(e.target.checked)}
              className="accent-lime-400"
            />
            Correlate oil and gas prices (rho 0.7)
          </label>
          <Button onClick={runMonteCarlo} disabled={running} className="bg-gradient-to-r from-green-500 to-cyan-500 text-white">
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {running ? 'Running simulation...' : 'Run Monte Carlo'}
          </Button>
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
              {results.iterations} iterations, seed {results.seed}. NPV on the run basis ({results.base?.pv_basis || 'real'}); fan bands are nominal cash flow. Petroleum convention: P90 is the low case.
            </p>
          </div>

          {/* NPV cumulative probability */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">NPV cumulative probability</h3>
            <ChartFrame height={260} exportFilename="epe-mc-npv-cdf">
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

          {/* Cumulative cash flow fan */}
          {fanData.length >= 2 ? (
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Cumulative cash flow fan (nominal)</h3>
              <ChartFrame height={260} exportFilename="epe-mc-cashflow-fan">
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
              <ChartFrame height={Math.max(160, 44 + tornadoRows.length * 40)} exportFilename="epe-mc-tornado">
                <TornadoChart
                  rows={tornadoRows}
                  base={(results.tornado[0]?.base ?? 0) / 1e6}
                  unit="$MM"
                  height={Math.max(160, 44 + tornadoRows.length * 40)}
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
