
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ResidualPlot = ({ roStats, tempStats }) => {
    if (!roStats || !tempStats) return null;

    return (
        <div className="w-full h-full bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col overflow-hidden">
            <h3 className="text-center text-sm font-medium text-slate-200 mb-4">Residual Analysis (Measured - Modeled)</h3>
            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
                <div className="flex flex-col h-full">
                    <h4 className="text-xs text-center text-slate-400 mb-2">Ro Residuals (%)</h4>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={roStats} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={true} />
                                <XAxis type="number" stroke="#94a3b8" label={{ value: 'Residual', position: 'bottom', fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis type="number" dataKey="depth" reversed stroke="#94a3b8" label={{ value: 'Depth (m)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Bar dataKey="residual" fill="#f472b6" name="Ro Residual" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                
                <div className="flex flex-col h-full">
                    <h4 className="text-xs text-center text-slate-400 mb-2">Temperature Residuals (°C)</h4>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={tempStats} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={true} />
                                <XAxis type="number" stroke="#94a3b8" label={{ value: 'Residual', position: 'bottom', fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis type="number" dataKey="depth" reversed stroke="#94a3b8" />
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Bar dataKey="residual" fill="#fbbf24" name="Temp Residual" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResidualPlot;
