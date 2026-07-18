// Run tab, History match segment (MB5). The inverse workflow: instead of
// regressing OOIP/OGIP from the observed pressures, the engine simulates the
// pressure history from candidate tank parameters and Levenberg-Marquardt
// adjusts them until the simulated pressures reproduce the observations.
// Server-side (calculate-mbal mode 'history_match', validated by harness
// CASE 11 recovery gates); this component selects the parameters, seeds
// starting values, runs the match and renders the pressure-match plot the
// Plots tab has been missing since Phase 3B.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Crosshair, Loader2, Info, AlertTriangle,
} from 'lucide-react';
import {
  ComposedChart, Line, Scatter, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ValidationTierBadge from '@/components/reservoirbalance/ValidationTierBadge';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { getCaseDefaultConfig } from '@/pages/apps/reservoir-balance/lib/api';
import {
  applicableParameters,
  buildHistoryMatchRequest,
} from '@/pages/apps/reservoir-balance/lib/historyMatchParams';

const fmtValue = (key, v) => {
  if (v == null || !Number.isFinite(v)) return '—';
  if (key === 'ogip_scf') return `${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} Bcf`;
  if (key === 'stoiip_stb') return `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} MM STB`;
  if (key === 'aquifer_w_rb') return `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} MM rb`;
  if (key === 'gas_cap_m') return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 });
};

const fmtPsi = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} psi`);

const Kpi = ({ label, value, hint }) => (
  <div className="border border-slate-800 rounded-md p-3 bg-slate-950/40">
    <p className="text-[11px] text-slate-500">{label}</p>
    <p className="text-base font-semibold text-slate-200 mt-0.5">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const HistoryMatch = () => {
  const {
    caseId, caseData, lastResult, running, handleHistoryMatch,
  } = useMaterialBalanceStudio();

  const [defaultCfg, setDefaultCfg] = useState(null);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    setCfgLoaded(false);
    getCaseDefaultConfig(caseId).then(({ data }) => {
      if (!alive) return;
      setDefaultCfg(data ?? null);
      setCfgLoaded(true);
    });
    return () => { alive = false; };
  }, [caseId]);

  const catalog = useMemo(
    () => applicableParameters(caseData, defaultCfg, lastResult),
    [caseData, defaultCfg, lastResult],
  );

  // Selection state keyed by parameter; reseeded when the catalog changes
  // shape (case switch, aquifer model change), preserving nothing stale.
  const [selection, setSelection] = useState([]);
  const catalogSignature = catalog.map((p) => p.key).join('|');
  useEffect(() => {
    setSelection(catalog.map((p) => ({
      key: p.key,
      label: p.label,
      checked: p.defaultChecked,
      guess: p.defaultGuess != null ? String(p.defaultGuess) : '',
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogSignature, caseId]);

  const [formError, setFormError] = useState(null);

  const updateSelection = (key, patch) => {
    setFormError(null);
    setSelection((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const rowCount = caseData?.production_data?.length ?? 0;
  const fitCount = selection.filter((s) => s.checked).length;

  const onRun = () => {
    const req = buildHistoryMatchRequest(selection);
    if (!req.ok) {
      setFormError(req.error);
      return;
    }
    setFormError(null);
    handleHistoryMatch(req.payload);
  };

  // Last history-match block, if the latest result carries one.
  const hm = lastResult?.plot_data?.history_match ?? null;

  const chartData = useMemo(() => {
    if (!hm) return [];
    return hm.observed_pressure_psia.map((obs, i) => ({
      step: i,
      date: hm.observation_date?.[i] ?? null,
      observed: obs,
      simulated: hm.simulated_pressure_psia[i],
      residual: hm.residual_psi[i],
    }));
  }, [hm]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-emerald-500" />
            Pressure history match
          </CardTitle>
          <CardDescription>
            The engine simulates the reservoir pressure that your production history would have produced for a candidate set of tank parameters, then adjusts the selected parameters until the simulated pressures reproduce the observed ones. Unchecked parameters stay at their starting values. Leave a starting value blank to let the engine derive it from the regression and the Aquifer tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!cfgLoaded ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading case configuration
            </div>
          ) : (
            <div className="space-y-2">
              {catalog.map((p) => {
                const sel = selection.find((s) => s.key === p.key);
                if (!sel) return null;
                return (
                  <div
                    key={p.key}
                    className="grid grid-cols-[auto_1fr_180px] items-center gap-3 border border-slate-800 rounded-md px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-600"
                      checked={sel.checked}
                      onChange={(e) => updateSelection(p.key, { checked: e.target.checked })}
                      aria-label={`Fit ${p.label}`}
                    />
                    <div>
                      <p className="text-sm text-slate-200">
                        {p.label} <span className="text-slate-500">({p.unit})</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {sel.checked ? 'Fitted by the match.' : 'Held at the starting value.'}
                        {p.guessSource && ` Start seeded from ${p.guessSource}.`}
                      </p>
                    </div>
                    <Input
                      value={sel.guess}
                      onChange={(e) => updateSelection(p.key, { guess: e.target.value })}
                      placeholder="engine derived"
                      className="h-8 text-right font-mono text-xs"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {formError && (
            <p className="text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {formError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={onRun} disabled={running || rowCount < 3 || fitCount === 0}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="mr-2 h-4 w-4" />
              )}
              Run history match
            </Button>
            {rowCount < 3 && (
              <p className="text-sm text-muted-foreground">
                The match needs at least 3 timesteps of production data. Upload more history in the Data tab.
              </p>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Fetkovich note: the aquifer index J trades against W on short histories, so J is held by default. Fit it only when the history is long enough to separate the two.
          </p>
        </CardContent>
      </Card>

      {hm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Match result</CardTitle>
                <CardDescription>
                  {hm.converged
                    ? `Converged in ${hm.iterations} iterations.`
                    : `Stopped at the iteration cap (${hm.iterations} iterations); see warnings.`}
                </CardDescription>
              </div>
              {hm.validation_tier && (
                <ValidationTierBadge
                  tier={hm.validation_tier}
                  reference={hm.validation_reference}
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="RMS pressure error" value={fmtPsi(hm.rms_error_psi)} />
              <Kpi label="Largest miss" value={fmtPsi(hm.max_abs_error_psi)} />
              <Kpi label="Iterations" value={hm.iterations} />
              <Kpi
                label="Status"
                value={hm.converged ? 'Converged' : 'Iteration cap'}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left py-1.5 pr-3 font-medium">Parameter</th>
                    <th className="text-right py-1.5 px-3 font-medium">Start</th>
                    <th className="text-right py-1.5 px-3 font-medium">Matched</th>
                    <th className="text-right py-1.5 pl-3 font-medium">95% confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {(hm.matched_parameters ?? []).map((p) => (
                    <tr key={p.key} className="border-b border-slate-800/60">
                      <td className="py-1.5 pr-3 text-slate-300">
                        {p.label}
                        {p.at_bound && (
                          <span className="ml-2 text-amber-400">at bound</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-400">
                        {fmtValue(p.key, p.initial_value)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-100">
                        {fmtValue(p.key, p.matched_value)}
                      </td>
                      <td className="py-1.5 pl-3 text-right font-mono text-slate-400">
                        {p.ci95_low != null && p.ci95_high != null
                          ? `${fmtValue(p.key, p.ci95_low)} to ${fmtValue(p.key, p.ci95_high)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-sm text-slate-300 mb-2">Pressure history match</p>
              <ChartFrame height={320} exportFilename="mbal-pressure-history-match">
                <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis
                    dataKey="step"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{ value: 'Timestep', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="p"
                    domain={['auto', 'auto']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{ value: 'Pressure (psia)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="r"
                    orientation="right"
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{ value: 'Residual (psi)', angle: 90, position: 'insideRight', fill: CHART_COLORS.axisText, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(v, name) => [
                      name === 'Residual' ? fmtPsi(v) : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })} psia`,
                      name,
                    ]}
                    labelFormatter={(step) => {
                      const row = chartData[step];
                      return row?.date ? `Step ${step} (${row.date})` : `Step ${step}`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="r" y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                  <Bar yAxisId="r" dataKey="residual" name="Residual" fill="#f59e0b" fillOpacity={0.5} barSize={6} />
                  <Line yAxisId="p" type="monotone" dataKey="simulated" name="Simulated" stroke="#0284c7" strokeWidth={2} dot={false} />
                  <Scatter yAxisId="p" dataKey="observed" name="Observed" fill="#dc2626" />
                </ComposedChart>
              </ChartFrame>
              <p className="text-[11px] text-slate-500 mt-2">
                Dots are the observed pressures from the Data tab. The line is the pressure history the tank model produces at the matched parameters. Bars show observed minus simulated on the right axis.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!hm && lastResult && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Info className="h-4 w-4" />
              The latest result on this case is a regression run. Run a history match to see the pressure-match plot and matched parameters here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HistoryMatch;
