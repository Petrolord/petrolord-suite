import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Label } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS } from '@/utils/chartTheme';

const CATEGORY_COLORS = {
  'Subsurface': '#3b82f6', // Blue
  'Drilling': '#ef4444',   // Red
  'Commercial': '#22c55e', // Green
  'HSSE': '#f97316',       // Orange
  'Digital': '#a855f7',    // Purple
  'Other': '#94a3b8'       // Slate
};

// The matrix sits on the white chart standard in both themes (data-canvas="chart").
const RiskMatrix = ({ risks, onRiskClick }) => {

  // Transform data for chart
  const data = risks.map(r => ({
    ...r,
    x: r.impact || 1,
    y: r.probability || 1,
    z: r.risk_score || (r.impact * r.probability) || 1,
    fill: CATEGORY_COLORS[r.category] || CATEGORY_COLORS['Other']
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const risk = payload[0].payload;
      return (
        <div className="bg-white border border-slate-300 p-3 rounded shadow-xl z-50 max-w-[250px]">
          <p className="text-sm font-bold text-slate-900 mb-1">{risk.title || risk.description?.substring(0, 30)}</p>
          <div className="text-xs text-slate-700 space-y-1">
            <p><span className="text-slate-500">Score:</span> {risk.risk_score}</p>
            <p><span className="text-slate-500">Category:</span> <span style={{color: risk.fill}}>{risk.category}</span></p>
            <p><span className="text-slate-500">Owner:</span> {risk.owner || 'Unassigned'}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div data-canvas="chart" className="w-full h-[400px] bg-white border border-slate-200 rounded-lg p-4 relative select-none">
      <div className="absolute top-4 right-4 flex flex-col gap-2 text-[10px] bg-white/90 p-2 rounded border border-slate-200 z-10">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
                <span className="text-slate-700">{cat}</span>
            </div>
        ))}
      </div>
      
      {/* Background Grid Colors */}
      <div className="absolute inset-0 z-0 m-12 grid grid-cols-5 grid-rows-5 opacity-20 pointer-events-none">
         {/* Row 5 (Prob 5) */}
         <div className="bg-yellow-500"></div><div className="bg-orange-500"></div><div className="bg-orange-600"></div><div className="bg-red-600"></div><div className="bg-red-700"></div>
         {/* Row 4 (Prob 4) */}
         <div className="bg-green-500"></div><div className="bg-yellow-500"></div><div className="bg-orange-500"></div><div className="bg-red-500"></div><div className="bg-red-600"></div>
         {/* Row 3 (Prob 3) */}
         <div className="bg-green-600"></div><div className="bg-green-500"></div><div className="bg-yellow-500"></div><div className="bg-orange-500"></div><div className="bg-red-500"></div>
         {/* Row 2 (Prob 2) */}
         <div className="bg-green-700"></div><div className="bg-green-600"></div><div className="bg-green-500"></div><div className="bg-yellow-500"></div><div className="bg-orange-500"></div>
         {/* Row 1 (Prob 1) */}
         <div className="bg-green-800"></div><div className="bg-green-700"></div><div className="bg-green-600"></div><div className="bg-green-500"></div><div className="bg-yellow-500"></div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <XAxis 
            type="number" 
            dataKey="x" 
            name="Impact" 
            domain={[0.5, 5.5]} 
            tickCount={6} 
            stroke={CHART_COLORS.axisLine}
            tick={{ fill: CHART_COLORS.axisText }}
            label={{ value: 'Impact', position: 'bottom', fill: CHART_COLORS.axisLabel }}
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name="Probability" 
            domain={[0.5, 5.5]} 
            tickCount={6} 
            stroke={CHART_COLORS.axisLine}
            tick={{ fill: CHART_COLORS.axisText }}
            label={{ value: 'Probability', angle: -90, position: 'left', fill: CHART_COLORS.axisLabel }}
          />
          <ZAxis type="number" dataKey="z" range={[100, 500]} name="Score" />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name="Risks" data={data} onClick={(e) => onRiskClick && onRiskClick(e.payload)}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke="#fff" strokeWidth={1} className="cursor-pointer hover:opacity-80" />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <ChartLogo />
    </div>
  );
};

export default RiskMatrix;