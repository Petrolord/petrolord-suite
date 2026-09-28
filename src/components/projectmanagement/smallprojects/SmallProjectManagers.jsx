import React from 'react';
import { stageProgress } from '../StageTracker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { scoreBand } from '../RisksDashboard';
import { Layers, Flag, ListTodo, AlertTriangle, BarChart3 } from 'lucide-react';
import { SMALL_PROJECTS_TEMPLATES } from '@/data/smallProjectsTemplates';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

// Generic Manager Components
const GenericStageManager = ({ tasks, type }) => {
  const template = SMALL_PROJECTS_TEMPLATES[type];
  if (!template) return null;
  
  const stages = template.stages.map(s => {
      const stageTasks = tasks.filter(t => t.task_category === s.name && t.type !== 'milestone');
      const total = stageTasks.length;
      const progress = stageProgress(stageTasks);
      return { ...s, progress, total };
  });

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text flex items-center gap-2"><Layers className="w-4 h-4 text-pl-muted"/> Stages</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
            {stages.map((s, i) => (
                <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs text-pl-text"><span>{s.name}</span><span>{s.progress}%</span></div>
                    <div className="h-2 bg-pl-sunken rounded-full overflow-hidden"><div className="h-full bg-pl-primary" style={{width: `${s.progress}%`}}/></div>
                </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
};

const GenericGateManager = ({ tasks, type }) => {
    const template = SMALL_PROJECTS_TEMPLATES[type];
    if(!template) return null;
    const gates = tasks.filter(t => t.type === 'milestone');

    return (
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text flex items-center gap-2"><Flag className="w-4 h-4 text-pl-muted"/> Gates</CardTitle></CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {gates.length > 0 ? gates.map((g, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-pl-sunken rounded border border-pl-border text-xs">
                            <span className="text-pl-text">{g.name}</span>
                            <Badge variant={g.status === 'Done' ? 'success' : 'neutral'} className="text-[10px] h-5">{g.status}</Badge>
                        </div>
                    )) : <div className="text-xs text-pl-muted">No gates found</div>}
                </div>
            </CardContent>
        </Card>
    );
};

const GenericTaskManager = ({ tasks, type }) => {
    const template = SMALL_PROJECTS_TEMPLATES[type];
    const taskList = tasks.filter(t => t.type === 'task');
    return (
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text flex items-center gap-2"><ListTodo className="w-4 h-4 text-pl-muted"/> Key Tasks</CardTitle></CardHeader>
            <CardContent>
                <ScrollableTable tasks={taskList} />
            </CardContent>
        </Card>
    );
};

const ScrollableTable = ({tasks}) => (
    <div className="max-h-[200px] overflow-y-auto">
        <table className="w-full text-xs text-left">
            <thead><tr className="text-pl-muted border-b border-pl-border"><th>Task</th><th>Status</th></tr></thead>
            <tbody>
                {tasks.map((t,i) => (
                    <tr key={i} className="border-b border-pl-border">
                        <td className="py-2 text-pl-text">{t.name}</td>
                        <td className="py-2"><Badge variant={t.status==='Done' ? 'success' : 'neutral'} className="text-[10px]">{t.status}</Badge></td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const GenericRiskManager = ({ risks, type }) => {
    return (
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-pl-muted"/> Risks</CardTitle></CardHeader>
            <CardContent>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {risks.map((r, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-pl-sunken rounded text-xs">
                            <span className="text-pl-text truncate max-w-[70%]">{r.title}</span>
                            <div className="flex gap-2">
                                <Badge variant={scoreBand(r.risk_score).variant}>Score: {r.risk_score} {scoreBand(r.risk_score).label}</Badge>
                            </div>
                        </div>
                    ))}
                    {risks.length === 0 && <div className="text-xs text-pl-muted">No risks logged.</div>}
                </div>
            </CardContent>
        </Card>
    );
};

/**
 * EC6-0. This chart plotted a random value against each KPI target, drawn
 * fresh on every render: the bars moved when nothing in the project had
 * changed. The studio records no measurement against these KPIs, so the
 * targets are listed as the targets they are.
 */
const GenericKPIDashboard = ({ type }) => {
    const template = SMALL_PROJECTS_TEMPLATES[type];
    const kpis = template ? template.kpis.slice(0, 6) : [];

    return (
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text flex items-center gap-2"><BarChart3 className="w-4 h-4 text-pl-muted"/> KPI targets</CardTitle></CardHeader>
            <CardContent>
                {kpis.length === 0 ? (
                    <div className="text-xs text-pl-muted">No KPI template for this project type.</div>
                ) : (
                    <div className="space-y-2">
                        {kpis.map((k) => (
                            <div key={k.name} className="flex items-center justify-between text-xs border-b border-pl-border pb-1 last:border-0">
                                <span className="text-pl-text">{k.name}</span>
                                <span className="text-pl-muted font-mono">Target {k.target}{k.unit ? ` ${k.unit}` : ''}</span>
                            </div>
                        ))}
                        <p className="text-[10px] text-pl-muted pt-2">
                            Targets from the project-type template. Nothing in the studio measures
                            against them yet, so no achieved value is shown.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Specific Exports
export const WellInterventionStageManager = (props) => <GenericStageManager {...props} type="Well Intervention" />;
export const WellInterventionGateManager = (props) => <GenericGateManager {...props} type="Well Intervention" />;
export const WellInterventionTaskManager = (props) => <GenericTaskManager {...props} type="Well Intervention" />;
export const WellInterventionRiskManager = (props) => <GenericRiskManager {...props} type="Well Intervention" />;
export const WellInterventionKPIDashboard = (props) => <GenericKPIDashboard {...props} type="Well Intervention" />;

export const FacilityUpgradeStageManager = (props) => <GenericStageManager {...props} type="Facility Upgrade" />;
export const FacilityUpgradeGateManager = (props) => <GenericGateManager {...props} type="Facility Upgrade" />;
export const FacilityUpgradeTaskManager = (props) => <GenericTaskManager {...props} type="Facility Upgrade" />;
export const FacilityUpgradeRiskManager = (props) => <GenericRiskManager {...props} type="Facility Upgrade" />;
export const FacilityUpgradeKPIDashboard = (props) => <GenericKPIDashboard {...props} type="Facility Upgrade" />;

export const OptimizationStageManager = (props) => <GenericStageManager {...props} type="Optimization" />;
export const OptimizationGateManager = (props) => <GenericGateManager {...props} type="Optimization" />;
export const OptimizationTaskManager = (props) => <GenericTaskManager {...props} type="Optimization" />;
export const OptimizationRiskManager = (props) => <GenericRiskManager {...props} type="Optimization" />;
export const OptimizationKPIDashboard = (props) => <GenericKPIDashboard {...props} type="Optimization" />;

export const WorkoverStageManager = (props) => <GenericStageManager {...props} type="Workover" />;
export const WorkoverGateManager = (props) => <GenericGateManager {...props} type="Workover" />;
export const WorkoverTaskManager = (props) => <GenericTaskManager {...props} type="Workover" />;
export const WorkoverRiskManager = (props) => <GenericRiskManager {...props} type="Workover" />;
export const WorkoverKPIDashboard = (props) => <GenericKPIDashboard {...props} type="Workover" />;

export const RandDStageManager = (props) => <GenericStageManager {...props} type="R&D" />;
export const RandDGateManager = (props) => <GenericGateManager {...props} type="R&D" />;
export const RandDTaskManager = (props) => <GenericTaskManager {...props} type="R&D" />;
export const RandDRiskManager = (props) => <GenericRiskManager {...props} type="R&D" />;
export const RandDKPIDashboard = (props) => <GenericKPIDashboard {...props} type="R&D" />;