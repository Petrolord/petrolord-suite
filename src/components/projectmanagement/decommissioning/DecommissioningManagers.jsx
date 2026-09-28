import React from 'react';
import { stageProgress } from '../StageTracker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flag, FileText, Layers } from 'lucide-react';
import { DECOMMISSIONING_TEMPLATE } from '@/data/decommissioningTemplate';

// --- STAGE MANAGER ---
export const DecommissioningStageManager = ({ tasks }) => {
  const stages = DECOMMISSIONING_TEMPLATE.stages.map(templateStage => {
      const stageTasks = tasks.filter(t => t.task_category === templateStage.name && t.type !== 'milestone');
      const progress = stageProgress(stageTasks);
      
      return { ...templateStage, progress, totalTasks: stageTasks.length };
  });

  return (
    <Card>
        <CardHeader><CardTitle className="text-sm text-pl-text flex items-center gap-2"><Layers className="w-4 h-4"/> Decommissioning Stages</CardTitle></CardHeader>
        <CardContent>
            <Table>
                <TableHeader><TableRow className="border-b-pl-border"><TableHead>Stage</TableHead><TableHead>Tasks</TableHead><TableHead>Progress</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                    {stages.map((stage, idx) => (
                        <TableRow key={idx} className="border-b-pl-border">
                            <TableCell className="font-medium text-pl-text">{stage.name}</TableCell>
                            <TableCell className="text-pl-muted">{stage.totalTasks}</TableCell>
                            <TableCell>
                                <div className="w-full bg-pl-sunken h-2 rounded-full overflow-hidden">
                                    <div className="h-full bg-pl-primary" style={{ width: `${stage.progress}%` }} />
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={stage.progress === 100 ? 'success' : stage.progress > 0 ? 'info' : 'neutral'}>
                                    {stage.progress === 100 ? 'Complete' : stage.progress > 0 ? 'Active' : 'Pending'}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );
};

// --- GATE MANAGER ---
export const DecommissioningGateManager = ({ tasks }) => {
  const gates = tasks.filter(t => t.type === 'milestone' && DECOMMISSIONING_TEMPLATE.gates.some(g => g.name === t.name));

  return (
    <Card>
        <CardHeader><CardTitle className="text-sm text-pl-text flex items-center gap-2"><Flag className="w-4 h-4"/> Approval Gates</CardTitle></CardHeader>
        <CardContent>
             <Table>
                <TableHeader><TableRow className="border-b-pl-border"><TableHead>Gate</TableHead><TableHead>Stage</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader>
                <TableBody>
                    {gates.length > 0 ? gates.map((gate, idx) => (
                        <TableRow key={idx} className="border-b-pl-border">
                            <TableCell className="font-medium text-pl-text">{gate.name}</TableCell>
                            <TableCell className="text-xs text-pl-muted">{gate.task_category}</TableCell>
                            <TableCell>
                                <Badge variant={gate.status === 'Done' ? 'success' : 'neutral'}>
                                    {gate.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-pl-primary-text hover:text-pl-primary-text-hover">Criteria</Button>
                            </TableCell>
                        </TableRow>
                    )) : <TableRow><TableCell colSpan="4" className="text-center text-pl-muted py-4">No gates found.</TableCell></TableRow>}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );
};

// --- DELIVERABLE MANAGER ---
export const DecommissioningDeliverableManager = ({ deliverables }) => {
  return (
    <Card>
        <CardHeader><CardTitle className="text-sm text-pl-text flex items-center gap-2"><FileText className="w-4 h-4"/> Key Documentation</CardTitle></CardHeader>
        <CardContent>
             <Table>
                <TableHeader><TableRow className="border-b-pl-border"><TableHead>Item</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
                <TableBody>
                    {deliverables.length > 0 ? deliverables.map((del, idx) => (
                        <TableRow key={idx} className="border-b-pl-border">
                            <TableCell className="font-medium text-pl-text">{del.name}</TableCell>
                            <TableCell>
                                <span className={`text-xs px-2 py-0.5 rounded border ${
                                    del.status === 'Approved' ? 'border-pl-success/40 text-pl-success-text bg-pl-success-bg' : 
                                    del.status === 'Under Review' ? 'border-pl-warning/40 text-pl-warning-text bg-pl-warning-bg' : 
                                    'border-pl-border text-pl-muted'
                                }`}>{del.status}</span>
                            </TableCell>
                            <TableCell className="text-xs text-pl-muted">{del.app_source}</TableCell>
                        </TableRow>
                    )) : <TableRow><TableCell colSpan="3" className="text-center text-pl-muted py-4">No deliverables found.</TableCell></TableRow>}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );
};