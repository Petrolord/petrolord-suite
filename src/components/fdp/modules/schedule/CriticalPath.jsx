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
            <div className="text-center py-8 text-pl-muted">
                No activities yet. Add activities and link each one to the work that must finish first.
            </div>
        );
    }

    if (!analysis.available) {
        return (
            <Card className="border-pl-warning/50">
                <CardContent className="p-6">
                    <div className="flex items-center text-pl-warning-text text-sm font-medium mb-2">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        The schedule cannot be analysed
                    </div>
                    <p className="text-sm text-pl-text">{analysis.error}</p>
                </CardContent>
            </Card>
        );
    }

    const { activities, durationDays, paths, calendarDays, anyDependencies } = analysis;
    const critical = activities.filter((a) => a.isCritical);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <div className="p-4 text-center">
                        <div className="text-xs text-pl-muted uppercase mb-1">Network duration</div>
                        <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{durationDays} d</div>
                    </div>
                </Card>
                <Card>
                    <div className="p-4 text-center">
                        <div className="text-xs text-pl-muted uppercase mb-1">Calendar span</div>
                        <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">
                            {calendarDays === null ? 'Not dated' : `${calendarDays} d`}
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="p-4 text-center">
                        <div className="text-xs text-pl-muted uppercase mb-1">On the critical path</div>
                        <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{critical.length} of {activities.length}</div>
                    </div>
                </Card>
            </div>

            {!anyDependencies ? (
                <p className="text-xs text-pl-warning-text">
                    No activity depends on another yet, so every activity starts on day 0 and the
                    network is as long as its longest single activity. Set predecessors on the
                    activity form to get a real critical path.
                </p>
            ) : null}

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-pl-text text-sm flex items-center">
                        <GitBranch className="w-4 h-4 mr-2 text-pl-muted" />
                        Critical path{paths.length > 1 ? 's' : ''}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {paths.length === 0 ? (
                        <p className="text-sm text-pl-muted">No zero-float chain.</p>
                    ) : (
                        <div className="space-y-2">
                            {paths.map((path, i) => (
                                <div key={`path-${i}`} className="text-sm text-pl-text">
                                    {path
                                        .map((id) => activities.find((a) => a.id === id)?.name || id)
                                        .join('  →  ')}
                                </div>
                            ))}
                            {paths.length > 1 ? (
                                <p className="text-xs text-pl-muted">
                                    More than one chain carries zero float. Every one of them sets the
                                    project end date.
                                </p>
                            ) : null}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-pl-sunken">
                                <TableRow className="border-pl-border">
                                    <TableHead>Activity</TableHead>
                                    <TableHead className="text-right">Duration</TableHead>
                                    <TableHead className="text-right">Early start</TableHead>
                                    <TableHead className="text-right">Early finish</TableHead>
                                    <TableHead className="text-right">Late start</TableHead>
                                    <TableHead className="text-right">Late finish</TableHead>
                                    <TableHead className="text-right">Float</TableHead>
                                    <TableHead>Critical</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activities.map((a) => (
                                    <TableRow key={a.id} className="border-pl-border">
                                        <TableCell className="font-medium text-pl-text">{a.name || a.id}</TableCell>
                                        <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{Number(a.duration) || 0}d</TableCell>
                                        <TableCell className="text-right font-pl-mono tabular-nums text-pl-muted">{a.es}</TableCell>
                                        <TableCell className="text-right font-pl-mono tabular-nums text-pl-muted">{a.ef}</TableCell>
                                        <TableCell className="text-right font-pl-mono tabular-nums text-pl-muted">{a.ls}</TableCell>
                                        <TableCell className="text-right font-pl-mono tabular-nums text-pl-muted">{a.lf}</TableCell>
                                        <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{a.float}d</TableCell>
                                        <TableCell>
                                            {a.isCritical ? (
                                                <Badge variant="danger">Critical</Badge>
                                            ) : (
                                                <span className="text-xs text-pl-muted">{a.float}d of float</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <p className="text-xs text-pl-muted">
                Early and late dates are in days from the start of the network, on finish-to-start
                logic. Float is the late start minus the early start: an activity with zero float
                moves the project end date if it slips.
            </p>
        </div>
    );
};

export default CriticalPath;
