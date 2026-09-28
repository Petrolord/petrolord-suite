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
            <div className="text-center py-8 text-pl-muted">
                No activities defined. Add an activity or import a schedule.
            </div>
        );
    }

    return (
        <Card>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-pl-sunken">
                            <TableRow className="border-pl-border">
                                <TableHead>Activity Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Start Date</TableHead>
                                <TableHead>End Date</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Float</TableHead>
                                <TableHead>Progress</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {activities.map((item) => (
                                <TableRow key={item.id} className="border-pl-border hover:bg-pl-sunken/60">
                                    <TableCell className="font-medium text-pl-text">{item.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="neutral">
                                            {item.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-pl-text text-sm">{item.start}</TableCell>
                                    <TableCell className="text-pl-text text-sm">{item.end}</TableCell>
                                    <TableCell className="font-pl-mono tabular-nums text-pl-text">{item.duration}d</TableCell>
                                    <TableCell>
                                        {cpmById.has(item.id) ? (
                                            cpmById.get(item.id).isCritical ? (
                                                <Badge variant="danger">Critical</Badge>
                                            ) : (
                                                <span className="text-xs text-pl-muted">{cpmById.get(item.id).float}d</span>
                                            )
                                        ) : (
                                            <span className="text-xs text-pl-muted">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-pl-border rounded-full overflow-hidden">
                                                <div className="h-full bg-pl-primary" style={{ width: `${item.progress}%` }}></div>
                                            </div>
                                            <span className="text-xs text-pl-muted">{item.progress}%</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-text" onClick={() => onEdit(item)}>
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-danger-text" onClick={() => onDelete(item.id)}>
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