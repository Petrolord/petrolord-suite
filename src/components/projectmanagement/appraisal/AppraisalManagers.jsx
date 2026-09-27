import React from 'react';
import { stageProgress } from '../StageTracker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flag, FileText, Layers, Activity, CheckCircle } from 'lucide-react';
import { APPRAISAL_TEMPLATE } from '@/data/appraisalTemplate';

// --- STAGE MANAGER ---
export const AppraisalStageManager = ({ tasks }) => {
  const stages = APPRAISAL_TEMPLATE.stages.map(templateStage => {
      const stageTasks = tasks.filter(t => t.task_category === templateStage.name && t.type !== 'milestone');
      const progress = stageProgress(stageTasks);
      
      return { ...templateStage, progress, totalTasks: stageTasks.length };
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Layers className="w-4 h-4"/> Stage Management</CardTitle></CardHeader>
        <CardContent>
            <Table>
                <TableHeader><TableRow className="border-b-slate-800"><TableHead className="text-white">Stage</TableHead><TableHead className="text-white">Tasks</TableHead><TableHead className="text-white">Progress</TableHead><TableHead className="text-white">Status</TableHead></TableRow></TableHeader>
                <TableBody>
                    {stages.map((stage, idx) => (
                        <TableRow key={idx} className="border-b-slate-800">
                            <TableCell className="font-medium text-slate-200">{stage.name}</TableCell>
                            <TableCell className="text-slate-400">{stage.totalTasks}</TableCell>
                            <TableCell>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500" style={{ width: `${stage.progress}%` }} />
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className={stage.progress === 100 ? "text-green-400 border-green-500/50" : stage.progress > 0 ? "text-amber-400 border-amber-500/50" : "text-slate-500 border-slate-600"}>
                                    {stage.progress === 100 ? 'Complete' : stage.progress > 0 ? 'In Progress' : 'Pending'}
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
export const AppraisalGateManager = ({ tasks }) => {
  const gates = tasks.filter(t => t.type === 'milestone' && APPRAISAL_TEMPLATE.gates.some(g => g.name === t.name));

  return (
    <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Flag className="w-4 h-4"/> Decision Gates</CardTitle></CardHeader>
        <CardContent>
             <Table>
                <TableHeader><TableRow className="border-b-slate-800"><TableHead className="text-white">Gate</TableHead><TableHead className="text-white">Stage</TableHead><TableHead className="text-white">Status</TableHead><TableHead className="text-right text-white">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                    {gates.length > 0 ? gates.map((gate, idx) => (
                        <TableRow key={idx} className="border-b-slate-800">
                            <TableCell className="font-medium text-slate-200">{gate.name}</TableCell>
                            <TableCell className="text-xs text-slate-400">{gate.task_category}</TableCell>
                            <TableCell>
                                <Badge variant="secondary" className={gate.status === 'Done' ? "bg-green-900/30 text-green-400" : "bg-slate-800 text-slate-400"}>
                                    {gate.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-400 hover:text-white">Review Criteria</Button>
                            </TableCell>
                        </TableRow>
                    )) : <TableRow><TableCell colSpan="4" className="text-center text-slate-500 py-4">No gates found.</TableCell></TableRow>}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );
};

// --- DELIVERABLE MANAGER ---
export const AppraisalDeliverableManager = ({ deliverables }) => {
  return (
    <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><FileText className="w-4 h-4"/> Deliverables</CardTitle></CardHeader>
        <CardContent>
             <Table>
                <TableHeader><TableRow className="border-b-slate-800"><TableHead className="text-white">Item</TableHead><TableHead className="text-white">Status</TableHead><TableHead className="text-white">Source</TableHead></TableRow></TableHeader>
                <TableBody>
                    {deliverables.length > 0 ? deliverables.map((del, idx) => (
                        <TableRow key={idx} className="border-b-slate-800">
                            <TableCell className="font-medium text-slate-200">{del.name}</TableCell>
                            <TableCell>
                                <span className={`text-xs px-2 py-0.5 rounded border ${
                                    del.status === 'Approved' ? 'border-green-500/50 text-green-400 bg-green-500/10' : 
                                    del.status === 'Under Review' ? 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10' : 
                                    'border-slate-600 text-slate-400'
                                }`}>{del.status}</span>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">{del.app_source}</TableCell>
                        </TableRow>
                    )) : <TableRow><TableCell colSpan="3" className="text-center text-slate-500 py-4">No deliverables found.</TableCell></TableRow>}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );
};