import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartPanel } from '@/components/ui/chart-panel';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';

// Charts sit on the white chart standard in both themes.
const AXIS = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: 12 } };

const ProgressAnalytics = ({ projectId, updates }) => {
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    if (updates && updates.length > 0) {
        // Transform updates for charts, sorting by date
        const data = [...updates]
            .sort((a, b) => new Date(a.report_date) - new Date(b.report_date))
            .map(u => ({
                date: format(new Date(u.report_date), 'MMM dd'),
                percent: u.percent_complete,
                spi: u.spi,
                cpi: u.cpi,
                ev: u.earned_value || 0,
                pv: u.planned_value || 0,
                ac: u.actual_cost || 0
            }));
        setChartData(data);
    }
  }, [updates]);

  if (!updates || updates.length === 0) {
      return (
          <div className="flex items-center justify-center h-64 border border-dashed border-pl-border rounded-lg bg-pl-surface text-pl-muted">
            No progress history available. Submit your first weekly update to see trends.
          </div>
      );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Progress Burn-up Chart */}
      <ChartPanel title="Progress Trend">
        <div className="relative h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="date" {...AXIS} />
                    <YAxis {...AXIS} domain={[0, 100]} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend {...LEGEND_PROPS} />
                    <Line type="monotone" dataKey="percent" name="% Complete" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
            </ResponsiveContainer>
            <ChartLogo />
        </div>
      </ChartPanel>

      {/* EVM Trends (Earned Value vs Planned Value) */}
      <ChartPanel title="Earned Value Analysis">
        <div className="relative h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="date" {...AXIS} />
                    <YAxis {...AXIS} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend {...LEGEND_PROPS} />
                    <Line type="monotone" dataKey="ev" name="Earned Value (EV)" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="pv" name="Planned Value (PV)" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="ac" name="Actual Cost (AC)" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
            </ResponsiveContainer>
            <ChartLogo />
        </div>
      </ChartPanel>

      {/* Performance Indices */}
       <ChartPanel title="Performance Efficiency (SPI & CPI)">
        <div className="relative h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="date" {...AXIS} />
                    <YAxis {...AXIS} domain={[0, 'auto']} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend {...LEGEND_PROPS} />
                    <Bar dataKey="spi" name="Schedule (SPI)" fill="#3b82f6" />
                    <Bar dataKey="cpi" name="Cost (CPI)" fill="#a855f7" />
                </BarChart>
            </ResponsiveContainer>
            <ChartLogo />
        </div>
      </ChartPanel>
      
      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-pl-text">Update History</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm text-left text-pl-text">
                <thead className="text-xs text-pl-muted uppercase bg-pl-sunken sticky top-0">
                    <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">%</th>
                        <th className="px-4 py-2">Narrative</th>
                    </tr>
                </thead>
                <tbody>
                    {updates.slice().reverse().map((u, i) => (
                        <tr key={i} className="border-b border-pl-border hover:bg-pl-sunken/60">
                            <td className="px-4 py-2 font-pl-mono tabular-nums">{format(new Date(u.report_date), 'MMM dd')}</td>
                            <td className="px-4 py-2">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    u.status === 'Green' ? 'bg-pl-success-bg text-pl-success-text' :
                                    u.status === 'Amber' ? 'bg-pl-warning-bg text-pl-warning-text' : 'bg-pl-danger-bg text-pl-danger-text'
                                }`}>{u.status}</span>
                            </td>
                            <td className="px-4 py-2 font-pl-mono tabular-nums">{u.percent_complete}%</td>
                            <td className="px-4 py-2 truncate max-w-[200px]" title={u.narrative}>{u.narrative}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProgressAnalytics;