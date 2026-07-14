import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

const axisProps = {
    stroke: CHART_COLORS.axisLine,
    tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};

const ResidualPlot = ({ roStats, tempStats }) => {
    if (!roStats || !tempStats) return null;

    return (
        <div className="w-full h-full bg-white border border-slate-300 rounded-lg p-4 flex flex-col overflow-hidden relative">
            <h3 className="text-center text-sm font-semibold" style={{ color: CHART_COLORS.axisLabel }}>Residual Analysis (Measured − Modeled)</h3>
            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
                <div className="flex flex-col h-full">
                    <h4 className="text-xs text-center text-slate-600 mb-2">Ro Residuals (%)</h4>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={roStats} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                                <XAxis type="number" {...axisProps} label={{ value: 'Residual', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
                                <YAxis type="number" dataKey="depth" reversed {...axisProps} label={{ value: 'Depth (m)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                                <Bar dataKey="residual" fill="#db2777" name="Ro Residual" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="flex flex-col h-full">
                    <h4 className="text-xs text-center text-slate-600 mb-2">Temperature Residuals (°C)</h4>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={tempStats} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                                <XAxis type="number" {...axisProps} label={{ value: 'Residual', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
                                <YAxis type="number" dataKey="depth" reversed {...axisProps} />
                                <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                                <Bar dataKey="residual" fill="#d97706" name="Temp Residual" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            <ChartLogo />
        </div>
    );
};

export default ResidualPlot;
