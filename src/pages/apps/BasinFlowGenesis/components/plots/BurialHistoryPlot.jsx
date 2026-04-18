
import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const BurialHistoryPlot = ({ results }) => {
    const { data, meta } = results;
    const { timeSteps, burial } = data;

    const chartData = useMemo(() => {
        if (!timeSteps || timeSteps.length === 0 || !burial || burial.length === 0) return [];
        return timeSteps.map((age, i) => {
            const point = { age };
            meta.layers.forEach((layer, li) => {
                if (burial[li] && burial[li][i]) {
                    point[`${layer.name}_bot`] = burial[li][i].bottom;
                    point[`${layer.name}_top`] = burial[li][i].top;
                }
            });
            return point;
        });
    }, [timeSteps, burial, meta]);

    const colorMap = {
        sandstone: '#f4a261',
        shale: '#264653',
        limestone: '#2a9d8f',
        salt: '#e9c46a',
        coal: '#1d1d1d'
    };

    return (
        <div className="w-full h-full min-h-[400px] bg-slate-900/50 rounded-lg border border-slate-800 flex flex-col p-4">
            <h3 className="text-center text-sm font-medium text-slate-200 mb-4">Burial History</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis 
                            dataKey="age" 
                            reversed 
                            stroke="#94a3b8" 
                            label={{ value: 'Age (Ma)', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} 
                        />
                        <YAxis 
                            reversed 
                            stroke="#94a3b8" 
                            label={{ value: 'Depth (m)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} 
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                        {meta.layers.map((layer) => (
                            <Area
                                key={layer.name}
                                type="monotone"
                                dataKey={(d) => [d[`${layer.name}_top`] || 0, d[`${layer.name}_bot`] || 0]}
                                name={layer.name}
                                stroke={colorMap[layer.lithology] || '#888'}
                                fill={colorMap[layer.lithology] || '#888'}
                                fillOpacity={0.8}
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default BurialHistoryPlot;
