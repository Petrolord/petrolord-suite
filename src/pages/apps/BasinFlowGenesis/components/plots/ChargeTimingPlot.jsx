
import React, { useMemo } from 'react';
import { ComposedChart, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ChargeTimingPlot = ({ results }) => {
    const { data, meta } = results;
    
    const chartData = useMemo(() => {
        return meta.layers.map((layer, index) => {
            const genHist = data.generation[index];
            if(!genHist) return null;
            
            const activeGen = genHist.filter(h => h.value > 0.001);
            if(activeGen.length === 0) return null;
            
            const startAge = activeGen[0].age;
            const endAge = activeGen[activeGen.length-1].age;
            const peak = activeGen.reduce((prev, current) => (prev.value > current.value) ? prev : current);
            
            return {
                name: layer.name,
                range: [endAge, startAge], // smaller age to larger age
                peakAge: peak.age
            };
        }).filter(Boolean);
    }, [data, meta]);

    if (chartData.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-800">
                <p className="text-slate-400">No significant generation events detected.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full min-h-[400px] bg-slate-900/50 rounded-lg border border-slate-800 flex flex-col p-4">
            <h3 className="text-center text-sm font-medium text-slate-200 mb-4">Petroleum Systems Events Chart</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart layout="vertical" data={chartData} margin={{ top: 20, right: 30, left: 60, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                        <XAxis 
                            type="number" 
                            reversed 
                            stroke="#94a3b8" 
                            label={{ value: 'Age (Ma)', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} 
                        />
                        <YAxis 
                            type="category" 
                            dataKey="name" 
                            stroke="#94a3b8" 
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                        <Bar dataKey="range" fill="rgba(74, 222, 128, 0.6)" name="Generation Window" barSize={20} />
                        <Scatter dataKey="peakAge" fill="gold" name="Peak Charge" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default ChargeTimingPlot;
