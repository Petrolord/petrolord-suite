import React, { useState, useMemo } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { exportChartAsImage } from '@/utils/declineCurve/dcaExport';
import { Camera } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label } from 'recharts';
import { calculateArpsHyperbolic } from '@/utils/declineCurve/dcaEngine';
import {
  CHART_COLORS,
  CHART_TYPOGRAPHY,
  CHART_MARGINS,
  GRID_STYLE,
  TOOLTIP_STYLE,
  ANNOTATION_BOX_CLASSNAME,
  getStreamPalette
} from '@/utils/chartTheme';

const DCABasePlots = () => {
  const [logScale, setLogScale] = useState(true);
  const { currentData, selectedStream, streamState } = useDeclineCurve();
  
  const forecastResults = streamState[selectedStream]?.forecastResults;
  const fit = streamState[selectedStream]?.fitResults;
  
  // Merge historical and forecast data
  const chartData = useMemo(() => {
    if (!currentData || currentData.length === 0) return [];
    
    const merged = [];
    
    // Add historical points with fitted values
    currentData.forEach(point => {
      let fitted = null;
      
      // Calculate fitted value if fit results exist
      const fit = streamState[selectedStream]?.fitResults;
      if (fit && fit.qi && fit.Di !== undefined && fit.b !== undefined && fit.t0) {
        const tDays = (new Date(point.date) - new Date(fit.t0)) / 86400000;
        fitted = calculateArpsHyperbolic(fit.qi, fit.Di, fit.b, tDays);
      }
      
      merged.push({
        date: point.date,
        history: point.rate,
        forecast: null,
        fitted: fitted
      });
    });
    
    // Add forecast points if available
    if (forecastResults?.rates) {
      // Compute P10/P90 analytic envelope from fit + CIs (industry-standard)
      const ci = fit?.confidenceIntervals;
      const showProb = !!forecastResults?.probabilistic && ci?.hasIntervals;
      // 1.28σ ≈ 80% range (P10–P90 in petroleum convention).
      // Optimistic: higher qi, lower Di → upper envelope
      // Pessimistic: lower qi, higher Di → lower envelope
      const z = 1.28;
      const qiOpt  = showProb ? fit.qi + z * (ci.qi || 0) : null;
      const qiPess = showProb ? Math.max(fit.qi - z * (ci.qi || 0), 0.001) : null;
      const DiOpt  = showProb ? Math.max(fit.Di - z * (ci.Di || 0), 0.0001) : null;
      const DiPess = showProb ? fit.Di + z * (ci.Di || 0) : null;

      forecastResults.rates.forEach(point => {
        const row = {
          date: point.date,
          history: null,
          forecast: point.rate,
          fitted: null,
          p10: null,
          p90: null
        };
        if (showProb) {
          const tDays = (new Date(point.date) - new Date(fit.t0)) / 86400000;
          const r10 = calculateArpsHyperbolic(qiOpt, DiOpt, fit.b, tDays);
          const r90 = calculateArpsHyperbolic(qiPess, DiPess, fit.b, tDays);
          // Defensive: ensure p10 >= p90 (high >= low) for the band
          row.p10 = Math.max(r10, r90);
          row.p90 = Math.min(r10, r90);
        }
        merged.push(row);
      });
    }
    
    return merged.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [currentData, forecastResults, streamState, selectedStream]);
  
  // Get Y-axis label based on stream
  const getYAxisLabel = () => {
    switch(selectedStream) {
      case 'gas': return 'Rate (Mscf/d)';
      case 'water': return 'Rate (bbl/d)';
      default: return 'Rate (bbl/d)';
    }
  };
  
  // Get stream palette
  const palette = getStreamPalette(selectedStream);
  
  return (
    <div id="dca-main-plot" className="h-full flex flex-col bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
        <div className="p-2 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="flex gap-2">
              <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`text-xs h-7 ${
                    logScale 
                      ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                      : 'text-slate-600'
                  }`}
                  onClick={() => setLogScale(!logScale)}
              >
                  {logScale ? 'Log Scale' : 'Linear Scale'}
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportChartAsImage('dca-main-plot', 'dca_plot')}>
                <Camera size={14} className="text-slate-600" />
            </Button>
        </div>
        
        <div className="flex-1 relative min-h-[400px] w-full">
          {!currentData || currentData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-center">
              Upload production data to begin
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={CHART_MARGINS.standard}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis 
                    dataKey="date" 
                    type="category"
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  >
                    <Label 
                      value="Date" 
                      position="insideBottom" 
                      offset={-5} 
                      style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} 
                    />
                  </XAxis>
                  <YAxis 
                    scale={logScale ? 'log' : 'auto'}
                    domain={logScale ? ['auto', 'auto'] : ['auto', 'auto']}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                  >
                    <Label 
                      value={getYAxisLabel()} 
                      angle={-90} 
                      position="insideLeft"
                      style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                    />
                  </YAxis>
                  <Tooltip 
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(value, name) => {
                      // Skip range values (P10-P90 band) - they come as arrays
                      if (Array.isArray(value)) {
                        return [`${value[0].toFixed(1)} – ${value[1].toFixed(1)}`, name];
                      }
                      // Skip null/undefined
                      if (value == null) return ['N/A', name];
                      // Standard numeric value
                      if (typeof value === 'number') {
                        return [value.toFixed(1), name];
                      }
                      return ['N/A', name];
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36}
                    wrapperStyle={{ 
                      fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`, 
                      paddingTop: '10px',
                      color: CHART_COLORS.legendText
                    }}
                  />
                  
                  {/* Historical Data as Scatter */}
                  <Scatter 
                    dataKey="history"
                    fill={palette.primary}
                    name="Historical"
                    shape="circle"
                  />
                  
                  {/* Fitted Model Line */}
                  <Line 
                    type="monotone"
                    dataKey="fitted"
                    stroke={palette.fitted}
                    strokeWidth={1.5}
                    strokeDasharray="none"
                    dot={false}
                    name="Fitted Model"
                    connectNulls={false}
                  />
                  
                  {/* P10–P90 Envelope Band (filled area) */}
                  <Area
                    type="monotone"
                    dataKey={(d) => (d.p10 != null && d.p90 != null) ? [d.p90, d.p10] : null}
                    stroke="none"
                    fill={palette.forecast}
                    fillOpacity={0.18}
                    name="P10–P90 Range"
                    connectNulls={false}
                    isAnimationActive={false}
                    activeDot={false}
                  />

                  {/* P10 (optimistic) boundary */}
                  <Line
                    type="monotone"
                    dataKey="p10"
                    stroke={palette.forecast}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    strokeOpacity={0.7}
                    dot={false}
                    activeDot={false}
                    name="P10"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* P90 (pessimistic) boundary */}
                  <Line
                    type="monotone"
                    dataKey="p90"
                    stroke={palette.forecast}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    strokeOpacity={0.7}
                    dot={false}
                    activeDot={false}
                    name="P90"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* Forecast Data as Line (P50 / deterministic central) */}
                  <Line 
                    type="monotone"
                    dataKey="forecast"
                    stroke={palette.forecast}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    name="Forecast (P50)"
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              
              {/* Parameter Annotation Box */}
              {fit && (
                <div className={ANNOTATION_BOX_CLASSNAME}>
                  <div className="flex flex-col gap-0.5">
                    <div>Model: {fit.modelType}</div>
                    <div>qi: {fit.qi.toFixed(0)} {selectedStream === 'gas' ? 'Mscf/d' : 'bbl/d'}</div>
                    <div>Di: {(fit.Di * 365 * 100).toFixed(1)}%/yr</div>
                    <div>b: {fit.b.toFixed(2)}</div>
                    <div>R²: {fit.R2.toFixed(3)}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
    </div>
  );
};

export default DCABasePlots;