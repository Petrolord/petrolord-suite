import React, { useState } from 'react';
import { formatBudgetMillions } from '../formatBudget';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, Flag, FileText, AlertTriangle, Users, Download, BarChart3, Wrench, Lightbulb, Factory } from 'lucide-react';
import StageTracker from '../StageTracker';
import { scoreBand } from '../RisksDashboard';
import { Badge } from '@/components/ui/badge';
import { TaskReportControls } from '../ExportControls';
import { BROWNFIELD_TEMPLATE } from '@/data/brownfieldTemplate';
import GanttChart from '../GanttChart';
import { BrownfieldStageManager, BrownfieldGateManager, BrownfieldDeliverableManager } from './BrownfieldManagers';
import { BrownfieldKPIDashboard, BrownfieldRiskManager, BrownfieldResourceManager } from './BrownfieldAnalytics';
import { OpportunityIdentification, InfrastructureAssessment, BrownfieldOptimization, ProductionIncreaseTracking } from './BrownfieldPhaseTrackers';

const BrownfieldProjectDashboard = ({ projectData, onDataChange }) => {
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
        <StageTracker currentStage={stage || 'Opportunity Identification'} template={BROWNFIELD_TEMPLATE} tasks={stageTasks} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <Card className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-pl-muted uppercase font-bold">Project</p>
                    <p className="text-lg font-semibold text-pl-text truncate max-w-[150px]" title={projectData.name}>{projectData.name}</p>
                </div>
                <Wrench className="w-6 h-6 text-pl-muted opacity-60" />
            </Card>
            <Card className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-pl-muted uppercase font-bold">Asset</p>
                    <p className="text-lg font-semibold text-pl-text truncate max-w-[150px]">{projectData.asset || 'Unknown'}</p>
                </div>
                <Factory className="w-6 h-6 text-pl-muted opacity-50" />
            </Card>
            <Card className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-pl-muted uppercase font-bold">Budget Status</p>
                    <p className="text-lg font-pl-mono tabular-nums text-pl-text">{formatBudgetMillions(projectData.baseline_budget)}</p>
                </div>
                {/* EC6-0: this read "On Budget" in green on every project of this
                    type, whatever its costs said. It is the cost index the
                    earned value actually gives, and "no cost data" when there
                    is none to divide by. */}
                <div className="text-right">
                    <p className="text-[10px] text-pl-muted">CPI</p>
                    <p className={`text-xs ${typeof kpis?.cpi !== 'number' ? 'text-pl-muted' : (kpis.cpi >= 1 ? 'text-pl-success-text' : 'text-pl-danger-text')}`}>
                        {typeof kpis?.cpi === 'number' ? `${kpis.cpi.toFixed(2)} ${kpis.cpi >= 1 ? 'within budget' : 'over budget'}` : 'No cost data'}
                    </p>
                </div>
            </Card>
            <Card className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-pl-muted uppercase font-bold">Uplift Target</p>
                    <p className="text-lg font-pl-mono tabular-nums text-pl-text">+5k bopd</p>
                </div>
                <Lightbulb className="w-6 h-6 text-pl-muted opacity-60" />
            </Card>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="flex justify-between items-center border-b border-pl-border pb-2 overflow-x-auto">
            <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-2"/> Overview</TabsTrigger>
                <TabsTrigger value="phases"><Wrench className="w-4 h-4 mr-2"/> Tracks & Optimization</TabsTrigger>
                <TabsTrigger value="schedule"><Layers className="w-4 h-4 mr-2"/> Schedule</TabsTrigger>
                <TabsTrigger value="gates"><Flag className="w-4 h-4 mr-2"/> Gates</TabsTrigger>
                <TabsTrigger value="deliverables"><FileText className="w-4 h-4 mr-2"/> Deliverables</TabsTrigger>
                <TabsTrigger value="risks"><AlertTriangle className="w-4 h-4 mr-2"/> Risks</TabsTrigger>
                <TabsTrigger value="team"><Users className="w-4 h-4 mr-2"/> Team</TabsTrigger>
            </TabsList>
            <div className="ml-2"><TaskReportControls tasks={stageTasks} projectName={projectData.name} /></div>
        </div>

        <div className="flex-1 mt-4 overflow-y-auto">
            <TabsContent value="overview" className="h-full m-0 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <BrownfieldStageManager tasks={stageTasks} />
                    </div>
                    <div>
                        <BrownfieldKPIDashboard />
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <BrownfieldRiskManager risks={risks} />
                    <BrownfieldResourceManager resources={resources} />
                </div>
            </TabsContent>

            <TabsContent value="phases" className="h-full m-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <OpportunityIdentification />
                    <InfrastructureAssessment />
                    <BrownfieldOptimization />
                    <ProductionIncreaseTracking />
                </div>
            </TabsContent>

            <TabsContent value="schedule" className="h-full m-0">
                <div className="bg-pl-surface border border-pl-border rounded-lg p-1 h-[600px]">
                    <GanttChart tasks={tasks} projectName={projectData.name} onDataChange={onDataChange} />
                </div>
            </TabsContent>

            <TabsContent value="gates" className="h-full m-0 space-y-6">
                <BrownfieldGateManager tasks={stageTasks} />
                <BrownfieldStageManager tasks={stageTasks} />
            </TabsContent>

            <TabsContent value="deliverables" className="h-full m-0">
                <BrownfieldDeliverableManager deliverables={deliverables} />
            </TabsContent>

            <TabsContent value="risks" className="h-full m-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <BrownfieldRiskManager risks={risks} />
                    <Card>
                        <CardContent className="p-4">
                            <h3 className="font-bold text-pl-text mb-4">Risk Register (Brownfield Specific)</h3>
                            <div className="space-y-2">
                                {risks.map((r, i) => (
                                    <div key={i} className="flex justify-between p-2 bg-pl-sunken rounded border border-pl-border text-xs">
                                        <span className="text-pl-text">{r.title}</span>
                                        <Badge variant={scoreBand(r.risk_score).variant} className="font-pl-mono tabular-nums">{r.risk_score} {scoreBand(r.risk_score).label}</Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="team" className="h-full m-0">
                <BrownfieldResourceManager resources={resources} />
            </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default BrownfieldProjectDashboard;