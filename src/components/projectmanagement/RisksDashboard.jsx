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
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Risks & Issues Management</h2>
        <div className="flex gap-2">
            <Button onClick={handleNewIssue} variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-900/20">
                <AlertCircle className="w-4 h-4 mr-2" /> Report Issue
            </Button>
            <Button onClick={handleNewRisk} className="bg-blue-600 hover:bg-blue-700">
                <PlusCircle className="w-4 h-4 mr-2" /> Add Risk
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2">
            <RiskMatrix risks={risks} onRiskClick={handleEditRisk} />
         </div>
         <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col">
            <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                Top 10 Critical Risks
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                {topRisks.map(r => (
                    <div 
                        key={r.id} 
                        className="p-2 bg-slate-800 rounded border border-slate-700 hover:border-blue-500 cursor-pointer transition-colors"
                        onClick={() => handleEditRisk(r)}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-bold text-white line-clamp-1">{r.title || 'Untitled Risk'}</span>
                            <Badge className={r.risk_score >= 15 ? 'bg-red-500' : r.risk_score >= 8 ? 'bg-orange-500' : 'bg-green-500'}>
                                {r.risk_score}
                            </Badge>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                            <span>{r.category}</span>
                            <span>{r.owner}</span>
                        </div>
                    </div>
                ))}
                {topRisks.length === 0 && <div className="text-slate-500 text-xs text-center mt-10">No risks recorded.</div>}
            </div>
         </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="bg-slate-800 self-start">
            <TabsTrigger value="register">Risk Register</TabsTrigger>
            <TabsTrigger value="issues">Issue Log</TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-4 bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
            <TabsContent value="register" className="h-full m-0">
                <div className="h-full overflow-y-auto">
                    <Table>
                        <TableHeader className="bg-slate-900 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="text-slate-400 w-[60px]">Score</TableHead>
                                <TableHead className="text-slate-400">Title</TableHead>
                                <TableHead className="text-slate-400">Category</TableHead>
                                <TableHead className="text-slate-400">Prob</TableHead>
                                <TableHead className="text-slate-400">Imp</TableHead>
                                <TableHead className="text-slate-400">Owner</TableHead>
                                <TableHead className="text-slate-400">Status</TableHead>
                                <TableHead className="text-slate-400">Due Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {risks.map(risk => (
                                <TableRow key={risk.id} className="border-b-slate-800 hover:bg-slate-800/50 cursor-pointer" onClick={() => handleEditRisk(risk)}>
                                    <TableCell>
                                        <span className={`inline-block w-6 h-6 text-center leading-6 rounded text-xs font-bold text-white ${
                                            risk.risk_score >= 15 ? 'bg-red-500' : risk.risk_score >= 8 ? 'bg-orange-500' : 'bg-green-500'
                                        }`}>
                                            {risk.risk_score}
                                        </span>
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-200">{risk.title}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">{risk.category}</Badge></TableCell>
                                    <TableCell className="text-slate-400">{risk.probability}</TableCell>
                                    <TableCell className="text-slate-400">{risk.impact}</TableCell>
                                    <TableCell className="text-slate-400 text-xs">{risk.owner}</TableCell>
                                    <TableCell>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            risk.status === 'Open' ? 'bg-red-900/30 text-red-400' : 
                                            risk.status === 'Mitigating' ? 'bg-blue-900/30 text-blue-400' : 
                                            'bg-green-900/30 text-green-400'
                                        }`}>
                                            {risk.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-slate-400 text-xs">{risk.due_date ? format(new Date(risk.due_date), 'MMM dd') : '-'}</TableCell>
                                </TableRow>
                            ))}
                            {risks.length === 0 && <TableRow><TableCell colSpan="8" className="text-center py-8 text-slate-500">No risks found.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>

            <TabsContent value="issues" className="h-full m-0">
                <div className="h-full overflow-y-auto">
                    <Table>
                        <TableHeader className="bg-slate-900 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="text-slate-400">Date</TableHead>
                                <TableHead className="text-slate-400">Issue Title</TableHead>
                                <TableHead className="text-slate-400">Owner</TableHead>
                                <TableHead className="text-slate-400">Status</TableHead>
                                <TableHead className="text-slate-400">Resolution</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {issues.map(issue => (
                                <TableRow key={issue.id} className="border-b-slate-800 hover:bg-slate-800/50 cursor-pointer" onClick={() => handleEditIssue(issue)}>
                                    <TableCell className="text-slate-400 text-xs font-mono">
                                        {issue.occurred_date ? format(new Date(issue.occurred_date), 'MMM dd') : '-'}
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-200">{issue.title}</TableCell>
                                    <TableCell className="text-slate-400 text-xs">{issue.owner}</TableCell>
                                    <TableCell>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            issue.status === 'Open' ? 'bg-red-900/30 text-red-400' : 
                                            issue.status === 'In Progress' ? 'bg-orange-900/30 text-orange-400' : 
                                            'bg-green-900/30 text-green-400'
                                        }`}>
                                            {issue.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-slate-500 text-xs truncate max-w-[200px]">{issue.resolution || '-'}</TableCell>
                                </TableRow>
                            ))}
                             {issues.length === 0 && <TableRow><TableCell colSpan="5" className="text-center py-8 text-slate-500">No issues recorded.</TableCell></TableRow>}
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