import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Activity, Database, PenTool, Hammer as Drill } from 'lucide-react';

// Mock data for wells - normally this would come from a 'wells' table linked to the project
const MOCK_WELLS = [
    { id: 1, name: 'Appraisal-1', type: 'Vertical', status: 'Completed', depth: '3250m', rig: 'Ocean Apex', progress: 100, tests: 'DST-1, DST-2' },
    { id: 2, name: 'Appraisal-2', type: 'Deviated', status: 'Drilling', depth: '1850m', rig: 'Ocean Apex', progress: 65, tests: 'Pending' },
    { id: 3, name: 'Appraisal-3', type: 'Horizontal', status: 'Planned', depth: '0m', rig: 'Ocean Apex', progress: 0, tests: 'Pending' },
];

export const AppraisalWellManager = ({ projectData }) => {
  return (
    <div className="space-y-6">
        {/* Drilling Status */}
        <Card>
            <CardHeader><CardTitle className="text-sm text-pl-text flex items-center gap-2"><Drill className="w-4 h-4"/> Well Status & Drilling Tracking</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="border-b-pl-border">
                            <TableHead>Well Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Current Depth</TableHead>
                            <TableHead>Rig</TableHead>
                            <TableHead>Progress</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {MOCK_WELLS.map(well => (
                            <TableRow key={well.id} className="border-b-pl-border">
                                <TableCell className="font-medium text-pl-text">{well.name}</TableCell>
                                <TableCell className="text-pl-muted">{well.type}</TableCell>
                                <TableCell>
                                    <Badge variant={well.status === 'Completed' ? 'success' : well.status === 'Drilling' ? 'info' : 'neutral'} className={well.status === 'Drilling' ? 'animate-pulse' : undefined}>{well.status}</Badge>
                                </TableCell>
                                <TableCell className="font-pl-mono tabular-nums text-pl-text">{well.depth}</TableCell>
                                <TableCell className="text-pl-muted">{well.rig}</TableCell>
                                <TableCell>
                                    <div className="w-24 h-2 bg-pl-sunken rounded-full overflow-hidden">
                                        <div className="h-full bg-pl-primary" style={{ width: `${well.progress}%` }} />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Well Testing & Results */}
        <Card>
            <CardHeader><CardTitle className="text-sm text-pl-text flex items-center gap-2"><Activity className="w-4 h-4"/> Well Testing & Results</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="border-b-pl-border">
                            <TableHead>Well</TableHead>
                            <TableHead>Tests Planned</TableHead>
                            <TableHead>Results Status</TableHead>
                            <TableHead>Key Findings</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {MOCK_WELLS.map(well => (
                            <TableRow key={well.id} className="border-b-pl-border">
                                <TableCell className="font-medium text-pl-text">{well.name}</TableCell>
                                <TableCell className="text-pl-muted">{well.tests}</TableCell>
                                <TableCell>
                                    {well.status === 'Completed' ? <span className="text-pl-success-text text-xs">Analyzed</span> : <span className="text-pl-muted text-xs">Pending</span>}
                                </TableCell>
                                <TableCell className="text-xs text-pl-muted italic">
                                    {well.status === 'Completed' ? 'Permeability higher than exp. No barrier detected.' : '-'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Reservoir Characterization Summary */}
        <Card>
            <CardHeader><CardTitle className="text-sm text-pl-text flex items-center gap-2"><Database className="w-4 h-4"/> Reservoir Characterization Status</CardTitle></CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 bg-pl-sunken/60 rounded border border-pl-border">
                        <div className="text-xs text-pl-muted mb-1">Static Model</div>
                        <div className="text-lg font-semibold text-pl-text">v2.1 (Updated)</div>
                        <div className="text-xs text-pl-success-text mt-1">Incorporated Appr-1 logs</div>
                    </div>
                    <div className="p-3 bg-pl-sunken/60 rounded border border-pl-border">
                        <div className="text-xs text-pl-muted mb-1">Fluid Analysis</div>
                        <div className="text-lg font-semibold text-pl-text">Ongoing</div>
                        <div className="text-xs text-pl-warning-text mt-1">PVT samples at lab</div>
                    </div>
                    <div className="p-3 bg-pl-sunken/60 rounded border border-pl-border">
                        <div className="text-xs text-pl-muted mb-1">Dynamic Model</div>
                        <div className="text-lg font-semibold text-pl-text">Pending</div>
                        <div className="text-xs text-pl-muted mt-1">Awaiting DST-2 results</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
  );
};