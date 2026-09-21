import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CircleDashed } from 'lucide-react';

/**
 * A phase or KPI panel the studio does not measure.
 *
 * EC6-0. The project-type dashboards were full of trackers and KPI charts
 * whose every figure was written into the source: "Wells Plugged 6/10",
 * "Rig Utilization 95%", "Topsides Weight 15,000t", "Model Match 82", each
 * one printed for every project of that type, on a progress bar that never
 * moved. They read as measurements of the project in front of the user and
 * were nothing of the kind.
 *
 * Rather than delete the panels and lose the checklist they imply, each one
 * now says what it would track and that the studio tracks none of it yet.
 * The tasks on the project are where the real progress lives.
 */
const NotTracked = ({ title, icon: Icon = CircleDashed, tracks = [] }) => (
    <Card className="bg-slate-900 border-slate-800 h-full">
        <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Icon className="w-4 h-4 text-slate-500" />
                {title}
            </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
            <p className="text-xs text-slate-400">
                Not tracked in this studio. Use the task list, with a category per phase, for the
                progress that is really being measured.
            </p>
            {tracks.length > 0 ? (
                <div className="space-y-1">
                    {tracks.map((t) => (
                        <div key={t} className="text-xs text-slate-500 flex items-center gap-2">
                            <CircleDashed className="w-3 h-3 shrink-0" />
                            <span>{t}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </CardContent>
    </Card>
);

export default NotTracked;
