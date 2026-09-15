import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GanttChartSquare, Ship } from 'lucide-react';

/**
 * EC6-0. The rig count was always 1 here whatever the plan said, so a
 * campaign with three rigs was laid out end to end and "Campaign Duration"
 * was three times what it should be. Wells are now handed to the rig that
 * comes free first, and a well with no drilling days is counted as zero
 * rather than silently as 30.
 */
const WellStrategy = ({ wells, rigCount = 1, rigRate }) => {
    const rigs = new Array(Math.max(1, rigCount)).fill(0);
    const schedule = [];

    wells.forEach(well => {
        const duration = Number(well.days) || 0;
        let next = 0;
        for (let r = 1; r < rigs.length; r += 1) {
            if (rigs[r] < rigs[next]) next = r;
        }
        const start = rigs[next];
        rigs[next] = start + duration;
        schedule.push({
            ...well,
            start,
            end: start + duration,
            rig: next + 1,
            color: (well.type || '').includes('Producer') ? 'bg-green-600' : 'bg-blue-600'
        });
    });

    const totalDays = Math.max(...rigs, 0);
    const rigDays = wells.reduce((sum, w) => sum + (Number(w.days) || 0), 0);
    const span = totalDays || 1; // a zero-day campaign must not divide by zero
    const chartWidthPercent = 100; 

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-slate-400 uppercase">Rig Count</div>
                            <div className="text-2xl font-bold text-white">{rigCount}</div>
                        </div>
                        <Ship className="w-8 h-8 text-slate-600" />
                    </div>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4">
                        <div className="text-xs text-slate-400 uppercase">Campaign Days</div>
                        <div className="text-2xl font-bold text-white">{totalDays}</div>
                        <div className="text-xs text-slate-500 mt-1">{rigDays} rig days over {Math.max(1, rigCount)} rig{rigCount === 1 ? '' : 's'}</div>
                    </div>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4">
                        <div className="text-xs text-slate-400 uppercase">Campaign Duration</div>
                        <div className="text-2xl font-bold text-white">{(totalDays / 365).toFixed(1)} Years</div>
                    </div>
                </Card>
            </div>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-medium text-white flex items-center">
                        <GanttChartSquare className="w-5 h-5 mr-2 text-indigo-400" />
                        Drilling Sequence ({Math.max(1, rigCount)} rig{rigCount === 1 ? '' : 's'})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 mt-4 relative">
                        {/* Timeline header could go here */}
                        <div className="flex justify-between text-xs text-slate-500 border-b border-slate-800 pb-2 mb-2">
                            <span>Start</span>
                            <span>Day {Math.round(totalDays/2)}</span>
                            <span>Day {totalDays}</span>
                        </div>

                        {schedule.map(item => (
                            <div key={item.id} className="flex items-center gap-4 group">
                                <div className="w-24 text-xs text-slate-300 text-right truncate" title={`Rig ${item.rig}`}>{item.name}</div>
                                <div className="flex-1 bg-slate-800 h-6 rounded overflow-hidden relative">
                                    <div 
                                        className={`absolute top-0 bottom-0 ${item.color} rounded transition-all hover:brightness-110`}
                                        style={{
                                            left: `${(item.start / span) * chartWidthPercent}%`,
                                            width: `${((item.end - item.start) / span) * chartWidthPercent}%`
                                        }}
                                    >
                                        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/90 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                            {item.days}d
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {rigRate ? (
                            <p className="text-[11px] text-slate-500 pt-2">
                                Well costs on the inventory are priced at ${Number(rigRate).toLocaleString()} a day
                                plus services, the rate on this tab.
                            </p>
                        ) : null}

                        {schedule.length === 0 && (
                            <div className="text-center text-slate-500 py-8 text-sm">No wells to schedule.</div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default WellStrategy;