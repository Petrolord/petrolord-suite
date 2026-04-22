import React, { useState, useMemo } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { exportChartAsImage } from '@/utils/declineCurve/dcaExport';
import { Camera } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label } from 'recharts';
import { calculateArpsHyperbolic } from '@/utils/declineCurve/dcaEngine';

const DCABasePlots = () => {
  const [logScale, setLogScale] = useState(true);
  const { currentData, selectedStream, streamState } = useDeclineCurve();
  
  const forecastResults = streamState[selectedStream]?.forecastResults;
  
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
      forecastResults.rates.forEach(point => {
        merged.push({
          date: point.date,
          history: null,
          forecast: point.rate,
          fitted: null
        });
      });
    }
    
    return merged.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [currentData, forecastResults, streamState, selectedStream]);
  
  // Get stream-specific colors
  const getStreamColor = (stream, variant = 'primary') => {
    const colors = {
      oil: { primary: '#10b981', light: '#34d399' }, // emerald-500, emerald-400
      gas: { primary: '#f59e0b', light: '#fbbf24' },   // amber-500, amber-400  
      water: { primary: '#3b82f6', light: '#60a5fa' }  // blue-500, blue-400
    };
    return colors[stream]?.[variant] || colors.oil[variant];
  };
  
  // Get Y-axis label based on stream
  const getYAxisLabel = () => {
    switch(selectedStream) {
      case 'gas': return 'Rate (Mscf/d)';
      case 'water': return 'Rate (bbl/d)';
      default: return 'Rate (bbl/d)';
    }
  };
  
  return (
    <div id="dca-main-plot" className="h-full flex flex-col bg-slate-900 rounded-lg border border-slate-800 overflow-hidden shadow-inner">
        <div className="p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <div className="flex gap-2">
              <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`text-xs h-7 ${logScale ? 'bg-blue-900/30 text-blue-400 border border-blue-900' : 'text-slate-400'}`}
                  onClick={() => setLogScale(!logScale)}
              >
                  {logScale ? 'Log Scale' : 'Linear Scale'}
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportChartAsImage('dca-main-plot', 'dca_plot')}>
                <Camera size={14} className="text-slate-400" />
            </Button>
        </div>
        
        <div className="flex-1 relative min-h-[400px] w-full">
          {!currentData || currentData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-center">
              Upload production data to begin
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis 
                  dataKey="date" 
                  type="category"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                >
                  <Label value="Date" position="insideBottom" offset={-5} style={{ fill: '#94a3b8', fontSize: 11 }} />
                </XAxis>
                <YAxis 
                  scale={logScale ? 'log' : 'auto'}
                  domain={logScale ? ['auto', 'auto'] : ['auto', 'auto']}
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                >
                  <Label 
                    value={getYAxisLabel()} 
                    angle={-90} 
                    position="insideLeft"
                    style={{ fill: '#94a3b8', fontSize: 11 }}
                  />
                </YAxis>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: '#334155',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value, name) => [
                    value ? value.toFixed(1) : 'N/A',
                    name
                  ]}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                />
                
                {/* Historical Data as Scatter */}
                <Scatter 
                  dataKey="history"
                  fill={getStreamColor(selectedStream)}
                  name="Historical"
                  shape="circle"
                />
                
                {/* Fitted Model Line */}
                <Line 
                  type="monotone"
                  dataKey="fitted"
                  stroke={`${getStreamColor(selectedStream, 'light')}99`}
                  strokeWidth={1.5}
                  strokeDasharray="none"
                  dot={false}
                  name="Fitted Model"
                  connectNulls={false}
                />
                
                {/* Forecast Data as Line */}
                <Line 
                  type="monotone"
                  dataKey="forecast"
                  stroke={getStreamColor(selectedStream, 'light')}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  name="Forecast"
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
    </div>
  );
};

export default DCABasePlots;