import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from '@/components/ui/card';
import StageTracker from '../StageTracker';
import { SMALL_PROJECTS_TEMPLATES } from '@/data/smallProjectsTemplates';
import GanttChart from '../GanttChart';
import { 
    WellInterventionStageManager, WellInterventionGateManager, WellInterventionTaskManager, WellInterventionRiskManager, WellInterventionKPIDashboard,
    FacilityUpgradeStageManager, FacilityUpgradeGateManager, FacilityUpgradeTaskManager, FacilityUpgradeRiskManager, FacilityUpgradeKPIDashboard,
    OptimizationStageManager, OptimizationGateManager, OptimizationTaskManager, OptimizationRiskManager, OptimizationKPIDashboard,
    WorkoverStageManager, WorkoverGateManager, WorkoverTaskManager, WorkoverRiskManager, WorkoverKPIDashboard,
    RandDStageManager, RandDGateManager, RandDTaskManager, RandDRiskManager, RandDKPIDashboard
} from './SmallProjectManagers';
import { LayoutDashboard, ListChecks, AlertTriangle, BarChart2, CalendarDays } from 'lucide-react';

const GenericSmallProjectDashboard = ({ projectData, onDataChange, type, components }) => {
    const { tasks, rawTasks, risks, stage } = projectData;
    const { StageManager, GateManager, TaskManager, RiskManager, KPIDashboard } = components;

    return (
        <div className="flex flex-col h-full gap-4">
            <StageTracker currentStage={stage || 'Planning'} template={SMALL_PROJECTS_TEMPLATES[type]} tasks={rawTasks || tasks} />
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <p className="text-[10px] text-pl-muted uppercase">Project</p>
                    <p className="text-lg font-bold text-pl-text truncate">{projectData.name}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-[10px] text-pl-muted uppercase">Type</p>
                    <p className="text-lg font-bold text-pl-text">{type}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-[10px] text-pl-muted uppercase">Budget</p>
                    <p className="text-lg font-bold font-pl-mono text-pl-text">${projectData.baseline_budget?.toLocaleString()}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-[10px] text-pl-muted uppercase">Tasks</p>
                    <p className="text-lg font-bold font-pl-mono text-pl-text">{tasks.filter(t=>t.status==='Done').length}/{tasks.length}</p>
                </Card>
            </div>

            <Tabs defaultValue="overview" className="flex-1 flex flex-col">
                <TabsList className="w-fit max-w-full overflow-x-auto">
                    <TabsTrigger value="overview"><LayoutDashboard className="w-4 h-4 mr-2"/> Overview</TabsTrigger>
                    <TabsTrigger value="tasks"><ListChecks className="w-4 h-4 mr-2"/> Tasks & Gates</TabsTrigger>
                    <TabsTrigger value="schedule"><CalendarDays className="w-4 h-4 mr-2"/> Schedule</TabsTrigger>
                    <TabsTrigger value="risks"><AlertTriangle className="w-4 h-4 mr-2"/> Risks</TabsTrigger>
                    <TabsTrigger value="analytics"><BarChart2 className="w-4 h-4 mr-2"/> Analytics</TabsTrigger>
                </TabsList>

                <div className="flex-1 mt-4 overflow-y-auto">
                    <TabsContent value="overview" className="h-full m-0 space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-2"><StageManager tasks={tasks} /></div>
                            <div><KPIDashboard /></div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <TaskManager tasks={tasks} />
                            <RiskManager risks={risks} />
                        </div>
                    </TabsContent>
                    <TabsContent value="tasks" className="h-full m-0 space-y-4">
                        <GateManager tasks={tasks} />
                        <TaskManager tasks={tasks} />
                    </TabsContent>
                    <TabsContent value="schedule" className="h-full m-0">
                        <div className="bg-pl-surface border-pl-border border rounded p-1 h-[500px]">
                            <GanttChart tasks={tasks} projectName={projectData.name} onDataChange={onDataChange} />
                        </div>
                    </TabsContent>
                    <TabsContent value="risks" className="h-full m-0">
                        <RiskManager risks={risks} />
                    </TabsContent>
                    <TabsContent value="analytics" className="h-full m-0">
                        <KPIDashboard />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
};

export const WellInterventionProjectDashboard = (props) => <GenericSmallProjectDashboard {...props} type="Well Intervention" components={{StageManager: WellInterventionStageManager, GateManager: WellInterventionGateManager, TaskManager: WellInterventionTaskManager, RiskManager: WellInterventionRiskManager, KPIDashboard: WellInterventionKPIDashboard}} />;
export const FacilityUpgradeProjectDashboard = (props) => <GenericSmallProjectDashboard {...props} type="Facility Upgrade" components={{StageManager: FacilityUpgradeStageManager, GateManager: FacilityUpgradeGateManager, TaskManager: FacilityUpgradeTaskManager, RiskManager: FacilityUpgradeRiskManager, KPIDashboard: FacilityUpgradeKPIDashboard}} />;
export const OptimizationProjectDashboard = (props) => <GenericSmallProjectDashboard {...props} type="Optimization" components={{StageManager: OptimizationStageManager, GateManager: OptimizationGateManager, TaskManager: OptimizationTaskManager, RiskManager: OptimizationRiskManager, KPIDashboard: OptimizationKPIDashboard}} />;
export const WorkoverProjectDashboard = (props) => <GenericSmallProjectDashboard {...props} type="Workover" components={{StageManager: WorkoverStageManager, GateManager: WorkoverGateManager, TaskManager: WorkoverTaskManager, RiskManager: WorkoverRiskManager, KPIDashboard: WorkoverKPIDashboard}} />;
export const RandDProjectDashboard = (props) => <GenericSmallProjectDashboard {...props} type="R&D" components={{StageManager: RandDStageManager, GateManager: RandDGateManager, TaskManager: RandDTaskManager, RiskManager: RandDRiskManager, KPIDashboard: RandDKPIDashboard}} />;