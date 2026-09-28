import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Save, Milestone, LayoutDashboard } from 'lucide-react';

import InputPanel from '@/components/projectmanagement/InputPanel';
import ProjectDashboard from '@/components/projectmanagement/ProjectDashboard';
import PortfolioDashboard from '@/components/projectmanagement/PortfolioDashboard';
import ExplorationProjectDashboard from '@/components/projectmanagement/exploration/ExplorationProjectDashboard';
import AppraisalProjectDashboard from '@/components/projectmanagement/appraisal/AppraisalProjectDashboard';
import FieldDevelopmentProjectDashboard from '@/components/projectmanagement/field_development/FieldDevelopmentProjectDashboard';
import BrownfieldProjectDashboard from '@/components/projectmanagement/brownfield/BrownfieldProjectDashboard';
import DecommissioningProjectDashboard from '@/components/projectmanagement/decommissioning/DecommissioningProjectDashboard';
import { 
    WellInterventionProjectDashboard, FacilityUpgradeProjectDashboard, OptimizationProjectDashboard, WorkoverProjectDashboard, RandDProjectDashboard 
} from '@/components/projectmanagement/smallprojects/SmallProjectDashboards';
import EmptyState from '@/components/projectmanagement/EmptyState';
import { calculateEVM, formatTasksForGantt } from '@/utils/projectManagementCalculations';
import { FullPrecisionProvider, FullPrecisionToggle } from '@/components/fullprecision/FullPrecision';
import { ThemedApp } from '@/design/ThemeProvider';
import { AppHeader } from '@/components/ui/app-shell';

/** Today as a local calendar date, the as-of date the dashboard measures to. */
const todayIsoDate = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};

// W3 (NextGen graded-field follow-on, §1): earned value used to be measured
// only as of today. A typed as-of date (default today, so nothing changes
// until someone types one) measures planned value and SPI at the date a
// report, or a course case, names. A blank or unreadable date means today.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const resolveAsOf = (typed, today = todayIsoDate()) => (
  typeof typed === 'string' && ISO_DATE.test(typed) && !Number.isNaN(Date.parse(typed)) ? typed : today);

const ProjectManagementProInner = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [isPortfolioView, setIsPortfolioView] = useState(true); 

  const [tasks, setTasks] = useState([]);
  const [resources, setResources] = useState([]);
  const [risks, setRisks] = useState([]);
  const [issues, setIssues] = useState([]); 
  const [deliverables, setDeliverables] = useState([]);
  const [evm, setEvm] = useState(null);
  const [evmError, setEvmError] = useState(null);
  const [asOfInput, setAsOfInput] = useState(todayIsoDate());
  const asOfRef = useRef(asOfInput);
  const [loading, setLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, company_name, stage, baseline_budget, project_type, status, country, asset, percent_complete, start_date')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error fetching projects', description: error.message });
    } else {
      setProjects(data || []);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const fetchProjectData = useCallback(async (projectId) => {
    if (!projectId) return;
    setLoading(true);

    const { data: projectData, error: projectError } = await supabase.from('projects').select('*').eq('id', projectId).single();

    if (projectError) {
      toast({ variant: 'destructive', title: 'Error fetching project details', description: projectError.message });
      setLoading(false);
      return;
    }
    
    setActiveProject(projectData);
    setIsPortfolioView(false); 

    const { data: tasksData } = await supabase.from('tasks').select('*').eq('project_id', projectId).order('display_order', { ascending: true });
    const { data: resourcesData } = await supabase.from('pm_resources').select('*').eq('project_id', projectId);
    const { data: risksData } = await supabase.from('risks').select('*').eq('project_id', projectId);
    const { data: issuesData } = await supabase.from('project_issues').select('*').eq('project_id', projectId).order('reported_date', { ascending: false });
    const { data: deliverablesData } = await supabase.from('pm_deliverables').select('*').eq('project_id', projectId);
    
    setTasks(tasksData || []);
    setResources(resourcesData || []);
    setRisks(risksData || []);
    setIssues(issuesData || []); 
    setDeliverables(deliverablesData || []);
      
    // EC6-0: calculateEVM used to take a baselineBudget it never read, and to
    // return its figures as strings. It takes the tasks and returns numbers,
    // and it refuses a cost or a percentage it cannot read rather than
    // counting it as zero, so the refusal is surfaced instead of swallowed.
    // EC6-1: planned value is time-phased to a stated as-of date. Today is
    // what a dashboard means, and it is passed rather than read from the
    // clock inside the engine, so the figure on screen and the figure in a
    // saved progress update are the same measurement.
    try {
      setEvm(calculateEVM(tasksData || [], { asOf: resolveAsOf(asOfRef.current) }));
      setEvmError(null);
    } catch (err) {
      setEvm(null);
      setEvmError(err.message);
      toast({ variant: 'destructive', title: 'Earned value not computed', description: err.message });
    }

    setLoading(false);
  }, [toast]);

  // a new as-of date re-measures the loaded tasks; nothing is refetched
  useEffect(() => {
    asOfRef.current = asOfInput;
    if (!activeProject) return;
    try {
      setEvm(calculateEVM(tasks || [], { asOf: resolveAsOf(asOfInput) }));
      setEvmError(null);
    } catch (err) {
      setEvm(null);
      setEvmError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfInput]);

  useEffect(() => {
    if (location.state?.loadedProject) {
      const { id } = location.state.loadedProject;
      fetchProjectData(id);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, fetchProjectData, navigate]);

  const handleSelectProject = (projectId) => {
    if (projectId) fetchProjectData(projectId);
    else {
      setActiveProject(null);
      setIsPortfolioView(true);
      setTasks([]); setResources([]); setRisks([]); setIssues([]); setDeliverables([]); setEvm(null);
    }
  };

  const handleShowPortfolio = () => {
      setActiveProject(null);
      setIsPortfolioView(true);
  };

  const refreshProjectData = () => {
    if (activeProject) fetchProjectData(activeProject.id);
    else fetchProjects();
  };

  const handleSaveProject = async () => {
    if (!activeProject) return;
    toast({ title: 'Project Saved!', description: `${activeProject.name} is up-to-date.` });
  };

  const commonProps = {
      // EC6-0: rawTasks reaches every dashboard, not only the default one.
      // The stage managers filter on task_category, which the Gantt reshape
      // used to drop, so every stage read 0 percent and Pending for ever.
      projectData: { ...activeProject, tasks: formatTasksForGantt(tasks, activeProject), rawTasks: tasks, kpis: evm, evmError, resources, risks, issues, deliverables },
      onDataChange: refreshProjectData
  };

  const renderDashboard = () => {
      switch(activeProject.project_type) {
          case 'Exploration': return <ExplorationProjectDashboard {...commonProps} />;
          case 'Appraisal': return <AppraisalProjectDashboard {...commonProps} />;
          case 'Field Development': return <FieldDevelopmentProjectDashboard {...commonProps} />;
          case 'Brownfield Development': return <BrownfieldProjectDashboard {...commonProps} />;
          case 'Decommissioning': return <DecommissioningProjectDashboard {...commonProps} />;
          case 'Well Intervention': return <WellInterventionProjectDashboard {...commonProps} />;
          case 'Facility Upgrade': return <FacilityUpgradeProjectDashboard {...commonProps} />;
          case 'Optimization': return <OptimizationProjectDashboard {...commonProps} />;
          case 'Workover': return <WorkoverProjectDashboard {...commonProps} />;
          case 'R&D': return <RandDProjectDashboard {...commonProps} />;
          default: return <ProjectDashboard {...commonProps} />;
      }
  };

  return (
    <>
      <Helmet><title>Project Management Pro - Petrolord Suite</title></Helmet>
      <div className="flex h-full min-h-screen flex-col text-pl-text">
        <AppHeader
          title="Project Management Pro"
          eyebrow="Economics"
          subtitle={activeProject ? `${activeProject.name} · ${activeProject.project_type}` : 'Enterprise Portfolio View'}
          icon={Milestone}
          backTo="/dashboard/economics"
          backLabel="Back"
          actions={(
            <>
              {activeProject && (
                <div className="flex items-center gap-2 text-xs text-pl-muted">
                  <label htmlFor="pmp-as-of" className="font-medium">As of</label>
                  <input
                    id="pmp-as-of"
                    type="date"
                    data-testid="pmp-as-of"
                    value={asOfInput}
                    onChange={(e) => setAsOfInput(e.target.value)}
                    className="h-8 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-pl-text"
                    title="Planned value and SPI are measured at this date"
                  />
                </div>
              )}
              <FullPrecisionToggle app="project-management-pro" />
              <Button variant="ghost" size="sm" onClick={handleShowPortfolio} aria-pressed={isPortfolioView} className={isPortfolioView ? 'bg-pl-sunken text-pl-text' : 'text-pl-muted'}><LayoutDashboard className="w-4 h-4 mr-2" /> Portfolio</Button>
              {!isPortfolioView && <Button onClick={handleSaveProject} disabled={!activeProject} size="sm" variant="outline"><Save className="w-4 h-4 mr-2" /> Save Project</Button>}
            </>
          )}
        />

        <div className="flex flex-1 flex-col lg:flex-row lg:overflow-hidden">
          <aside className="w-full border-b border-pl-border bg-pl-surface p-4 lg:w-1/4 lg:overflow-y-auto lg:border-b-0 lg:border-r xl:w-1/5">
            <InputPanel projects={projects} activeProject={activeProject} tasks={tasks} onSelectProject={handleSelectProject} onProjectCreated={fetchProjects} onDataChange={refreshProjectData} setLoading={setLoading} evmKpis={evm} />
          </aside>
          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:overflow-y-auto">
            {loading ? <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-pl-primary"></div></div> : isPortfolioView ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full"><PortfolioDashboard projects={projects} onSelectProject={handleSelectProject} /></motion.div> : activeProject ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">{renderDashboard()}</motion.div> : <EmptyState />}
          </main>
        </div>
      </div>
    </>
  );
};

// W3 (D3): the Full precision switch prints SPI at 6 decimals and planned
// value to the cent, without digit grouping.
// Design system rollout 6C: the app wraps itself in the Petrolord theme
// scope (light by default, dark per user through the header toggle).
const ProjectManagementPro = () => (
  <ThemedApp className="h-full min-h-screen" data-testid="pmp-theme-scope">
    <FullPrecisionProvider>
      <ProjectManagementProInner />
    </FullPrecisionProvider>
  </ThemedApp>
);

export default ProjectManagementPro;