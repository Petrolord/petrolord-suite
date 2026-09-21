import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, Flag, FileText, AlertTriangle, Users, Download, BarChart3, Hammer as Drill } from 'lucide-react';
import StageTracker from '../StageTracker';
import GanttChart from '../GanttChart';
import { AppraisalStageManager, AppraisalGateManager, AppraisalDeliverableManager } from './AppraisalManagers';
import { AppraisalKPIDashboard, AppraisalRiskManager, AppraisalResourceManager } from './AppraisalAnalytics';
import { AppraisalWellManager } from './AppraisalWellManager';

const AppraisalProjectDashboard = ({ projectData, onDataChange }) => {
  const [activeTab, setActiveTab] = useState('overview');

  const { tasks, rawTasks, risks, resources, deliverables = [], stage , kpis } = projectData;
  // EC6-0: the stage and gate managers filter on task_category, which the
  // Gantt reshape used to drop, so every stage read 0 percent and Pending
  // for ever. They read the rows as they came from the database.
  const stageTasks = rawTasks || tasks;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Top Header / Stage Tracker */}
      <div>
        <StageTracker currentStage={stage || 'Appraisal Planning'} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <Card className="bg-slate-900 border-slate-800 p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Project Name</p>
                    <p className="text-lg font-mono text-white truncate max-w-[150px]" title={projectData.name}>{projectData.name}</p>
                </div>
                <Layers className="w-6 h-6 text-amber-500 opacity-50" />
            </Card>
            <Card className="bg-slate-900 border-slate-800 p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Field / Asset</p>
                    <p className="text-lg font-mono text-white truncate max-w-[150px]">{projectData.asset || 'Unassigned'}</p>
                </div>
                <Flag className="w-6 h-6 text-purple-500 opacity-50" />
            </Card>
            <Card className="bg-slate-900 border-slate-800 p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Budget</p>
                    <p className="text-lg font-mono text-white">${(projectData.baseline_budget / 1000000).toFixed(1)}M</p>
                </div>
                {/* EC6-0: this read "On Track" in green on every project of this
                    type, whatever its costs said. It is the cost index the
                    earned value actually gives, and "no cost data" when there
                    is none to divide by. */}
                <div className="text-right">
                    <p className="text-[10px] text-slate-500">CPI</p>
                    <p className={`text-xs ${typeof kpis?.cpi !== 'number' ? 'text-slate-400' : (kpis.cpi >= 1 ? 'text-green-400' : 'text-red-400')}`}>
                        {typeof kpis?.cpi === 'number' ? kpis.cpi.toFixed(2) : 'No cost data'}
                    </p>
                </div>
            </Card>
            <Card className="bg-slate-900 border-slate-800 p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Risk Exposure</p>
                    <p className="text-lg font-mono text-red-400">{risks.filter(r => r.risk_score > 10).length} High</p>
                </div>
                <AlertTriangle className="w-6 h-6 text-red-500 opacity-50" />
            </Card>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <TabsList className="bg-slate-900">
                <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-2"/> Overview</TabsTrigger>
                <TabsTrigger value="wells"><Drill className="w-4 h-4 mr-2"/> Wells</TabsTrigger>
                <TabsTrigger value="schedule"><Layers className="w-4 h-4 mr-2"/> Schedule</TabsTrigger>
                <TabsTrigger value="gates"><Flag className="w-4 h-4 mr-2"/> Gates & Stages</TabsTrigger>
                <TabsTrigger value="deliverables"><FileText className="w-4 h-4 mr-2"/> Deliverables</TabsTrigger>
                <TabsTrigger value="risks"><AlertTriangle className="w-4 h-4 mr-2"/> Risks</TabsTrigger>
                <TabsTrigger value="team"><Users className="w-4 h-4 mr-2"/> Team</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" className="text-slate-400 border-slate-700 hover:text-white">
                <Download className="w-4 h-4 mr-2" /> Export Report
            </Button>
        </div>

        <div className="flex-1 mt-4 overflow-y-auto">
            <TabsContent value="overview" className="h-full m-0 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <AppraisalStageManager tasks={stageTasks} />
                    </div>
                    <div>
                        <AppraisalKPIDashboard />
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <AppraisalRiskManager risks={risks} />
                    <AppraisalResourceManager resources={resources} />
                </div>
            </TabsContent>

            <TabsContent value="wells" className="h-full m-0">
                <AppraisalWellManager projectData={projectData} />
            </TabsContent>

            <TabsContent value="schedule" className="h-full m-0">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 h-[600px]">
                    <GanttChart tasks={tasks} projectName={projectData.name} onDataChange={onDataChange} />
                </div>
            </TabsContent>

            <TabsContent value="gates" className="h-full m-0 space-y-6">
                <AppraisalGateManager tasks={stageTasks} />
                <AppraisalStageManager tasks={stageTasks} />
            </TabsContent>

            <TabsContent value="deliverables" className="h-full m-0">
                <AppraisalDeliverableManager deliverables={deliverables} />
            </TabsContent>

            <TabsContent value="risks" className="h-full m-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <AppraisalRiskManager risks={risks} />
                    <Card className="bg-slate-900 border-slate-800">
                        <CardContent className="p-4">
                            <h3 className="font-bold text-slate-300 mb-4">Full Risk Register</h3>
                            <div className="space-y-2">
                                {risks.map((r, i) => (
                                    <div key={i} className="flex justify-between p-2 bg-slate-800 rounded border border-slate-700 text-xs">
                                        <span className="text-slate-200">{r.title}</span>
                                        <span className="text-red-400 font-bold">{r.risk_score}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="team" className="h-full m-0">
                <AppraisalResourceManager resources={resources} />
            </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default AppraisalProjectDashboard;