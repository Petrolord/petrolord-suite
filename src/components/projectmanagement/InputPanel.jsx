import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import CollapsibleSection from './CollapsibleSection';
import { FolderPlus, ListTodo, PlusCircle, AlertTriangle, UserPlus, DollarSign, Flag, Settings, Copy, TrendingUp, AlertCircle, Globe, Activity, Factory, Wrench, Trash2, MoreHorizontal, PlugZap, HelpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import TaskTemplateDialog from './TaskTemplateDialog';
import ProgressUpdateForm from './ProgressUpdateForm';
import RiskForm from './RiskForm';
import IntegrationHub from './integrations/IntegrationHub';
import HelpGuide from './help/HelpGuide';
import TaskFormDialog from './TaskFormDialog';

import ExplorationProjectWizard from './exploration/ExplorationProjectWizard';
import AppraisalProjectWizard from './appraisal/AppraisalProjectWizard';
import FieldDevelopmentProjectWizard from './field_development/FieldDevelopmentProjectWizard';
import BrownfieldProjectWizard from './brownfield/BrownfieldProjectWizard';
import DecommissioningProjectWizard from './decommissioning/DecommissioningProjectWizard';
import { WellInterventionProjectWizard, FacilityUpgradeProjectWizard, OptimizationProjectWizard, WorkoverProjectWizard, RandDProjectWizard } from './smallprojects/SmallProjectWizards';

/*
 * LOG: InputPanel.jsx Updated
 * - Removed inline inputs for tasks/milestones.
 * - Replaced with TaskFormDialog to ensure robust validation and error handling.
 * - Add Task button is always clickable; if no active project, it displays a friendly error.
 */

const InputPanel = ({ projects, activeProject, tasks, onSelectProject, onProjectCreated, onDataChange, setLoading, evmKpis }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateProjectOpen, setCreateProjectOpen] = useState(false);
  
  // Wizards
  const [isExplorationWizardOpen, setExplorationWizardOpen] = useState(false);
  const [isAppraisalWizardOpen, setAppraisalWizardOpen] = useState(false);
  const [isFieldDevWizardOpen, setFieldDevWizardOpen] = useState(false);
  const [isBrownfieldWizardOpen, setBrownfieldWizardOpen] = useState(false);
  const [isDecomWizardOpen, setDecomWizardOpen] = useState(false);
  
  // Small Project Wizards
  const [isWellIntWizardOpen, setWellIntWizardOpen] = useState(false);
  const [isFacUpgradeWizardOpen, setFacUpgradeWizardOpen] = useState(false);
  const [isOptimWizardOpen, setOptimWizardOpen] = useState(false);
  const [isWorkoverWizardOpen, setWorkoverWizardOpen] = useState(false);
  const [isRandDWizardOpen, setRandDWizardOpen] = useState(false);

  const [isTemplateOpen, setTemplateOpen] = useState(false);
  const [isUpdateOpen, setUpdateOpen] = useState(false);
  const [isRiskOpen, setRiskOpen] = useState(false);
  const [isIntegrationOpen, setIntegrationOpen] = useState(false);
  const [isHelpOpen, setHelpOpen] = useState(false);
  
  const [isTaskDialogOpen, setTaskDialogOpen] = useState(false);
  const [newTaskType, setNewTaskType] = useState('task');
  
  const [projectType, setProjectType] = useState('Other');

  const handleCreateProject = async (event) => {
    event.preventDefault();
    if (!user) {
      toast({ variant: 'destructive', title: 'You must be logged in.' });
      return;
    }
    const formData = new FormData(event.target);
    const newProject = {
      user_id: user.id,
      name: formData.get('project-name-input'),
      description: formData.get('project-desc-input'),
      start_date: formData.get('project-start-input'),
      baseline_budget: parseFloat(formData.get('project-budget-input')),
      company_name: formData.get('company-name-input'),
      project_type: projectType,
      stage: 'Concept'
    };

    if (!newProject.name) {
      toast({ variant: 'destructive', title: 'Project name is required.' });
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('projects').insert([newProject]);
    setLoading(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to create project', description: error.message });
    } else {
      toast({ title: 'Project Created!', description: `"${newProject.name}" has been created.` });
      setCreateProjectOpen(false);
      onProjectCreated();
    }
  };

  const handleOpenTaskDialog = (type) => {
      if (!activeProject) {
          toast({ 
              variant: 'destructive', 
              title: 'No Project Selected', 
              description: 'Please select or create a project first before adding items.' 
          });
          return;
      }
      setNewTaskType(type);
      setTaskDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Label htmlFor="project-select" className="text-lime-300">Select Project</Label>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-white/10 text-slate-400" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="w-4 h-4" />
        </Button>
      </div>
      <select
        id="project-select"
        value={activeProject?.id || ''}
        onChange={(e) => onSelectProject(e.target.value)}
        className="w-full bg-white border border-slate-300 rounded-md p-2 text-black text-sm"
      >
        <option value="">-- Select a Project --</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {activeProject && (
          <div className="bg-white/5 p-3 rounded border border-white/10 space-y-3">
             <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setUpdateOpen(true)} className="w-full bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs">
                    <TrendingUp className="w-3 h-3 mr-1" /> Update
                </Button>
                <Button onClick={() => setRiskOpen(true)} className="w-full bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs">
                    <AlertTriangle className="w-3 h-3 mr-1" /> Risk
                </Button>
             </div>
             <Button onClick={() => setIntegrationOpen(true)} className="w-full bg-slate-700 hover:bg-slate-600 text-white h-8 text-xs border border-slate-600">
                <PlugZap className="w-3 h-3 mr-2 text-yellow-400" /> External Integrations
             </Button>
          </div>
      )}

      <div className="grid grid-cols-1 gap-2">
          <Button onClick={() => setExplorationWizardOpen(true)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-9 text-xs"><Globe className="w-3 h-3 mr-2" /> New Exploration Project</Button>
          <Button onClick={() => setAppraisalWizardOpen(true)} className="w-full bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs"><Activity className="w-3 h-3 mr-2" /> New Appraisal Project</Button>
          <Button onClick={() => setFieldDevWizardOpen(true)} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-9 text-xs"><Factory className="w-3 h-3 mr-2" /> New Field Dev Project</Button>
          <Button onClick={() => setBrownfieldWizardOpen(true)} className="w-full bg-orange-600 hover:bg-orange-700 text-white h-9 text-xs"><Wrench className="w-3 h-3 mr-2" /> New Brownfield Project</Button>
          <Button onClick={() => setDecomWizardOpen(true)} className="w-full bg-red-600 hover:bg-red-700 text-white h-9 text-xs"><Trash2 className="w-3 h-3 mr-2" /> New Decom Project</Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full border-dashed border-slate-600 text-slate-400 hover:text-white h-9 text-xs">
                    <MoreHorizontal className="w-3 h-3 mr-2" /> Smaller Projects...
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-900 border-slate-700 text-white w-56">
                <DropdownMenuItem onClick={() => setWellIntWizardOpen(true)} className="hover:bg-slate-800 cursor-pointer">Well Intervention</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFacUpgradeWizardOpen(true)} className="hover:bg-slate-800 cursor-pointer">Facility Upgrade</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOptimWizardOpen(true)} className="hover:bg-slate-800 cursor-pointer">Optimization</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWorkoverWizardOpen(true)} className="hover:bg-slate-800 cursor-pointer">Workover</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRandDWizardOpen(true)} className="hover:bg-slate-800 cursor-pointer">R&D Project</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={isCreateProjectOpen} onOpenChange={setCreateProjectOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-full text-[10px] text-slate-500 hover:text-slate-300 h-6">Generic Project (Legacy)</Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 text-white">
              <DialogHeader><DialogTitle>Create Generic Project</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4 mt-2">
                <Input id="project-name-input" name="project-name-input" placeholder="Project Name" className="bg-slate-950 border-slate-700" required />
                <DialogFooter><Button type="submit" className="w-full bg-lime-600 hover:bg-lime-700">Create</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
      </div>

      <ExplorationProjectWizard open={isExplorationWizardOpen} onOpenChange={setExplorationWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      <AppraisalProjectWizard open={isAppraisalWizardOpen} onOpenChange={setAppraisalWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      <FieldDevelopmentProjectWizard open={isFieldDevWizardOpen} onOpenChange={setFieldDevWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      <BrownfieldProjectWizard open={isBrownfieldWizardOpen} onOpenChange={setBrownfieldWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      <DecommissioningProjectWizard open={isDecomWizardOpen} onOpenChange={setDecomWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      
      <WellInterventionProjectWizard open={isWellIntWizardOpen} onOpenChange={setWellIntWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      <FacilityUpgradeProjectWizard open={isFacUpgradeWizardOpen} onOpenChange={setFacUpgradeWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      <OptimizationProjectWizard open={isOptimWizardOpen} onOpenChange={setOptimWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      <WorkoverProjectWizard open={isWorkoverWizardOpen} onOpenChange={setWorkoverWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />
      <RandDProjectWizard open={isRandDWizardOpen} onOpenChange={setRandDWizardOpen} onProjectCreated={onProjectCreated} userId={user?.id} />

      <CollapsibleSection title="Tasks & Milestones" icon={<ListTodo />} defaultOpen>
        <div className="space-y-3">
            <Button onClick={() => handleOpenTaskDialog('milestone')} className="w-full h-9 bg-purple-600 hover:bg-purple-700 text-white">
                <Flag className="w-4 h-4 mr-2" /> Add Milestone
            </Button>
            <Button onClick={() => handleOpenTaskDialog('task')} className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white">
                <PlusCircle className="w-4 h-4 mr-2" /> Add Task
            </Button>
        </div>
      </CollapsibleSection>
      
      {/* Dialogs */}
      <TaskFormDialog 
        open={isTaskDialogOpen} 
        onOpenChange={setTaskDialogOpen} 
        project={activeProject} 
        tasks={tasks} 
        onSaved={onDataChange} 
        initialType={newTaskType}
        existingTask={null} // explicitly pass null to ensure insertion logic triggers for new tasks
      />

      <TaskTemplateDialog open={isTemplateOpen} onOpenChange={setTemplateOpen} projectId={activeProject?.id} onTasksAdded={onDataChange} />
      <ProgressUpdateForm open={isUpdateOpen} onOpenChange={setUpdateOpen} project={activeProject} kpis={evmKpis} onUpdateSaved={onDataChange} />
      <RiskForm open={isRiskOpen} onOpenChange={setRiskOpen} project={activeProject} onSaved={onDataChange} />
      
      <Dialog open={isIntegrationOpen} onOpenChange={setIntegrationOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
            <IntegrationHub project={activeProject} />
        </DialogContent>
      </Dialog>

      <HelpGuide open={isHelpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
};

export default InputPanel;