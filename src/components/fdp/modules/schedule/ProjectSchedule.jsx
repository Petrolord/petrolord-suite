import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ProjectSchedule = ({ activities, analysis, onEdit, onDelete, onDuplicate }) => {
    // EC6-0: float and criticality come from the real critical path method.
    const cpmById = new Map((analysis?.activities || []).map((a) => [a.id, a]));
    if (!activities || activities.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                No activities defined. Add an activity or import a schedule.
            </div>
        );
    }

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-800/50">
                            <TableRow className="border-slate-800">
                                <TableHead className="text-slate-300">Activity Name</TableHead>
                                <TableHead className="text-slate-300">Type</TableHead>
                                <TableHead className="text-slate-300">Start Date</TableHead>
                                <TableHead className="text-slate-300">End Date</TableHead>
                                <TableHead className="text-slate-300">Duration</TableHead>
                                <TableHead className="text-slate-300">Float</TableHead>
                                <TableHead className="text-slate-300">Progress</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {activities.map((item) => (
                                <TableRow key={item.id} className="border-slate-800 hover:bg-slate-800/30">
                                    <TableCell className="font-medium text-white">{item.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="border-slate-700 text-slate-400">
                                            {item.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-slate-300 text-sm">{item.start}</TableCell>
                                    <TableCell className="text-slate-300 text-sm">{item.end}</TableCell>
                                    <TableCell className="text-slate-300">{item.duration}d</TableCell>
                                    <TableCell>
                                        {cpmById.has(item.id) ? (
                                            cpmById.get(item.id).isCritical ? (
                                                <Badge className="bg-red-700">Critical</Badge>
                                            ) : (
                                                <span className="text-xs text-slate-400">{cpmById.get(item.id).float}d</span>
                                            )
                                        ) : (
                                            <span className="text-xs text-slate-600">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: `${item.progress}%` }}></div>
                                            </div>
                                            <span className="text-xs text-slate-400">{item.progress}%</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" onClick={() => onEdit(item)}>
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400" onClick={() => onDelete(item.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default ProjectSchedule;