// Forecast tab (MB6). Decline forecast on the case's production history via
// the canonical Arps engine (src/utils/declineCurve/dcaEngine.js, the DCA
// Studio engine; adapter and reconciliation math in the jest-guarded
// lib/mbalForecast.js), reconciled against the material balance volumes of
// the last run. Replaces the pre-Horizons ForecastScenarios shell, which
// leaned on a toy Arps loop and fabricated P10/P90 bands.
import React, { useMemo, useState } from 'react';
import { TrendingDown, Info, AlertTriangle } from 'lucide-react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { fitArpsModel, generateForecast } from '@/utils/declineCurve/dcaEngine';
import {
  ratesFromCumulative,
  forecastBeyondHistory,
  reconcileWithMbal,
} from '@/pages/apps/reservoir-balance/lib/mbalForecast';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';

const MODELS = ['Auto-Select', 'Exponential', 'Hyperbolic', 'Harmonic'];

const fmtVol = (v, isGas) => {
  if (v == null || !Number.isFinite(v)) return '—';
  return isGas
    ? `${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} Bcf`
    : `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} MM STB`;
};
const fmtRate = (v, isGas) => {
  if (v == null || !Number.isFinite(v)) return '—';
  return isGas
    ? `${(v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 0 })} Mscf/d`
    : `${v.toLocaleString('en-US', { maximumFractionDigits: 0 })} STB/d`;
};

const Kpi = ({ label, value, hint }) => (
  <div className="border border-slate-800 rounded-md p-3 bg-slate-950/40">
    <p className="text-[11px] text-slate-500">{label}</p>
    <p className="text-base font-semibold text-slate-200 mt-0.5">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const ForecastTab = () => {
  const { caseData, lastResult } = useMaterialBalanceStudio();
  const isGas = caseData?.fluid_system === 'gas';
  const phase = isGas ? 'gas' : 'oil';

  const [model, setModel] = useState('Auto-Select');
  const [econLimit, setEconLimit] = useState(isGas ? '100000' : '10');
  const [horizonYears, setHorizonYears] = useState('20');
  const [abandonment, setAbandonment] = useState('');

  const rates = useMemo(
    () => ratesFromCumulative(caseData?.production_data, phase),
    [caseData, phase],
  );

  const lastRow = caseData?.production_data?.length
    ? caseData.production_data[caseData.production_data.length - 1]
    : null;
  const producedToDate = lastRow
    ? (isGas ? lastRow.cum_gas_scf : lastRow.cum_oil_stb) ?? 0
    : 0;

  const fit = useMemo(() => {
    if (!rates) return null;
    return fitArpsModel(rates, model, null, null);
  }, [rates, model]);

  const forecast = useMemo(() => {
    if (!fit || !lastRow?.observation_date) return null;
    const limit = Number(econLimit);
    const years = Number(horizonYears);
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(years) || years <= 0) return null;
    return forecastBeyondHistory(
      fit,
      lastRow.observation_date,
      { economicLimit: limit, horizonYears: years },
      generateForecast,
    );
  }, [fit, lastRow, econLimit, horizonYears]);

  const inPlace = isGas ? lastResult?.estimated_ogip_scf : lastResult?.estimated_ooip_stb;
  const reconciliation = useMemo(() => {
    if (!forecast) return null;
    return reconcileWithMbal({
      fluidSystem: caseData?.fluid_system,
      inPlace,
      producedToDate,
      dcaRemaining: forecast.remaining,
      driveMechanism: lastResult?.drive_mechanism,
      plotData: lastResult?.plot_data,
      initialPressure: caseData?.initial_pressure_psia,
      abandonmentPressure: abandonment === '' ? NaN : Number(abandonment),
    });
  }, [forecast, caseData, inPlace, producedToDate, lastResult, abandonment]);

  const chartData = useMemo(() => {
    const hist = (rates ?? []).map((r) => ({
      t: new Date(r.date).getTime(),
      history: r.rate,
    }));
    // Thin the forecast to weekly points so the chart stays light.
    const fc = (forecast?.points ?? [])
      .filter((_, i) => i % 7 === 0)
      .map((p) => ({ t: new Date(p.date).getTime(), forecast: p.rate }));
    return [...hist, ...fc];
  }, [rates, forecast]);

  if (!rates) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-slate-400 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            The forecast needs dated production history: at least four rows with observation dates and growing
            cumulative volumes in the Data tab. Rates are derived from the cumulative differences between rows.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fitUsable = fit && fit.parameters?.qi > 0 && fit.parameters?.Di > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-emerald-500" />
            Decline forecast
          </CardTitle>
          <CardDescription>
            Arps decline fitted to rates derived from the cumulative history, forecast to the economic limit,
            using the same decline engine as the DCA Studio. Remaining reserves count only production beyond the
            last history date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Decline model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">
                Economic limit ({isGas ? 'scf/d' : 'STB/d'})
              </Label>
              <Input value={econLimit} onChange={(e) => setEconLimit(e.target.value)} className="h-8 font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Horizon (years)</Label>
              <Input value={horizonYears} onChange={(e) => setHorizonYears(e.target.value)} className="h-8 font-mono text-xs" />
            </div>
            {isGas && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Abandonment pressure (psia)</Label>
                <Input
                  value={abandonment}
                  onChange={(e) => setAbandonment(e.target.value)}
                  placeholder="for p/z recoverable"
                  className="h-8 font-mono text-xs"
                />
              </div>
            )}
          </div>

          {!fitUsable ? (
            <p className="text-sm text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              The decline fit failed on this history (rates may be too noisy or not declining). Try a different model
              or a cleaner rate history.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi
                  label={`Fit: ${fit.parameters.modelType}`}
                  value={`R² ${fit.R2.toFixed(3)}`}
                  hint={`qi ${fmtRate(fit.parameters.qi, isGas)}, Di ${(fit.parameters.Di * 365.25).toFixed(3)}/yr${fit.parameters.b ? `, b ${fit.parameters.b.toFixed(2)}` : ''}`}
                />
                <Kpi
                  label="Rate at history end"
                  value={fmtRate(forecast?.rateAtHistoryEnd, isGas)}
                />
                <Kpi
                  label="DCA remaining to limit"
                  value={fmtVol(forecast?.remaining, isGas)}
                  hint={forecast?.reachedLimit
                    ? `limit reached in ${forecast.timeToLimitYearsFromNow.toFixed(1)} yr`
                    : 'limit not reached inside the horizon'}
                />
                <Kpi
                  label="Produced to date"
                  value={fmtVol(producedToDate, isGas)}
                />
              </div>

              <ChartFrame height={300} exportFilename="mbal-decline-forecast">
                <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    scale="time"
                    tickFormatter={(t) => new Date(t).getFullYear()}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  />
                  <YAxis
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{ value: isGas ? 'Rate (scf/d)' : 'Rate (STB/d)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    labelFormatter={(t) => new Date(t).toISOString().slice(0, 10)}
                    formatter={(v, name) => [fmtRate(v, isGas), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Scatter dataKey="history" name="History" fill="#dc2626" />
                  <Line dataKey="forecast" name="Forecast" stroke="#0284c7" strokeWidth={2} dot={false} connectNulls />
                </ComposedChart>
              </ChartFrame>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Material balance reconciliation</CardTitle>
          <CardDescription>
            {isGas
              ? 'Compares the DCA remaining reserves with the p/z recoverable at your abandonment pressure, interpolated through the p/z history of the last run.'
              : 'Compares the recovery factor implied by history plus the DCA forecast against the statistical recovery ranges for the drive mechanism the last run diagnosed.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!reconciliation || reconciliation.kind === 'unavailable' ? (
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Info className="h-4 w-4" />
              {reconciliation?.reason ?? 'Generate a decline forecast first.'}
            </p>
          ) : reconciliation.kind === 'gas_pz' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="p/z recoverable" value={fmtVol(reconciliation.mbalRecoverable, true)}
                  hint={`to ${abandonment} psia`} />
                <Kpi label="MBAL remaining" value={fmtVol(reconciliation.mbalRemaining, true)} />
                <Kpi label="DCA remaining" value={fmtVol(reconciliation.dcaRemaining, true)} />
                <Kpi
                  label="Difference"
                  value={reconciliation.deltaFraction != null
                    ? `${(reconciliation.deltaFraction * 100).toFixed(1)}%`
                    : '—'}
                  hint="DCA vs MBAL remaining"
                />
              </div>
              {reconciliation.mbalRemaining <= 0 && (
                <p className="text-sm text-amber-400">
                  Production to date already exceeds the p/z recoverable at this abandonment pressure. Either the
                  abandonment pressure is too high or pressure support (aquifer) is adding recovery beyond simple
                  depletion.
                </p>
              )}
              {reconciliation.note && (
                <p className="text-xs text-slate-500">{reconciliation.note}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="OOIP (last run)" value={fmtVol(inPlace, false)} />
                <Kpi label="Recovery to date" value={`${(reconciliation.producedRF * 100).toFixed(1)}%`} />
                <Kpi label="Implied ultimate RF" value={`${(reconciliation.impliedRF * 100).toFixed(1)}%`}
                  hint="history plus DCA remaining" />
                <Kpi
                  label="Drive mechanism band"
                  value={reconciliation.band
                    ? `${(reconciliation.band.lo * 100).toFixed(0)} to ${(reconciliation.band.hi * 100).toFixed(0)}%`
                    : '—'}
                  hint={reconciliation.band?.label ?? reconciliation.driveMechanism?.replace(/_/g, ' ')}
                />
              </div>
              {reconciliation.withinBand === false && (
                <p className="text-sm text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  The implied recovery factor sits outside the statistical range for this drive mechanism
                  (Arps and API study ranges as tabulated in Ahmed). That does not make either number wrong, but the
                  decline forecast and the material balance are telling different stories; check the economic limit,
                  the fit window and the aquifer model before quoting reserves.
                </p>
              )}
              {reconciliation.withinBand === true && (
                <p className="text-xs text-slate-500">
                  The implied recovery factor is consistent with the statistical range for this drive mechanism.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ForecastTab;
