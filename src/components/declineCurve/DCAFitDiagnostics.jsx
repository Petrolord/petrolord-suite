import React, { useState, useEffect, useMemo } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AlertCircle, CheckCircle, TrendingUp, Target, BarChart3 } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import { getVerdictInfo } from '@/utils/dcaDiagnostics';
import { detectSegmentBreakpoints } from '@/utils/dcaSegmentDetection';
import { calculateArpsHyperbolic, getFitQuality } from '@/utils/declineCurve/dcaEngine';
import { prepareFitData } from '@/utils/declineCurve/dcaModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStreamRate } from '@/utils/declineCurve/csvParser';
import { formatEffectiveFirstYear, formatDecline, declineBasisLabel } from '@/utils/declineCurve/declineDisplay';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STYLE, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

const DCAFitDiagnostics = () => {
  const { wells, currentWellId, selectedStream, streamState, fitWindow, excludePoint, restorePoint } = useDeclineCurve();
  const u = useDcaUnits();
  const rate = (v) => u.rateTo(selectedStream, v);
  const [detectedBreakpoints, setDetectedBreakpoints] = useState([]);
  const [reason, setReason] = useState('');
  
  const fitResults = streamState[selectedStream]?.fitResults;
  const excluded = streamState[selectedStream]?.excluded || [];
  const wellData = wells?.[currentWellId];
  // one array per well data (a fresh [] every render would re-run the effects below forever)
  const productionData = useMemo(() => wellData?.data || [], [wellData?.data]);
  // the rows the fit used, and every row left out with its reason (RL5)
  const prepared = useMemo(
    () => prepareFitData(productionData, selectedStream, fitWindow, excluded),
    [productionData, selectedStream, fitWindow, excluded],
  );
  
  // Detect segments when well or stream changes
  useEffect(() => {
    if (productionData && productionData.length > 0) {
      const t0 = productionData[0]?.date ? new Date(productionData[0].date).getTime() : 0;
      const dataWithTime = productionData.map(d => ({
        date: new Date(d.date),
        rate: getStreamRate(d, selectedStream),
        time: (new Date(d.date).getTime() - t0) / 86400000  // days from first
      })).filter(d => d.rate != null);
      const breakpoints = detectSegmentBreakpoints(dataWithTime);
      setDetectedBreakpoints(breakpoints);
    } else {
      setDetectedBreakpoints((prev) => (prev.length ? [] : prev));
    }
  }, [currentWellId, selectedStream, productionData]);
  
  if (!fitResults || !productionData.length) {
    return (
      <div className="flex items-center justify-center h-full text-pl-muted text-sm p-4 bg-pl-surface rounded border border-dashed border-pl-border-strong">
        <div className="text-center space-y-2">
          <AlertCircle size={24} className="mx-auto text-pl-muted" />
          <p>No Fit Results Available</p>
          <p className="text-xs text-pl-muted">Run fit analysis to display diagnostics</p>
        </div>
      </div>
    );
  }

  // The engine's own parameters, metrics and 95% intervals (delta method on
  // the regression it ran). DCA-U1-005: this card used to compute its own
  // "intervals" from fields the fit never carries, so it never showed any.
  const qi = fitResults.qi;
  const Di = fitResults.Di;
  const b  = fitResults.b;
  const r2 = typeof fitResults.R2 === 'number' ? fitResults.R2 : 0;
  const rmse = typeof fitResults.RMSE === 'number' ? fitResults.RMSE : NaN;
  const usedDates = new Set(prepared.rows.filter((r) => r.status === 'used').map((r) => String(r.date).slice(0, 10)));
  let residuals = [];
  if (fitResults && fitResults.qi && fitResults.t0 && productionData.length > 0) {
    const t0ms = new Date(fitResults.t0).getTime();
    residuals = productionData
      .map(p => ({ ...p, streamRate: getStreamRate(p, selectedStream) }))
      .filter(p => p.streamRate > 0 && usedDates.has(String(p.date).slice(0, 10)))
      .map(p => {
        const tDays = (new Date(p.date).getTime() - t0ms) / 86400000;
        const predicted = calculateArpsHyperbolic(fitResults.qi, fitResults.Di, fitResults.b, tDays);
        const rawResidual = p.streamRate - predicted;
        // relative to the fitted rate, so wells of any size compare
        const normalizedResidual = predicted > 0 ? rawResidual / predicted : 0;
        return {
          time: tDays,
          date: p.date,
          observed: p.streamRate,
          predicted,
          residual: normalizedResidual
        };
      });
  }
  const verdictInfo = getVerdictInfo(r2);
  const tier = getFitQuality(r2, rmse).tier;
  const confidenceIntervals = fitResults.confidenceIntervals || { hasIntervals: false };
  
  // R² color coding
  // one scale for the notification, the badge and the verdict (getFitQuality)
  const getR2Color = (r2Value) => {
    if (r2Value >= 0.95) return 'text-pl-success-text';
    if (r2Value >= 0.80) return 'text-pl-warning-text';
    return 'text-pl-danger-text';
  };
  
  const getR2BadgeVariant = (r2Value) => {
    if (r2Value >= 0.95) return 'success';
    if (r2Value >= 0.80) return 'warning';
    return 'danger';
  };
  
  // Format units based on stream
  const getUnits = () => u.rateLabel(selectedStream);
  
  // Detect outliers (beyond ±2σ). Guard against empty residuals.
  const residualMean = residuals.length > 0
    ? residuals.reduce((sum, r) => sum + r.residual, 0) / residuals.length : 0;
  const residualStd = residuals.length > 0
    ? Math.sqrt(residuals.reduce((sum, r) => sum + Math.pow(r.residual - residualMean, 2), 0) / residuals.length) : 0;
  const outlierThreshold = residuals.length > 0 ? 2 * residualStd : 1;
  
  const residualsWithOutliers = residuals.map(point => ({
    ...point,
    isOutlier: Math.abs(point.residual) > outlierThreshold
  }));
  
  // Determine segment pattern color
  const getSegmentStatusColor = () => {
    if (detectedBreakpoints.length === 0) return 'text-pl-success-text';
    const maxSlopeChange = Math.max(...detectedBreakpoints.map(bp => bp.slopeChange));
    return maxSlopeChange >= 30 ? 'text-pl-warning-text' : 'text-pl-success-text';
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Verdict Card */}
      <Card className="shrink-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {verdictInfo.icon === 'check' ? (
              <CheckCircle className={getR2Color(r2)} size={20} />
            ) : (
              <AlertCircle className={getR2Color(r2)} size={20} />
            )}
            <div>
              <div className={`font-semibold ${getR2Color(r2)}`}>{verdictInfo.title}</div>
              <div className="text-xs text-pl-muted">{verdictInfo.description}</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-pl-muted uppercase tracking-wide">R² (Coeff. Det.)</div>
                <div className={`text-lg font-semibold font-pl-mono tabular-nums ${getR2Color(r2)}`}>
                  {r2.toFixed(4)}
                </div>
                <div className="text-[10px] text-pl-muted">on rates, {prepared.summary.used} points</div>
              </div>
              <Badge variant={getR2BadgeVariant(r2)}>
                {tier}
              </Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div>
              <div className="text-xs text-pl-muted uppercase tracking-wide">RMSE</div>
              <div className="text-lg font-semibold text-pl-text font-pl-mono tabular-nums">
                {Number.isFinite(rmse) ? rate(rmse).toFixed(1) : 'n/a'}
              </div>
              <div className="text-xs text-pl-muted">{getUnits()}</div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Arps Parameters */}
      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target size={16} className="text-pl-muted" aria-hidden="true" />
            Arps Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-pl-muted mb-1">qi (Initial Rate)</div>
              <div className="font-pl-mono tabular-nums text-pl-text">{Number.isFinite(qi) ? rate(qi).toFixed(1) : 'n/a'} {getUnits()}</div>
              <div className="text-pl-muted text-[10px]">at {String(fitResults.t0 || '').slice(0, 10) || 'n/a'}</div>
              {confidenceIntervals.hasIntervals && confidenceIntervals.qi > 0 && (
                <div className="text-pl-muted text-[10px]">±{rate(confidenceIntervals.qi).toFixed(1)}</div>
              )}
            </div>
            <div>
              <div className="text-pl-muted mb-1">Di (Initial Decline)</div>
              {/* H2: the fit holds Di per day; shown as nominal percent per
                  year through the one formatter the KPI card also uses */}
              <div className="font-pl-mono tabular-nums text-pl-text">
                <span data-testid="dca-di-diagnostics">{formatDecline(Di, u)}</span>{' '}
                <span className="text-pl-muted" data-testid="dca-di-diagnostics-basis">{declineBasisLabel(u)}</span>
              </div>
              {confidenceIntervals.hasIntervals && confidenceIntervals.Di > 0 && (
                <div className="text-pl-muted text-[10px]">±{formatDecline(confidenceIntervals.Di, u)} {u.declineLabel}</div>
              )}
              <div className="text-pl-muted text-[10px]" data-testid="dca-di-diagnostics-effective">
                {formatEffectiveFirstYear(Di, b)} % effective, first year
              </div>
            </div>
            <div>
              <div className="text-pl-muted mb-1">b (Exponent)</div>
              <div className="font-pl-mono tabular-nums text-pl-text">{Number.isFinite(b) ? b.toFixed(3) : 'n/a'}</div>
              {confidenceIntervals.hasIntervals && confidenceIntervals.b > 0 && (
                <div className="text-pl-muted text-[10px]" title="b is found by a grid search; the engine has no regression interval for it">±{confidenceIntervals.b.toFixed(3)} (assumed 10%)</div>
              )}
            </div>
          </div>
          <div className="text-[10px] text-pl-muted mt-2 text-center" data-testid="dca-ci-note">
            {confidenceIntervals.hasIntervals
              ? '95% intervals from the regression (delta method); the b interval is an assumed 10%, as b comes from a grid search.'
              : 'No parameter intervals: the regression could not give reliable ones for this fit.'}
          </div>
        </CardContent>
      </Card>
      
      {/* Detected Segments */}
      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 size={16} className="text-pl-muted" aria-hidden="true" />
            Detected Segments
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {detectedBreakpoints.length === 0 ? (
            <div className={`text-sm ${getSegmentStatusColor()}`}>
              No change in decline found (screening on 90 or more points; the fit is one segment)
            </div>
          ) : (
            <div className="space-y-2">
              <div className={`text-sm mb-3 ${getSegmentStatusColor()}`}>
                Possible change in decline at {detectedBreakpoints.length} date{detectedBreakpoints.length === 1 ? '' : 's'}. The fit is one segment: set the fit window to the latest decline.
              </div>
              {detectedBreakpoints.map((breakpoint, index) => (
                <div key={index} className="text-xs text-pl-text">
                  <span className="font-pl-mono tabular-nums">
                    Breakpoint {index + 1}: {breakpoint.date.toISOString().slice(0, 10)} at {rate(breakpoint.rate).toFixed(1)} {getUnits()} 
                    (a split here lifts R² by {breakpoint.slopeChange.toFixed(1)} points)
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Residuals Plot */}
      {/* chart standard: white in both themes (data-canvas="chart") */}
      <Card data-canvas="chart" className="bg-pl-chart-surface border-pl-border flex-1 min-h-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-pl-text">
            <TrendingUp size={16} className="text-pl-muted" aria-hidden="true" />
            Normalized Residuals
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 h-full flex flex-col">
          {/* definite height: ResponsiveContainer height="100%" collapses to
              zero under a min-h-only parent, which left this plot blank */}
          <div className="relative h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={residualsWithOutliers}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis 
                  dataKey="time" 
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  axisLine={{ stroke: CHART_COLORS.axisLine }}
                  tickLine={{ stroke: CHART_COLORS.axisLine }}
                  label={{ value: 'Time (days)', position: 'insideBottom', offset: -5, fill: CHART_COLORS.axisLabel, fontSize: 11 }}
                />
                <YAxis 
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  axisLine={{ stroke: CHART_COLORS.axisLine }}
                  tickLine={{ stroke: CHART_COLORS.axisLine }}
                  label={{ value: 'Normalized Residual', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 11 }}
                />
                <Tooltip 
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(value) => `Time: ${value}`}
                  formatter={(value, name) => [
                    `${value.toFixed(3)}`, 
                    name === 'residual' ? 'Residual' : name
                  ]}
                />
                <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} strokeDasharray="2 2" />
                <ReferenceLine y={outlierThreshold} stroke="#EF4444" strokeDasharray="1 1" strokeOpacity={0.5} />
                <ReferenceLine y={-outlierThreshold} stroke="#EF4444" strokeDasharray="1 1" strokeOpacity={0.5} />
                <Line 
                  type="monotone" 
                  dataKey="residual" 
                  stroke="#8B5CF6"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  dot={(props) => {
                    const { cx, cy, payload, key } = props;
                    if (cx == null || cy == null) return null;
                    const isOutlier = payload?.isOutlier;
                    return (
                      <circle 
                        key={key}
                        cx={cx}
                        cy={cy}
                        r={isOutlier ? 3 : 1.5}
                        fill={isOutlier ? '#EF4444' : '#8B5CF6'}
                        stroke="none"
                      />
                    );
                  }}
                  activeDot={{ r: 4, fill: '#8B5CF6' }}
                />
              </LineChart>
            </ResponsiveContainer>
            <ChartLogo />
          </div>
          <div className="text-[10px] text-pl-muted text-center mt-2">
            Red points: outliers beyond ±2σ ({residualsWithOutliers.filter(r => r.isOutlier).length} detected)
          </div>
        </CardContent>
      </Card>

      {/* RL5: points the analyst leaves out, each with a reason */}
      <Card className="shrink-0" data-testid="dca-exclusions">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Points left out of the fit</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2 text-xs">
          <div className="text-pl-muted" data-testid="dca-points-summary">
            {prepared.summary.used} used of {prepared.summary.imported} rows: {prepared.summary.outsideWindow} outside the window, {prepared.summary.nonPositive} at or below zero, {prepared.summary.excludedByUser} excluded by you{prepared.summary.imported - prepared.summary.withRate > 0 ? `, ${prepared.summary.imported - prepared.summary.withRate} with no ${selectedStream} rate` : ''}.
          </div>
          {residualsWithOutliers.some((r) => r.isOutlier) && (
            <div className="space-y-1">
              <label className="text-[10px] text-pl-muted" htmlFor="dca-exclude-reason">Reason for an exclusion</label>
              <Input id="dca-exclude-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. choke change, allocation error" className="h-7 text-xs" />
              {residualsWithOutliers.filter((r) => r.isOutlier).map((r) => (
                <div key={String(r.date)} className="flex items-center justify-between gap-2">
                  <span className="font-pl-mono tabular-nums">{String(r.date).slice(0, 10)}: {rate(r.observed).toFixed(1)} {getUnits()}</span>
                  <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => excludePoint(r.date, reason || 'outlier beyond 2 sigma of the residuals')}>Exclude</Button>
                </div>
              ))}
            </div>
          )}
          {excluded.length > 0 && (
            <div className="space-y-1">
              {excluded.map((e) => (
                <div key={String(e.date)} className="flex items-center justify-between gap-2">
                  <span><span className="font-pl-mono tabular-nums">{String(e.date).slice(0, 10)}</span>: {e.reason}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => restorePoint(e.date)}>Restore</Button>
                </div>
              ))}
              <p className="text-[10px] text-pl-muted">Fit again for the change to take effect.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DCAFitDiagnostics;