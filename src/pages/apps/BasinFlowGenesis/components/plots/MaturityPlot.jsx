
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';

const MaturityPlot = ({ results }) => {
    const { data, meta } = results;
    const { maturity } = data;

    const chartData = useMemo(() => {
        if (!maturity || maturity.length === 0) return [];
        let validHist = null;
        for (let hist of maturity) {
            if (hist && hist.length > 0) {
                validHist = hist;
                break;
            }
        }
        if (!validHist) return [];

        return validHist.map((h, i) => {
            const point = { age: h.age };
            meta.layers.forEach((layer, li) => {
                if (maturity[li] && maturity[li][i]) {
                    point[layer.name] = maturity[li][i].value;
                }
            });
            return point;
        });
    }, [maturity, meta]);

    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

    return (
        <div className="w-full h-full min-h-[400px] bg-slate-900/50 rounded-lg border border-slate-800 flex flex-col p-4">
            <h3 className="text-center text-sm font-medium text-slate-200 mb-4">Maturity Evolution (%Ro)</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis 
                            dataKey="age" 
                            reversed 
                            stroke="#94a3b8" 
                            label={{ value: 'Age (Ma)', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} 
                        />
                        <YAxis 
                            stroke="#94a3b8" 
                            domain={[0, 3]}
                            label={{ value: 'Vitrinite Reflectance (%Ro)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} 
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                        
                        <ReferenceArea y1={0.5} y2={1.0} fill="#4ade80" fillOpacity={0.1} />
                        <ReferenceArea y1={1.0} y2={1.3} fill="#fbbf24" fillOpacity={0.1} />
                        <ReferenceArea y1={1.3} y2={2.6} fill="#f87171" fillOpacity={0.1} />

                        {meta.layers.map((layer, idx) => (
                            <Line
                                key={layer.name}
                                type="monotone"
                                dataKey={layer.name}
                                stroke={colors[idx % colors.length]}
                                strokeWidth={2}
                                dot={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default MaturityPlot;
