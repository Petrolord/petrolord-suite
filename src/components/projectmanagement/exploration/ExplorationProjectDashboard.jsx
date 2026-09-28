import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, Flag, FileText, AlertTriangle, Users, Download, BarChart3 } from 'lucide-react';
import StageTracker from '../StageTracker';
import { scoreBand } from '../RisksDashboard';
import GanttChart from '../GanttChart';
import { ExplorationStageManager, ExplorationGateManager, ExplorationDeliverableManager } from './ExplorationManagers';
import { ExplorationKPIDashboard, ExplorationRiskManager, ExplorationResourceManager } from './ExplorationAnalytics';
import { EXPLORATION_TEMPLATE } from '@/data/explorationTemplate';

const ExplorationProjectDashboard = ({ projectData, onDataChange }) => {
  const [activeTab, setActiveTab] = useState('overview');

  const { tasks, rawTasks, risks, resources, deliverables = [], stage , kpis } = projectData;
  // EC6-0: the stage and gate managers filter on task_category, which the
  // Gantt reshape used to drop, so every stage read 0 percent and Pending
  // for ever. They read the rows as they came from the database.
  const stageTasks = rawTasks || tasks;

  // Filter tasks for Gantt to ensure only valid dates
  const ganttTasks = tasks.filter(t => t.planned_start_date && t.planned_end_date);

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Top Header / Stage Tracker */}
      <div>
        <StageTracker currentStage={stage || 'Prospecting'} template={EXPLORATION_TEMPLATE} tasks={stageTasks} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <Card className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-pl-muted uppercase font-bold">Project Code</p>
                    <p className="text-lg font-pl-mono text-pl-text">{projectData.project_code || 'EXP-001'}</p>
                </div>
                <Layers className="w-6 h-6 text-pl-muted" aria-hidden="true" />
            </Card>
            <Card className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-pl-muted uppercase font-bold">Asset / Block</p>
                    <p className="text-lg font-semibold text-pl-text">{projectData.asset || 'Unassigned'}</p>
                </div>
                <Flag className="w-6 h-6 text-pl-muted" aria-hidden="true" />
            </Card>
            <Card className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-pl-muted uppercase font-bold">Budget</p>
                    <p className="text-lg font-pl-mono text-pl-text">${(projectData.baseline_budget / 1000000).toFixed(1)}M</p>
                </div>
                {/* EC6-0: this read "On Track" in green on every project of this
                    type, whatever its costs said. It is the cost index the
                    earned value actually gives, and "no cost data" when there
                    is none to divide by. */}
                <div className="text-right">
                    <p className="text-[10px] text-pl-muted">CPI</p>
                    <p className={`text-xs ${typeof kpis?.cpi !== 'number' ? 'text-pl-muted' : (kpis.cpi >= 1 ? 'text-pl-success-text' : 'text-pl-danger-text')}`}>
                        {typeof kpis?.cpi === 'number' ? <><span className="font-pl-mono">{kpis.cpi.toFixed(2)}</span> {kpis.cpi >= 1 ? 'Within budget' : 'Over budget'}</> : 'No cost data'}
                    </p>
                </div>
            </Card>
            <Card className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-pl-muted uppercase font-bold">Risk Exposure</p>
                    <p className={`text-lg font-pl-mono ${risks.some(r => r.risk_score > 10) ? 'text-pl-danger-text' : 'text-pl-text'}`}>{risks.filter(r => r.risk_score > 10).length} High</p>
                </div>
                <AlertTriangle className="w-6 h-6 text-pl-muted" aria-hidden="true" />
            </Card>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="flex justify-between items-center gap-2 border-b border-pl-border pb-2 overflow-x-auto">
            <TabsList>
                <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-2"/> Overview</TabsTrigger>
                <TabsTrigger value="schedule"><Layers className="w-4 h-4 mr-2"/> Schedule</TabsTrigger>
                <TabsTrigger value="gates"><Flag className="w-4 h-4 mr-2"/> Gates & Stages</TabsTrigger>
                <TabsTrigger value="deliverables"><FileText className="w-4 h-4 mr-2"/> Deliverables</TabsTrigger>
                <TabsTrigger value="risks"><AlertTriangle className="w-4 h-4 mr-2"/> Risks</TabsTrigger>
                <TabsTrigger value="team"><Users className="w-4 h-4 mr-2"/> Team</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" /> Export Report
            </Button>
        </div>

        <div className="flex-1 mt-4 overflow-y-auto">
            <TabsContent value="overview" className="h-full m-0 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <ExplorationStageManager tasks={stageTasks} />
                    </div>
                    <div>
                        <ExplorationKPIDashboard />
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ExplorationRiskManager risks={risks} />
                    <ExplorationResourceManager resources={resources} />
                </div>
            </TabsContent>

            <TabsContent value="schedule" className="h-full m-0">
                <div className="bg-pl-surface border border-pl-border rounded-lg p-1 h-[600px]">
                    <GanttChart tasks={tasks} projectName={projectData.name} onDataChange={onDataChange} />
                </div>
            </TabsContent>

            <TabsContent value="gates" className="h-full m-0 space-y-6">
                <ExplorationGateManager tasks={stageTasks} />
                <ExplorationStageManager tasks={stageTasks} />
            </TabsContent>

            <TabsContent value="deliverables" className="h-full m-0">
                <ExplorationDeliverableManager deliverables={deliverables} />
            </TabsContent>

            <TabsContent value="risks" className="h-full m-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ExplorationRiskManager risks={risks} />
                    <Card>
                        <CardContent className="p-4">
                            <h3 className="font-bold text-pl-text mb-4">Full Risk Register</h3>
                            {/* Simplified table for now, reuse full component if needed */}
                            <div className="space-y-2">
                                {risks.map((r, i) => (
                                    <div key={i} className="flex justify-between items-center gap-2 p-2 bg-pl-sunken rounded border border-pl-border text-xs">
                                        <span className="text-pl-text">{r.title}</span>
                                        <Badge variant={scoreBand(r.risk_score).variant} className="shrink-0"><span className="font-pl-mono">{r.risk_score}</span>&nbsp;{scoreBand(r.risk_score).label}</Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="team" className="h-full m-0">
                <ExplorationResourceManager resources={resources} />
            </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default ExplorationProjectDashboard;