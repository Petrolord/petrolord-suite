import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GanttChartSquare, ClipboardList, Users, AlertTriangle, KanbanSquare, BarChart3, FileText, Link2 } from 'lucide-react';
import GanttChart from './GanttChart';
import WBSView from './WBSView';
import StageTracker from './StageTracker';
import KanbanView from './KanbanView';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ExportControls from './ExportControls';
import SnapshotCard from './SnapshotCard'; 
import ProgressAnalytics from './ProgressAnalytics'; 
import WeeklyReportPreview from './WeeklyReportPreview';
import RisksDashboard from './RisksDashboard';
import ResourcesDashboard from './ResourcesDashboard';
import AppIntegrationDashboard from './AppIntegrationDashboard'; // New Import
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const ProjectDashboard = ({ projectData, onDataChange }) => {
  const { name, stage, tasks, kpis, rawTasks, resources, risks, issues, companyName, id } = projectData;
  const [updates, setUpdates] = useState([]);

  // Fetch updates
  useEffect(() => {
      if(id) {
          const fetchUpdates = async () => {
              const { data } = await supabase.from('project_updates').select('*').eq('project_id', id).order('report_date', { ascending: false });
              setUpdates(data || []);
          };
          fetchUpdates();
      }
  }, [id, projectData]);

  const latestUpdate = updates.length > 0 ? updates[0] : null;

  return (
    <div className="space-y-6 h-full flex flex-col">
        <div className="flex flex-col gap-4">
            <StageTracker currentStage={stage || 'Concept'} />
            <SnapshotCard project={projectData} latestUpdate={latestUpdate} kpis={kpis} riskCount={risks?.length || 0} />
        </div>

        <Tabs defaultValue="wbs" className="w-full flex-1 flex flex-col">
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="wbs"><ClipboardList className="w-4 h-4 mr-2"/>WBS</TabsTrigger>
              <TabsTrigger value="kanban"><KanbanSquare className="w-4 h-4 mr-2"/>Kanban</TabsTrigger>
              <TabsTrigger value="gantt"><GanttChartSquare className="w-4 h-4 mr-2"/>Gantt</TabsTrigger>
              <TabsTrigger value="resources"><Users className="w-4 h-4 mr-2"/>Resources</TabsTrigger>
              <TabsTrigger value="progress"><BarChart3 className="w-4 h-4 mr-2"/>Progress</TabsTrigger>
              <TabsTrigger value="risks"><AlertTriangle className="w-4 h-4 mr-2"/>Risks</TabsTrigger>
              <TabsTrigger value="integrations"><Link2 className="w-4 h-4 mr-2"/>Integrations</TabsTrigger>
              <TabsTrigger value="reports"><FileText className="w-4 h-4 mr-2"/>Report</TabsTrigger>
            </TabsList>

            <div className="flex-1 mt-4 min-h-[500px]">
                <TabsContent value="wbs" className="bg-pl-surface rounded-lg p-4 border border-pl-border h-full">
                    <WBSView tasks={rawTasks} onDataChange={onDataChange} projectName={name} />
                </TabsContent>
                <TabsContent value="kanban" className="h-full">
                    <KanbanView tasks={rawTasks} onDataChange={onDataChange} />
                </TabsContent>
                <TabsContent value="gantt" className="h-full">
                    <GanttChart tasks={tasks} projectName={name} companyName={companyName} onDataChange={onDataChange} />
                </TabsContent>
                <TabsContent value="resources" className="h-full">
                    <ResourcesDashboard project={projectData} onDataChange={onDataChange} />
                </TabsContent>
                <TabsContent value="progress" className="h-full">
                    <ProgressAnalytics projectId={id} updates={updates} />
                </TabsContent>
                <TabsContent value="risks" className="h-full">
                    <RisksDashboard project={projectData} risks={risks} issues={issues} onDataChange={onDataChange} />
                </TabsContent>
                <TabsContent value="integrations" className="h-full">
                    <AppIntegrationDashboard project={projectData} />
                </TabsContent>
                <TabsContent value="reports" className="h-full overflow-y-auto">
                    <WeeklyReportPreview project={projectData} latestUpdate={latestUpdate} tasks={rawTasks} kpis={kpis} />
                </TabsContent>
            </div>
        </Tabs>
    </div>
  );
};

export default ProjectDashboard;