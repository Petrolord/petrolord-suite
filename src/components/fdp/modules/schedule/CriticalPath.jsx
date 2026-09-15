import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, GitBranch } from 'lucide-react';

/**
 * The critical path, from the schedule's own dependencies.
 *
 * EC6-0: this panel is new. The tab promised a critical path and showed
 * none, while the engine behind it marked every activity critical at zero
 * float whatever the durations said.
 */
const CriticalPath = ({ analysis }) => {
    if (analysis.empty) {
        return (
            <div className="text-center py-8 text-slate-500">
                No activities yet. Add activities and link each one to the work that must finish first.
            </div>
        );
    }

    if (!analysis.available) {
        return (
            <Card className="bg-slate-900 border-amber-800/50">
                <CardContent className="p-6">
                    <div className="flex items-center text-amber-400 text-sm font-medium mb-2">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        The schedule cannot be analysed
                    </div>
                    <p className="text-sm text-slate-300">{analysis.error}</p>
                </CardContent>
            </Card>
        );
    }

    const { activities, durationDays, paths, calendarDays, anyDependencies } = analysis;
    const critical = activities.filter((a) => a.isCritical);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4 text-center">
                        <div className="text-xs text-slate-400 uppercase mb-1">Network duration</div>
                        <div className="text-2xl font-bold text-purple-300">{durationDays} d</div>
                    </div>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4 text-center">
                        <div className="text-xs text-slate-400 uppercase mb-1">Calendar span</div>
                        <div className="text-2xl font-bold text-blue-300">
                            {calendarDays === null ? 'Not dated' : `${calendarDays} d`}
                        </div>
                    </div>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4 text-center">
                        <div className="text-xs text-slate-400 uppercase mb-1">On the critical path</div>
                        <div className="text-2xl font-bold text-red-300">{critical.length} of {activities.length}</div>
                    </div>
                </Card>
            </div>

            {!anyDependencies ? (
                <p className="text-xs text-amber-300">
                    No activity depends on another yet, so every activity starts on day 0 and the
                    network is as long as its longest single activity. Set predecessors on the
                    activity form to get a real critical path.
                </p>
            ) : null}

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm flex items-center">
                        <GitBranch className="w-4 h-4 mr-2 text-purple-400" />
                        Critical path{paths.length > 1 ? 's' : ''}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {paths.length === 0 ? (
                        <p className="text-sm text-slate-400">No zero-float chain.</p>
                    ) : (
                        <div className="space-y-2">
                            {paths.map((path, i) => (
                                <div key={`path-${i}`} className="text-sm text-slate-200">
                                    {path
                                        .map((id) => activities.find((a) => a.id === id)?.name || id)
                                        .join('  →  ')}
                                </div>
                            ))}
                            {paths.length > 1 ? (
                                <p className="text-xs text-slate-500">
                                    More than one chain carries zero float. Every one of them sets the
                                    project end date.
                                </p>
                            ) : null}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-800/50">
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-300">Activity</TableHead>
                                    <TableHead className="text-slate-300 text-right">Duration</TableHead>
                                    <TableHead className="text-slate-300 text-right">Early start</TableHead>
                                    <TableHead className="text-slate-300 text-right">Early finish</TableHead>
                                    <TableHead className="text-slate-300 text-right">Late start</TableHead>
                                    <TableHead className="text-slate-300 text-right">Late finish</TableHead>
                                    <TableHead className="text-slate-300 text-right">Float</TableHead>
                                    <TableHead className="text-slate-300">Critical</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activities.map((a) => (
                                    <TableRow key={a.id} className="border-slate-800">
                                        <TableCell className="font-medium text-white">{a.name || a.id}</TableCell>
                                        <TableCell className="text-right text-slate-300">{Number(a.duration) || 0}d</TableCell>
                                        <TableCell className="text-right text-slate-400">{a.es}</TableCell>
                                        <TableCell className="text-right text-slate-400">{a.ef}</TableCell>
                                        <TableCell className="text-right text-slate-400">{a.ls}</TableCell>
                                        <TableCell className="text-right text-slate-400">{a.lf}</TableCell>
                                        <TableCell className="text-right text-slate-200">{a.float}d</TableCell>
                                        <TableCell>
                                            {a.isCritical ? (
                                                <Badge className="bg-red-700">Critical</Badge>
                                            ) : (
                                                <span className="text-xs text-slate-500">{a.float}d of float</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <p className="text-xs text-slate-500">
                Early and late dates are in days from the start of the network, on finish-to-start
                logic. Float is the late start minus the early start: an activity with zero float
                moves the project end date if it slips.
            </p>
        </div>
    );
};

export default CriticalPath;
