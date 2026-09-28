import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { PlusCircle, AlertCircle, ShieldAlert, RefreshCw, Filter } from 'lucide-react';
import RiskMatrix from './RiskMatrix';
import RiskForm from './RiskForm';
import IssueForm from './IssueForm';
import { format } from 'date-fns';

// Risk score bands (probability x impact): the band is a status, so its
// word rides along as a title and the number stays on the chip.
export const scoreBand = (score) => {
  if (score >= 15) return { label: 'High', variant: 'danger', solid: 'bg-pl-danger text-pl-danger-fg' };
  if (score >= 8) return { label: 'Medium', variant: 'warning', solid: 'bg-pl-warning text-pl-warning-fg' };
  return { label: 'Low', variant: 'success', solid: 'bg-pl-success text-pl-success-fg' };
};

const RisksDashboard = ({ project, risks = [], issues = [], onDataChange }) => {
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [editingIssue, setEditingIssue] = useState(null);
  const [activeTab, setActiveTab] = useState('register');

  const handleEditRisk = (risk) => {
    setEditingRisk(risk);
    setRiskDialogOpen(true);
  };

  const handleEditIssue = (issue) => {
    setEditingIssue(issue);
    setIssueDialogOpen(true);
  };

  const handleNewRisk = () => {
    setEditingRisk(null);
    setRiskDialogOpen(true);
  };

  const handleNewIssue = () => {
    setEditingIssue(null);
    setIssueDialogOpen(true);
  };

  // Top 10 Risks
  const topRisks = [...risks].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 10);

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-bold text-pl-text">Risks & Issues Management</h2>
        <div className="flex gap-2">
            <Button onClick={handleNewIssue} variant="outline">
                <AlertCircle className="w-4 h-4 mr-2" /> Report Issue
            </Button>
            <Button onClick={handleNewRisk}>
                <PlusCircle className="w-4 h-4 mr-2" /> Add Risk
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2">
            <RiskMatrix risks={risks} onRiskClick={handleEditRisk} />
         </div>
         <div className="bg-pl-surface border border-pl-border rounded-lg p-4 flex flex-col">
            <h3 className="text-sm font-bold text-pl-text mb-3 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-pl-muted" />
                Top 10 Critical Risks
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                {topRisks.map(r => (
                    <div 
                        key={r.id} 
                        className="p-2 bg-pl-sunken rounded border border-pl-border hover:border-pl-border-strong cursor-pointer transition-colors"
                        onClick={() => handleEditRisk(r)}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-bold text-pl-text line-clamp-1">{r.title || 'Untitled Risk'}</span>
                            <Badge variant={scoreBand(r.risk_score).variant} title={`${scoreBand(r.risk_score).label} score`}>
                                {r.risk_score}
                            </Badge>
                        </div>
                        <div className="flex justify-between text-[10px] text-pl-muted">
                            <span>{r.category}</span>
                            <span>{r.owner}</span>
                        </div>
                    </div>
                ))}
                {topRisks.length === 0 && <div className="text-pl-muted text-xs text-center mt-10">No risks recorded.</div>}
            </div>
         </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="self-start">
            <TabsTrigger value="register">Risk Register</TabsTrigger>
            <TabsTrigger value="issues">Issue Log</TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-4 bg-pl-surface border border-pl-border rounded-lg overflow-hidden">
            <TabsContent value="register" className="h-full m-0">
                <div className="h-full overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[60px]">Score</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Prob</TableHead>
                                <TableHead>Imp</TableHead>
                                <TableHead>Owner</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Due Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {risks.map(risk => (
                                <TableRow key={risk.id} className="border-b-pl-border hover:bg-pl-sunken/60 cursor-pointer" onClick={() => handleEditRisk(risk)}>
                                    <TableCell>
                                        <span title={`${scoreBand(risk.risk_score).label} score`} className={`inline-block w-6 h-6 text-center leading-6 rounded text-xs font-bold font-pl-mono ${scoreBand(risk.risk_score).solid}`}>
                                            {risk.risk_score}
                                        </span>
                                    </TableCell>
                                    <TableCell className="font-medium text-pl-text">{risk.title}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px] border-pl-border text-pl-muted">{risk.category}</Badge></TableCell>
                                    <TableCell className="text-pl-muted">{risk.probability}</TableCell>
                                    <TableCell className="text-pl-muted">{risk.impact}</TableCell>
                                    <TableCell className="text-pl-muted text-xs">{risk.owner}</TableCell>
                                    <TableCell>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            risk.status === 'Open' ? 'bg-pl-danger-bg text-pl-danger-text' :
                                            risk.status === 'Mitigating' ? 'bg-pl-info-bg text-pl-info-text' :
                                            'bg-pl-success-bg text-pl-success-text'
                                        }`}>
                                            {risk.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-pl-muted text-xs">{risk.due_date ? format(new Date(risk.due_date), 'MMM dd') : '-'}</TableCell>
                                </TableRow>
                            ))}
                            {risks.length === 0 && <TableRow><TableCell colSpan="8" className="text-center py-8 text-pl-muted">No risks found.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>

            <TabsContent value="issues" className="h-full m-0">
                <div className="h-full overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 z-10">
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Issue Title</TableHead>
                                <TableHead>Owner</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Resolution</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {issues.map(issue => (
                                <TableRow key={issue.id} className="border-b-pl-border hover:bg-pl-sunken/60 cursor-pointer" onClick={() => handleEditIssue(issue)}>
                                    <TableCell className="text-pl-muted text-xs font-pl-mono tabular-nums">
                                        {issue.occurred_date ? format(new Date(issue.occurred_date), 'MMM dd') : '-'}
                                    </TableCell>
                                    <TableCell className="font-medium text-pl-text">{issue.title}</TableCell>
                                    <TableCell className="text-pl-muted text-xs">{issue.owner}</TableCell>
                                    <TableCell>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            issue.status === 'Open' ? 'bg-pl-danger-bg text-pl-danger-text' :
                                            issue.status === 'In Progress' ? 'bg-pl-warning-bg text-pl-warning-text' :
                                            'bg-pl-success-bg text-pl-success-text'
                                        }`}>
                                            {issue.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-pl-muted text-xs truncate max-w-[200px]">{issue.resolution || '-'}</TableCell>
                                </TableRow>
                            ))}
                             {issues.length === 0 && <TableRow><TableCell colSpan="5" className="text-center py-8 text-pl-muted">No issues recorded.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>

            {/* EC6-0: a "PPFG Integration" tab used to offer three invented
                findings (an overpressure ramp at 3200m, a narrow drilling
                window at 4500m, shale instability at 2800m) and write the ones
                you ticked into the risk register tagged as sourced from the
                PPFG app, having contacted nothing. The E4 wave removed the
                same fabrication from the integrations panels and missed this
                copy. There is no live link to Pore Pressure; log the risks you
                have decided on in the register above. */}
        </div>
      </Tabs>

      <RiskForm 
        open={riskDialogOpen} 
        onOpenChange={setRiskDialogOpen} 
        project={project} 
        existingRisk={editingRisk} 
        onSaved={onDataChange} 
      />

      <IssueForm 
        open={issueDialogOpen} 
        onOpenChange={setIssueDialogOpen} 
        project={project} 
        existingIssue={editingIssue} 
        onSaved={onDataChange}
        risks={risks}
      />
    </div>
  );
};

export default RisksDashboard;