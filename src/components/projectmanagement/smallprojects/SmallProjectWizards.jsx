import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { SMALL_PROJECTS_TEMPLATES } from '@/data/smallProjectsTemplates';
import { Loader2, CheckCircle, ArrowRight, ArrowLeft, Hammer, Wrench, Activity, FlaskConical, Settings, DollarSign, Calendar } from 'lucide-react';
import { addWeeks } from 'date-fns';

const BaseWizard = ({ open, onOpenChange, onProjectCreated, userId, type, icon: Icon, extraFields, onFieldChange, formData }) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const template = SMALL_PROJECTS_TEMPLATES[type];

  const steps = [
    { id: 1, title: 'Project Info' },
    { id: 2, title: 'Scope' },
    { id: 3, title: 'Plan' },
    { id: 4, title: 'Review' }
  ];

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, steps.length));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const calculateEndDate = () => {
    const totalWeeks = template.stages.reduce((acc, stage) => acc + stage.duration_weeks, 0);
    return addWeeks(new Date(formData.startDate), totalWeeks);
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { data: project, error: projError } = await supabase.from('projects').insert({
          user_id: userId,
          name: formData.name,
          description: formData.description,
          start_date: formData.startDate,
          end_date: calculateEndDate().toISOString(),
          baseline_budget: parseFloat(formData.budget) * 1000, // Budget is usually entered in thousands in these short forms
          company_name: 'Operations',
          project_type: type,
          stage: template.stages[0].name,
          country: formData.country,
          asset: formData.asset,
          status: 'Green',
          percent_complete: 0
        }).select().single();

      if (projError) throw projError;

      // Create Tasks & Gates
      let currentOffset = 0;
      const tasksPayload = [];
      
      template.stages.forEach((stage, stageIdx) => {
          const stageStart = addWeeks(new Date(formData.startDate), currentOffset);
          const stageEnd = addWeeks(stageStart, stage.duration_weeks);
          
          template.tasks.filter(t => t.stage === stage.name).forEach((task, taskIdx) => {
              tasksPayload.push({
                  project_id: project.id,
                  name: task.name,
                  type: 'task',
                  status: 'To Do',
                  workstream: task.workstream,
                  task_category: stage.name,
                  planned_start_date: stageStart.toISOString(),
                  planned_end_date: stageEnd.toISOString(),
                  display_order: (stageIdx * 100) + taskIdx
              });
          });

          template.gates.filter(g => g.stage === stage.name).forEach((gate, gateIdx) => {
               tasksPayload.push({
                  project_id: project.id,
                  name: gate.name,
                  type: 'milestone',
                  status: 'To Do',
                  workstream: 'Governance',
                  task_category: stage.name,
                  planned_start_date: stageEnd.toISOString(),
                  planned_end_date: stageEnd.toISOString(),
                  display_order: (stageIdx * 100) + 90 + gateIdx,
                  milestone_details: { criteria: gate.criteria }
              });
          });
          currentOffset += stage.duration_weeks;
      });
      await supabase.from('tasks').insert(tasksPayload);

      // Create Risks
      const risksPayload = template.risks.map(risk => ({
          project_id: project.id,
          title: risk.title,
          category: risk.category,
          probability: risk.probability,
          impact: risk.impact,
          risk_score: risk.probability * risk.impact,
          description: 'Auto-generated risk',
          status: 'Open',
          owner: 'Unassigned'
      }));
      await supabase.from('risks').insert(risksPayload);

      toast({ title: "Project Created", description: `${type} project initialized.` });
      onProjectCreated();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Interim (rollout 6C): a dark island until this file moves to theme roles; remove data-pl-theme then. */}
      <DialogContent data-pl-theme="dark" className="bg-slate-900 border-slate-700 text-white sm:max-w-[700px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Icon className="w-6 h-6 text-blue-400" /> New {type} Project
          </DialogTitle>
          <DialogDescription className="text-slate-400">Step {currentStep}: {steps[currentStep-1].title}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-between px-12 my-2">
            {steps.map((step) => (
                <div key={step.id} className={`w-8 h-8 rounded-full flex items-center justify-center border ${currentStep >= step.id ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600 text-slate-500'} text-xs`}>{step.id}</div>
            ))}
        </div>
        <Separator className="bg-slate-800 mb-4" />
        <ScrollArea className="flex-1 px-2">
            {currentStep === 1 && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Project Name</Label><Input name="name" value={formData.name} onChange={onFieldChange} className="bg-slate-800 border-slate-700" /></div>
                        <div className="space-y-2"><Label>Project Code</Label><Input name="code" value={formData.code} onChange={onFieldChange} className="bg-slate-800 border-slate-700" /></div>
                    </div>
                    <div className="space-y-2"><Label>Description</Label><Textarea name="description" value={formData.description} onChange={onFieldChange} className="bg-slate-800 border-slate-700" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Asset</Label><Input name="asset" value={formData.asset} onChange={onFieldChange} className="bg-slate-800 border-slate-700" /></div>
                        <div className="space-y-2"><Label>Country</Label><Input name="country" value={formData.country} onChange={onFieldChange} className="bg-slate-800 border-slate-700" /></div>
                    </div>
                    {extraFields.step1}
                </div>
            )}
            {currentStep === 2 && (
                <div className="space-y-4">
                    <div className="space-y-2"><Label>Scope Objectives</Label><Textarea name="objectives" value={formData.objectives} onChange={onFieldChange} placeholder="Define primary goals..." className="bg-slate-800 border-slate-700" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Est. Cost ($k)</Label><Input type="number" name="budget" value={formData.budget} onChange={onFieldChange} className="bg-slate-800 border-slate-700" /></div>
                        <div className="space-y-2"><Label>Duration (Weeks)</Label><Input type="number" value={template.stages.reduce((a,b)=>a+b.duration_weeks,0)} disabled className="bg-slate-800 border-slate-700 text-slate-500" /></div>
                    </div>
                    {extraFields.step2}
                </div>
            )}
            {currentStep === 3 && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Start Date</Label><Input type="date" name="startDate" value={formData.startDate} onChange={onFieldChange} className="bg-slate-800 border-slate-700" /></div>
                        <div className="space-y-2"><Label>End Date (Est.)</Label><Input type="date" value={calculateEndDate().toISOString().split('T')[0]} disabled className="bg-slate-800 border-slate-700 text-slate-500" /></div>
                    </div>
                    <div className="space-y-2"><Label>Project Manager</Label><Input name="manager" value={formData.manager} onChange={onFieldChange} className="bg-slate-800 border-slate-700" /></div>
                    <div className="p-3 bg-slate-800 rounded border border-slate-700 text-xs space-y-1">
                        <div className="font-bold text-slate-300">Default Timeline:</div>
                        {template.stages.map((s, i) => <div key={i} className="flex justify-between text-slate-400"><span>{s.name}</span><span>{s.duration_weeks} weeks</span></div>)}
                    </div>
                </div>
            )}
            {currentStep === 4 && (
                <div className="space-y-4 bg-slate-800/50 p-4 rounded border border-slate-700">
                    <h3 className="font-bold text-white border-b border-slate-700 pb-2">Summary</h3>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <span className="text-slate-400">Name:</span><span className="text-white">{formData.name}</span>
                        <span className="text-slate-400">Type:</span><span className="text-white">{type}</span>
                        <span className="text-slate-400">Budget:</span><span className="text-white">${formData.budget}k</span>
                        <span className="text-slate-400">Stages:</span><span className="text-white">{template.stages.length}</span>
                    </div>
                </div>
            )}
        </ScrollArea>
        <DialogFooter className="mt-auto pt-4 border-t border-slate-800">
            {currentStep > 1 && <Button variant="outline" onClick={prevStep}>Back</Button>}
            {currentStep < 4 ? <Button onClick={nextStep} className="bg-blue-600">Next</Button> : <Button onClick={handleCreate} className="bg-green-600" disabled={loading}>{loading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Create'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const WellInterventionProjectWizard = (props) => {
  const [formData, setFormData] = useState({ name: '', code: '', description: '', asset: '', country: '', startDate: new Date().toISOString().split('T')[0], budget: '150', wellName: '', interventionType: 'Slickline', wellDepth: '', manager: '' });
  const handleChange = (e) => setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
  
  const extraStep1 = (
    <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Well Name</Label><Input name="wellName" value={formData.wellName} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>
        <div className="space-y-2"><Label>Type</Label><Input name="interventionType" value={formData.interventionType} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>
    </div>
  );
  const extraStep2 = <div className="space-y-2"><Label>Well Depth (ft)</Label><Input name="wellDepth" value={formData.wellDepth} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>;

  return <BaseWizard {...props} type="Well Intervention" icon={Wrench} formData={formData} onFieldChange={handleChange} extraFields={{step1: extraStep1, step2: extraStep2}} />;
};

export const FacilityUpgradeProjectWizard = (props) => {
  const [formData, setFormData] = useState({ name: '', code: '', description: '', asset: '', country: '', startDate: new Date().toISOString().split('T')[0], budget: '500', facilityName: '', upgradeType: 'Piping', manager: '' });
  const handleChange = (e) => setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
  
  const extraStep1 = (
    <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Facility Name</Label><Input name="facilityName" value={formData.facilityName} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>
        <div className="space-y-2"><Label>Upgrade Type</Label><Input name="upgradeType" value={formData.upgradeType} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>
    </div>
  );
  
  return <BaseWizard {...props} type="Facility Upgrade" icon={Settings} formData={formData} onFieldChange={handleChange} extraFields={{step1: extraStep1}} />;
};

export const OptimizationProjectWizard = (props) => {
  const [formData, setFormData] = useState({ name: '', code: '', description: '', asset: '', country: '', startDate: new Date().toISOString().split('T')[0], budget: '50', optimizationType: 'Process', expectedBenefits: '', manager: '' });
  const handleChange = (e) => setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
  
  const extraStep1 = <div className="space-y-2"><Label>Optimization Type</Label><Input name="optimizationType" value={formData.optimizationType} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>;
  const extraStep2 = <div className="space-y-2"><Label>Expected Benefits</Label><Textarea name="expectedBenefits" value={formData.expectedBenefits} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>;

  return <BaseWizard {...props} type="Optimization" icon={Activity} formData={formData} onFieldChange={handleChange} extraFields={{step1: extraStep1, step2: extraStep2}} />;
};

export const WorkoverProjectWizard = (props) => {
  const [formData, setFormData] = useState({ name: '', code: '', description: '', asset: '', country: '', startDate: new Date().toISOString().split('T')[0], budget: '300', wellName: '', workoverType: 'Pump Replacement', manager: '' });
  const handleChange = (e) => setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
  
  const extraStep1 = (
    <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Well Name</Label><Input name="wellName" value={formData.wellName} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>
        <div className="space-y-2"><Label>Workover Type</Label><Input name="workoverType" value={formData.workoverType} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>
    </div>
  );

  return <BaseWizard {...props} type="Workover" icon={Hammer} formData={formData} onFieldChange={handleChange} extraFields={{step1: extraStep1}} />;
};

export const RandDProjectWizard = (props) => {
  const [formData, setFormData] = useState({ name: '', code: '', description: '', asset: '', country: '', startDate: new Date().toISOString().split('T')[0], budget: '200', researchArea: 'New Tech', expectedOutcomes: '', manager: '' });
  const handleChange = (e) => setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
  
  const extraStep1 = <div className="space-y-2"><Label>Research Area</Label><Input name="researchArea" value={formData.researchArea} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>;
  const extraStep2 = <div className="space-y-2"><Label>Expected Outcomes</Label><Textarea name="expectedOutcomes" value={formData.expectedOutcomes} onChange={handleChange} className="bg-slate-800 border-slate-700" /></div>;

  return <BaseWizard {...props} type="R&D" icon={FlaskConical} formData={formData} onFieldChange={handleChange} extraFields={{step1: extraStep1, step2: extraStep2}} />;
};