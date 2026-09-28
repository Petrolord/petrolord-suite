import React, { useState, useEffect } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AlertCircle, CheckCircle, TrendingUp, Target, BarChart3 } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import { calculateR2, calculateRMSE, calculateResiduals, getVerdictInfo, calculateArpsConfidenceIntervals } from '@/utils/dcaDiagnostics';
import { detectSegmentBreakpoints } from '@/utils/dcaSegmentDetection';
import { calculateArpsHyperbolic } from '@/utils/declineCurve/dcaEngine';
import { getStreamRate } from '@/utils/declineCurve/csvParser';
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STYLE, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

const DCAFitDiagnostics = () => {
  const { wells, currentWellId, currentWell, selectedStream, streamState } = useDeclineCurve();
  const [detectedBreakpoints, setDetectedBreakpoints] = useState([]);
  
  const fitResults = streamState[selectedStream]?.fitResults;
  const wellData = wells?.[currentWellId];
  const productionData = wellData?.data || [];
  
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
      setDetectedBreakpoints([]);
    }
  }, [currentWellId, selectedStream]);
  
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

  // Extract fit data for calculations
  const { actualData, predictedData, parameters } = fitResults;
  // Prefer fit engine's own metrics; fall back to recomputation only if needed
  const qi = fitResults.qi ?? parameters?.qi;
  const Di = fitResults.Di ?? parameters?.Di;
  const b  = fitResults.b  ?? parameters?.b;
  const r2   = (typeof fitResults.R2 === 'number') ? fitResults.R2
              : calculateR2(actualData, predictedData);
  const rmse = (typeof fitResults.RMSE === 'number') ? fitResults.RMSE
              : calculateRMSE(actualData, predictedData);
  let residuals = [];
  if (fitResults && fitResults.qi && fitResults.t0 && productionData.length > 0) {
    const t0ms = new Date(fitResults.t0).getTime();
    residuals = productionData
      .map(p => ({ ...p, streamRate: getStreamRate(p, selectedStream) }))
      .filter(p => p.streamRate > 0)
      .map(p => {
        const tDays = (new Date(p.date).getTime() - t0ms) / 86400000;
        const predicted = calculateArpsHyperbolic(fitResults.qi, fitResults.Di, fitResults.b, tDays);
        const rawResidual = p.streamRate - predicted;
        // Normalize residual by observed rate for comparability across magnitudes
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
  const confidenceIntervals = calculateArpsConfidenceIntervals(parameters, actualData, predictedData);
  
  // R² color coding
  const getR2Color = (r2Value) => {
    if (r2Value >= 0.95) return 'text-pl-success-text';
    if (r2Value >= 0.85) return 'text-pl-warning-text';
    return 'text-pl-danger-text';
  };
  
  const getR2BadgeVariant = (r2Value) => {
    if (r2Value >= 0.95) return 'success';
    if (r2Value >= 0.85) return 'warning';
    return 'danger';
  };
  
  // Format units based on stream
  const getUnits = () => {
    switch(selectedStream) {
      case 'gas': return 'Mcf/d';
      case 'water': return 'bbl/d';
      default: return 'bbl/d';
    }
  };
  
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
                  {(r2 * 100).toFixed(1)}%
                </div>
              </div>
              <Badge variant={getR2BadgeVariant(r2)}>
                {r2 >= 0.95 ? 'Excellent' : r2 >= 0.85 ? 'Good' : 'Poor'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div>
              <div className="text-xs text-pl-muted uppercase tracking-wide">RMSE</div>
              <div className="text-lg font-semibold text-pl-text font-pl-mono tabular-nums">
                {rmse.toFixed(1)}
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
              <div className="font-pl-mono tabular-nums text-pl-text">{qi?.toFixed(1) || 'N/A'} {getUnits()}</div>
              {confidenceIntervals.qi && (
                <div className="text-pl-muted text-[10px]">±{confidenceIntervals.qi.toFixed(1)}</div>
              )}
            </div>
            <div>
              <div className="text-pl-muted mb-1">Di (Initial Decline)</div>
              <div className="font-pl-mono tabular-nums text-pl-text">{Di ? (Di * 100).toFixed(2) : 'N/A'}%/yr</div>
              {confidenceIntervals.Di && (
                <div className="text-pl-muted text-[10px]">±{(confidenceIntervals.Di * 100).toFixed(2)}%</div>
              )}
            </div>
            <div>
              <div className="text-pl-muted mb-1">b (Exponent)</div>
              <div className="font-pl-mono tabular-nums text-pl-text">{b?.toFixed(3) || 'N/A'}</div>
              {confidenceIntervals.b && (
                <div className="text-pl-muted text-[10px]">±{confidenceIntervals.b.toFixed(3)}</div>
              )}
            </div>
          </div>
          {confidenceIntervals.hasIntervals && (
            <div className="text-[10px] text-pl-muted mt-2 text-center">95% Confidence Intervals</div>
          )}
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
              Single-segment decline pattern detected
            </div>
          ) : (
            <div className="space-y-2">
              <div className={`text-sm mb-3 ${getSegmentStatusColor()}`}>
                {detectedBreakpoints.length + 1}-segment decline pattern detected
              </div>
              {detectedBreakpoints.map((breakpoint, index) => (
                <div key={index} className="text-xs text-pl-text">
                  <span className="font-pl-mono tabular-nums">
                    Breakpoint {index + 1}: {breakpoint.date.toLocaleDateString()} @ {breakpoint.rate.toFixed(1)} {getUnits().split('/')[0]} 
                    (slope change: {breakpoint.slopeChange.toFixed(1)}%)
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
    </div>
  );
};

export default DCAFitDiagnostics;