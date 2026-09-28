import React from 'react';
import { Card } from '@/components/ui/card';
import { ChartPanel } from '@/components/ui/chart-panel';
import { GanttChartSquare, Ship } from 'lucide-react';
import { layoutWellCampaign } from './wellCampaign';

/**
 * EC6-0 / EC6-5. The layout lives in wellCampaign.js: wells go longest first
 * to the rig that comes free first, so the campaign length does not depend on
 * the order of the well table.
 */
const WellStrategy = ({ wells, rigCount = 1, rigRate }) => {
    const { schedule: laidOut, totalDays, rigDays } = layoutWellCampaign(wells, rigCount);
    const schedule = laidOut.map(item => ({
        ...item,
        // Design system rollout 6B: the sequence is a chart on the white
        // chart card; producers and the other wells keep two distinct fills.
        color: (item.type || '').includes('Producer') ? 'bg-pl-primary' : 'bg-pl-info'
    }));

    const span = totalDays || 1; // a zero-day campaign must not divide by zero
    const chartWidthPercent = 100; 

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <div className="p-4 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-pl-muted uppercase">Rig Count</div>
                            <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{rigCount}</div>
                        </div>
                        <Ship className="w-8 h-8 text-pl-muted" />
                    </div>
                </Card>
                <Card>
                    <div className="p-4">
                        <div className="text-xs text-pl-muted uppercase">Campaign Days</div>
                        <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{totalDays}</div>
                        <div className="text-xs text-pl-muted mt-1">{rigDays} rig days over {Math.max(1, rigCount)} rig{rigCount === 1 ? '' : 's'}</div>
                    </div>
                </Card>
                <Card>
                    <div className="p-4">
                        <div className="text-xs text-pl-muted uppercase">Campaign Duration</div>
                        <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{(totalDays / 365).toFixed(1)} Years</div>
                    </div>
                </Card>
            </div>

            <ChartPanel
                title={(
                    <span className="flex items-center">
                        <GanttChartSquare className="w-4 h-4 mr-2 text-pl-muted" />
                        Drilling Sequence ({Math.max(1, rigCount)} rig{rigCount === 1 ? '' : 's'})
                    </span>
                )}
            >
                    <div className="space-y-2 mt-4 relative">
                        {/* Timeline header could go here */}
                        <div className="flex justify-between text-xs text-pl-muted border-b border-pl-border pb-2 mb-2">
                            <span>Start</span>
                            <span>Day {Math.round(totalDays/2)}</span>
                            <span>Day {totalDays}</span>
                        </div>

                        {schedule.map(item => (
                            <div key={item.id} className="flex items-center gap-4 group">
                                <div className="w-24 text-xs text-pl-text text-right truncate" title={`Rig ${item.rig}`}>{item.name}</div>
                                <div className="flex-1 bg-pl-sunken h-6 rounded overflow-hidden relative">
                                    <div 
                                        className={`absolute top-0 bottom-0 ${item.color} rounded transition-all hover:brightness-110`}
                                        style={{
                                            left: `${(item.start / span) * chartWidthPercent}%`,
                                            width: `${((item.end - item.start) / span) * chartWidthPercent}%`
                                        }}
                                    >
                                        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-pl-primary-fg font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                            {item.days}d
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {rigRate ? (
                            <p className="text-[11px] text-pl-muted pt-2">
                                Well costs on the inventory are priced at ${Number(rigRate).toLocaleString()} a day
                                plus services, the rate on this tab.
                            </p>
                        ) : null}

                        {schedule.length === 0 && (
                            <div className="text-center text-pl-muted py-8 text-sm">No wells to schedule.</div>
                        )}
                    </div>
            </ChartPanel>
        </div>
    );
};

export default WellStrategy;