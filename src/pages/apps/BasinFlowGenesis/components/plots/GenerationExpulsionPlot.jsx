
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const GenerationExpulsionPlot = ({ results }) => {
    const { data, meta } = results;
    const { transformation } = data;

    const chartData = useMemo(() => {
        if (!transformation || transformation.length === 0) return [];
        // Assuming consistent ages across histories, get ages from the first valid layer
        let validHist = null;
        for (let hist of transformation) {
            if (hist && hist.length > 0) {
                validHist = hist;
                break;
            }
        }
        if (!validHist) return [];

        return validHist.map((h, i) => {
            const point = { age: h.age };
            meta.layers.forEach((layer, li) => {
                if (transformation[li] && transformation[li][i]) {
                    point[layer.name] = transformation[li][i].value;
                }
            });
            return point;
        });
    }, [transformation, meta]);

    // Check if there is any significant TR
    const hasSignificantTR = useMemo(() => {
        for (let i = 0; i < meta.layers.length; i++) {
            const hist = transformation[i];
            if (hist && Math.max(...hist.map(h => h.value)) >= 0.01) return true;
        }
        return false;
    }, [transformation, meta]);

    if (!hasSignificantTR) {
        return (
             <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-800">
                <p className="text-slate-400">No significant hydrocarbon generation detected.</p>
            </div>
        );
    }

    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

    return (
        <div className="w-full h-full min-h-[400px] bg-slate-900/50 rounded-lg border border-slate-800 flex flex-col p-4">
            <h3 className="text-center text-sm font-medium text-slate-200 mb-4">Transformation Ratio</h3>
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
                            domain={[0, 1.05]}
                            label={{ value: 'TR (Fraction)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} 
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
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

export default GenerationExpulsionPlot;
