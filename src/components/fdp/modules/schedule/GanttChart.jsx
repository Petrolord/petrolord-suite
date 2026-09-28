import React from 'react';
import { ChartPanel } from '@/components/ui/chart-panel';
import { differenceInDays, parseISO, addDays, format } from 'date-fns';

const GanttChart = ({ activities }) => {
    if (!activities || activities.length === 0) return <div className="text-pl-muted p-4">No schedule data available.</div>;

    // Determine timeline bounds
    const dates = activities.map(a => [new Date(a.start), new Date(a.end)]).flat();
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    // Add buffer
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 30);

    const totalDays = differenceInDays(maxDate, minDate);
    const pxPerDay = 40; // Width of one day column
    const chartWidth = totalDays * pxPerDay;

    // Generate timeline header
    const months = [];
    let curr = new Date(minDate);
    while (curr <= maxDate) {
        months.push(new Date(curr));
        curr = addDays(curr, 30); // Approx monthly headers
    }

    // Design system rollout 6B: the Gantt is a chart, so it sits on the white
    // chart card in both themes (ChartPanel pins the light roles inside it).
    return (
        <ChartPanel className="overflow-hidden p-0">
            <div>
                <div className="w-full h-[500px] overflow-auto">
                    <div className="relative" style={{ width: `${chartWidth + 300}px` }}>
                        {/* Header */}
                        <div className="flex h-10 bg-pl-sunken border-b border-pl-border sticky top-0 z-10">
                            <div className="w-[300px] flex-shrink-0 p-2 border-r border-pl-border font-semibold text-pl-text text-sm sticky left-0 bg-pl-sunken z-20">
                                Activity
                            </div>
                            <div className="flex-1 relative">
                                {months.map((m, i) => (
                                    <div 
                                        key={i} 
                                        className="absolute top-0 bottom-0 border-l border-pl-border pl-2 text-xs text-pl-muted pt-2"
                                        style={{ left: `${differenceInDays(m, minDate) * pxPerDay}px` }}
                                    >
                                        {format(m, 'MMM yyyy')}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Rows */}
                        <div className="bg-pl-chart-surface">
                            {activities.map(activity => {
                                const offset = differenceInDays(new Date(activity.start), minDate) * pxPerDay;
                                const width = Math.max(differenceInDays(new Date(activity.end), new Date(activity.start)) * pxPerDay, 20); // Min width for milestones
                                const isMilestone = activity.type === 'Milestone';

                                return (
                                    <div key={activity.id} className="flex h-12 border-b border-pl-border hover:bg-pl-sunken/60 transition-colors group">
                                        <div className="w-[300px] flex-shrink-0 p-3 border-r border-pl-border flex items-center justify-between sticky left-0 bg-pl-chart-surface z-10 group-hover:bg-pl-sunken">
                                            <span className="text-sm font-medium text-pl-text truncate mr-2">{activity.name}</span>
                                            <span className="text-[10px] text-pl-muted">{activity.progress}%</span>
                                        </div>
                                        <div className="flex-1 relative">
                                            {/* Grid Lines (Optional, simple version) */}
                                            <div 
                                                className={`absolute top-3 h-6 rounded-sm shadow-sm ${
                                                    isMilestone 
                                                        ? 'w-6 h-6 rotate-45 bg-pl-accent border-2 border-pl-accent-text top-3' 
                                                        : activity.type === 'Drilling' ? 'bg-pl-primary' 
                                                        : activity.type === 'Engineering' ? 'bg-pl-info'
                                                        : 'bg-pl-border-strong'
                                                }`}
                                                style={{ 
                                                    left: `${offset}px`, 
                                                    width: isMilestone ? '24px' : `${width}px` 
                                                }}
                                            >
                                                {/* Progress Bar */}
                                                {!isMilestone && (
                                                    <div 
                                                        className="h-full bg-pl-chart-surface/30" 
                                                        style={{ width: `${activity.progress}%` }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </ChartPanel>
    );
};

export default GanttChart;