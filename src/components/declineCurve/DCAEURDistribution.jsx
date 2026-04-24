import React from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { createEURHistogram } from '@/utils/dcaMonteCarlo';

const DCAEURDistribution = ({ distribution, selectedStream }) => {
  if (!distribution || distribution.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-slate-500 text-xs">
        No distribution data
      </div>
    );
  }

  const histogramData = createEURHistogram(distribution, 15);
  
  const getUnits = () => {
    switch(selectedStream) {
      case 'gas': return 'Mcf';
      case 'water': return 'bbl';
      default: return 'bbl';
    }
  };

  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={histogramData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <XAxis 
            dataKey="bin" 
            hide
          />
          <YAxis hide />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1F2937', 
              border: '1px solid #374151',
              borderRadius: '4px',
              fontSize: '11px'
            }}
            labelFormatter={(value) => `EUR: ${Number(value).toLocaleString()} ${getUnits()}`}
            formatter={(value) => [`${value} runs`, 'Frequency']}
          />
          <Bar 
            dataKey="count" 
            fill="#8B5CF6" 
            stroke="#A855F7"
            strokeWidth={0.5}
            radius={[1, 1, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DCAEURDistribution;