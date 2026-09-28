import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import CollapsibleSection from './CollapsibleSection';
import { FolderPlus, ListTodo, PlusCircle, AlertTriangle, UserPlus, DollarSign, Flag, Settings, Copy, TrendingUp, AlertCircle, Globe, Activity, Factory, Wrench, Trash2, MoreHorizontal, HelpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NativeSelect } from '@/components/ui/native-select';

import TaskTemplateDialog from './TaskTemplateDialog';
import ProgressUpdateForm from './ProgressUpdateForm';
import RiskForm from './RiskForm';
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
        <Label htmlFor="project-select">Select Project</Label>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full text-pl-muted" aria-label="Help" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="w-4 h-4" />
        </Button>
      </div>
      <NativeSelect
        id="project-select"
        value={activeProject?.id || ''}
        onChange={(e) => onSelectProject(e.target.value)}
        className="w-full"
      >
        <option value="">-- Select a Project --</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </NativeSelect>

      {activeProject && (
          <div className="bg-pl-sunken p-3 rounded-md border border-pl-border space-y-3">
             <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setUpdateOpen(true)} className="w-full h-8 text-xs">
                    <TrendingUp className="w-3 h-3 mr-1" /> Update
                </Button>
                <Button onClick={() => setRiskOpen(true)} variant="outline" className="w-full h-8 text-xs">
                    <AlertTriangle className="w-3 h-3 mr-1" /> Risk
                </Button>
             </div>
          </div>
      )}

      <div className="grid grid-cols-1 gap-2">
          <Button onClick={() => setExplorationWizardOpen(true)} variant="outline" className="w-full justify-start h-9 text-xs"><Globe className="w-3 h-3 mr-2" /> New Exploration Project</Button>
          <Button onClick={() => setAppraisalWizardOpen(true)} variant="outline" className="w-full justify-start h-9 text-xs"><Activity className="w-3 h-3 mr-2" /> New Appraisal Project</Button>
          <Button onClick={() => setFieldDevWizardOpen(true)} variant="outline" className="w-full justify-start h-9 text-xs"><Factory className="w-3 h-3 mr-2" /> New Field Dev Project</Button>
          <Button onClick={() => setBrownfieldWizardOpen(true)} variant="outline" className="w-full justify-start h-9 text-xs"><Wrench className="w-3 h-3 mr-2" /> New Brownfield Project</Button>
          <Button onClick={() => setDecomWizardOpen(true)} variant="outline" className="w-full justify-start h-9 text-xs"><Trash2 className="w-3 h-3 mr-2" /> New Decom Project</Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-start border-dashed text-pl-muted h-9 text-xs">
                    <MoreHorizontal className="w-3 h-3 mr-2" /> Smaller Projects...
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
                <DropdownMenuItem onClick={() => setWellIntWizardOpen(true)} className="cursor-pointer">Well Intervention</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFacUpgradeWizardOpen(true)} className="cursor-pointer">Facility Upgrade</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOptimWizardOpen(true)} className="cursor-pointer">Optimization</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWorkoverWizardOpen(true)} className="cursor-pointer">Workover</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRandDWizardOpen(true)} className="cursor-pointer">R&D Project</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={isCreateProjectOpen} onOpenChange={setCreateProjectOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-full text-[10px] text-pl-muted hover:text-pl-text h-6">Generic Project (Legacy)</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Generic Project</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4 mt-2">
                <Input id="project-name-input" name="project-name-input" placeholder="Project Name" required />
                <DialogFooter><Button type="submit" className="w-full">Create</Button></DialogFooter>
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
            <Button onClick={() => handleOpenTaskDialog('milestone')} variant="outline" className="w-full h-9">
                <Flag className="w-4 h-4 mr-2" /> Add Milestone
            </Button>
            <Button onClick={() => handleOpenTaskDialog('task')} className="w-full h-9">
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
      

      <HelpGuide open={isHelpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
};

export default InputPanel;