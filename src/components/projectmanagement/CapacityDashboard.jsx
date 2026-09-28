import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartPanel } from '@/components/ui/chart-panel';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ComposedChart, Line } from 'recharts';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';

// Charts sit on the white chart standard in both themes.
const AXIS = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText } };

const CapacityDashboard = ({ resources = [], assignments = [], tasks = [] }) => {
  
  // Calculate workload per resource over the next 4 weeks
  const workloadData = useMemo(() => {
    const today = new Date();
    const startDate = startOfWeek(today);
    const days = Array.from({ length: 28 }, (_, i) => addDays(startDate, i)); // 4 weeks

    // Initialize data structure
    const data = resources.map(res => {
        const resourceAssignments = assignments.filter(a => a.resource_id === res.id);
        const dailyLoad = days.map(day => {
            // Find assignments active on this day
            const active = resourceAssignments.filter(a => {
                const start = new Date(a.start_date);
                const end = new Date(a.end_date);
                return day >= start && day <= end;
            });
            
            // Sum up allocation percentage
            const totalPercent = active.reduce((sum, a) => sum + (parseFloat(a.allocation_percent) || 0), 0);
            return { date: day, load: totalPercent };
        });

        return {
            ...res,
            dailyLoad
        };
    });

    return { days, resourceData: data };
  }, [resources, assignments]);

  // Chart data for utilization summary
  const utilizationChartData = useMemo(() => {
      return workloadData.resourceData.map(res => {
          const avgLoad = res.dailyLoad.reduce((sum, d) => sum + d.load, 0) / res.dailyLoad.length;
          return {
              name: res.name,
              utilization: Math.round(avgLoad),
              discipline: res.discipline,
              capacity: res.availability_percent || 100
          };
      }).sort((a, b) => b.utilization - a.utilization);
  }, [workloadData]);

  // Chart data for discipline breakdown
  const disciplineData = useMemo(() => {
      const disciplines = {};
      utilizationChartData.forEach(u => {
          if (!disciplines[u.discipline]) disciplines[u.discipline] = { name: u.discipline, count: 0, totalUtil: 0 };
          disciplines[u.discipline].count += 1;
          disciplines[u.discipline].totalUtil += u.utilization;
      });
      return Object.values(disciplines).map(d => ({
          name: d.name,
          avgUtilization: Math.round(d.totalUtil / d.count),
          headcount: d.count
      }));
  }, [utilizationChartData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Resource Utilization Bar Chart */}
      <ChartPanel title="Resource Utilization (Next 4 Weeks)" className="lg:col-span-2">
        <div className="relative h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utilizationChartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} horizontal={false} />
                    <XAxis type="number" domain={[0, 150]} {...AXIS} fontSize={12} />
                    <YAxis dataKey="name" type="category" width={120} {...AXIS} fontSize={12} />
                    <Tooltip 
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ fill: CHART_COLORS.grid, opacity: 0.5 }}
                    />
                    <Legend {...LEGEND_PROPS} />
                    <Bar dataKey="utilization" name="Avg % Utilization" barSize={20} radius={[0, 4, 4, 0]}>
                        {utilizationChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.utilization > 100 ? '#ef4444' : entry.utilization > 80 ? '#f59e0b' : '#3b82f6'} />
                        ))}
                    </Bar>
                    <Bar dataKey="capacity" name="Capacity Limit" barSize={2} fill="#94a3b8" />
                </BarChart>
            </ResponsiveContainer>
            <ChartLogo />
        </div>
      </ChartPanel>

      {/* Discipline Breakdown */}
      <ChartPanel title="Discipline Load">
        <div className="relative h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={disciplineData}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="name" {...AXIS} fontSize={10} interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis yAxisId="left" {...AXIS} fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" {...AXIS} fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend {...LEGEND_PROPS} />
                    <Bar yAxisId="left" dataKey="avgUtilization" name="Avg Utilization %" fill="#8b5cf6" barSize={30} />
                    <Line yAxisId="right" type="monotone" dataKey="headcount" name="Headcount" stroke="#10b981" strokeWidth={2} />
                </ComposedChart>
            </ResponsiveContainer>
            <ChartLogo />
        </div>
      </ChartPanel>

      {/* Over-allocation Alert */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-pl-text">Critical Alerts</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="space-y-3 max-h-[260px] overflow-y-auto">
                {utilizationChartData.filter(u => u.utilization > 100).map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-pl-danger-bg border border-pl-danger/40 rounded-lg">
                        <div>
                            <div className="font-bold text-pl-danger-text">{u.name}</div>
                            <div className="text-xs text-pl-danger-text">{u.discipline}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-bold font-pl-mono tabular-nums text-pl-danger-text">{u.utilization}%</div>
                            <div className="text-xs text-pl-muted">Utilization</div>
                        </div>
                    </div>
                ))}
                {utilizationChartData.filter(u => u.utilization > 100).length === 0 && (
                    <div className="text-center text-pl-muted py-10">
                        No over-allocated resources detected.
                    </div>
                )}
            </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CapacityDashboard;