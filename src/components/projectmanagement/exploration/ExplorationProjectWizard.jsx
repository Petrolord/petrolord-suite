import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { EXPLORATION_TEMPLATE } from '@/data/explorationTemplate';
import { Loader2, CheckCircle, ArrowRight, ArrowLeft, Globe, Layers, DollarSign, Calendar } from 'lucide-react';
import { addWeeks, format } from 'date-fns';

const steps = [
  { id: 1, title: 'Project Details', icon: Globe },
  { id: 2, title: 'Scope & Technical', icon: Layers },
  { id: 3, title: 'Timeline & Budget', icon: Calendar },
  { id: 4, title: 'Review', icon: CheckCircle }
];

const ExplorationProjectWizard = ({ open, onOpenChange, onProjectCreated, userId }) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    country: '',
    region: '',
    asset: '',
    prospectName: '',
    seismicType: '3D',
    estimatedReserves: '',
    concept: 'Structural Trap',
    startDate: new Date().toISOString().split('T')[0],
    budget: '',
    currency: 'USD',
    manager: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, steps.length));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const calculateEndDate = () => {
    const totalWeeks = EXPLORATION_TEMPLATE.stages.reduce((acc, stage) => acc + stage.duration_weeks, 0);
    return addWeeks(new Date(formData.startDate), totalWeeks);
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      // 1. Create Project
      const { data: project, error: projError } = await supabase
        .from('projects')
        .insert({
          user_id: userId,
          name: formData.name,
          description: formData.description,
          start_date: formData.startDate,
          end_date: calculateEndDate().toISOString(),
          baseline_budget: parseFloat(formData.budget) * 1000000, // Assuming input is in Millions
          company_name: 'Exploration Co.', // Default or derived
          project_type: 'Exploration',
          stage: 'Prospecting',
          country: formData.country,
          asset: formData.asset,
          status: 'Green',
          percent_complete: 0
        })
        .select()
        .single();

      if (projError) throw projError;

      // 2. Create Tasks & Stages & Milestones
      let currentOffset = 0;
      const tasksPayload = [];
      
      // Add Stages as summary tasks first (optional, but good for gantt structure) or just flat list mapped to stages
      // We will map tasks to stages based on template
      
      EXPLORATION_TEMPLATE.stages.forEach((stage, stageIdx) => {
          const stageStart = addWeeks(new Date(formData.startDate), currentOffset);
          const stageEnd = addWeeks(stageStart, stage.duration_weeks);
          
          // Add Tasks for this stage
          const stageTasks = EXPLORATION_TEMPLATE.tasks.filter(t => t.stage === stage.name);
          stageTasks.forEach((task, taskIdx) => {
              tasksPayload.push({
                  project_id: project.id,
                  name: task.name,
                  type: task.type,
                  status: 'To Do',
                  workstream: task.workstream,
                  task_category: stage.name, // Using stage as category for grouping
                  planned_start_date: stageStart.toISOString(),
                  planned_end_date: stageEnd.toISOString(),
                  display_order: (stageIdx * 100) + taskIdx
              });
          });

          // Add Gate for this stage (if any)
          const stageGates = EXPLORATION_TEMPLATE.gates.filter(g => g.stage === stage.name);
          stageGates.forEach((gate, gateIdx) => {
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

      const { error: taskError } = await supabase.from('tasks').insert(tasksPayload);
      if (taskError) throw taskError;

      // 3. Create Risks
      const risksPayload = EXPLORATION_TEMPLATE.risks.map(risk => ({
          project_id: project.id,
          title: risk.title,
          category: risk.category,
          probability: risk.probability,
          impact: risk.impact,
          risk_score: risk.probability * risk.impact,
          description: risk.description,
          status: 'Open',
          owner: 'Unassigned'
      }));
      const { error: riskError } = await supabase.from('risks').insert(risksPayload);
      if (riskError) throw riskError;

      // 4. Create Deliverables
      const delivPayload = EXPLORATION_TEMPLATE.deliverables.map(del => ({
          project_id: project.id,
          name: del.name,
          status: 'Draft',
          version: 'v0.1',
          app_source: 'Project Setup'
      }));
      const { error: delError } = await supabase.from('pm_deliverables').insert(delivPayload);
      if (delError) throw delError;

      // 5. Create Resources
      const resPayload = EXPLORATION_TEMPLATE.resources.map(res => ({
          project_id: project.id,
          name: `TBD - ${res.discipline}`,
          type: res.type,
          discipline: res.discipline,
          availability_percent: 100,
          status: 'Planned'
      }));
      const { error: resError } = await supabase.from('pm_resources').insert(resPayload);
      if (resError) throw resError;

      toast({ title: "Exploration Project Created", description: "All stages, tasks, and risks have been initialized." });
      onProjectCreated();
      onOpenChange(false);

    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Creation Failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Globe className="w-6 h-6 text-pl-primary-text" aria-hidden="true" />
            New Exploration Project
          </DialogTitle>
          <DialogDescription className="text-pl-muted">
            Step {currentStep} of {steps.length}: {steps[currentStep-1].title}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper Visual */}
        <div className="flex justify-between px-8 my-4">
            {steps.map((step, idx) => (
                <div key={step.id} className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                        currentStep >= step.id ? 'bg-pl-primary border-pl-primary text-pl-primary-fg' : 'border-pl-border-strong text-pl-muted'
                    }`}>
                        <step.icon className="w-4 h-4" />
                    </div>
                    <span className={`text-[10px] mt-1 ${currentStep >= step.id ? 'text-pl-primary-text font-medium' : 'text-pl-muted'}`}>{step.title}</span>
                </div>
            ))}
        </div>
        <Separator />

        <ScrollArea className="flex-1 px-4 py-6">
            {currentStep === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Project Name</Label>
                            <Input name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g. Alpha Prospect Exploration" />
                        </div>
                        <div className="space-y-2">
                            <Label>Project Code</Label>
                            <Input name="code" value={formData.code} onChange={handleInputChange} placeholder="e.g. EXP-2024-001" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Objectives and scope..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Country</Label>
                            <Input name="country" value={formData.country} onChange={handleInputChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Region / Basin</Label>
                            <Input name="region" value={formData.region} onChange={handleInputChange} />
                        </div>
                    </div>
                </div>
            )}

            {currentStep === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Asset / Block</Label>
                            <Input name="asset" value={formData.asset} onChange={handleInputChange} placeholder="Block 12-A" />
                        </div>
                        <div className="space-y-2">
                            <Label>Primary Prospect</Label>
                            <Input name="prospectName" value={formData.prospectName} onChange={handleInputChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Seismic Data Type</Label>
                            <Select name="seismicType" value={formData.seismicType} onValueChange={(val) => handleSelectChange('seismicType', val)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="2D">2D Seismic</SelectItem>
                                    <SelectItem value="3D">3D Seismic</SelectItem>
                                    <SelectItem value="Reprocessing">Reprocessing Only</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Exploration Concept</Label>
                            <Select name="concept" value={formData.concept} onValueChange={(val) => handleSelectChange('concept', val)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Structural Trap">Structural Trap</SelectItem>
                                    <SelectItem value="Stratigraphic Trap">Stratigraphic Trap</SelectItem>
                                    <SelectItem value="Combination">Combination</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Est. Unrisked Reserves (MMboe)</Label>
                        <Input name="estimatedReserves" type="number" value={formData.estimatedReserves} onChange={handleInputChange} />
                    </div>
                </div>
            )}

            {currentStep === 3 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input name="startDate" type="date" value={formData.startDate} onChange={handleInputChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Est. End Date (Auto-calc)</Label>
                            <div className="h-10 px-3 py-2 rounded bg-pl-sunken border border-pl-border text-pl-muted">
                                {format(calculateEndDate(), 'MMM dd, yyyy')}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Estimated Budget (Millions)</Label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-pl-muted" />
                                <Input name="budget" type="number" value={formData.budget} onChange={handleInputChange} className="pl-9" placeholder="15.0" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Currency</Label>
                            <Select name="currency" value={formData.currency} onValueChange={(val) => handleSelectChange('currency', val)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="USD">USD ($)</SelectItem>
                                    <SelectItem value="EUR">EUR (€)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Project Manager</Label>
                        <Input name="manager" value={formData.manager} onChange={handleInputChange} placeholder="Name of lead" />
                    </div>
                </div>
            )}

            {currentStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-pl-sunken p-4 rounded border border-pl-border space-y-3">
                        <h3 className="font-bold text-pl-text border-b border-pl-border pb-2">Summary</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-pl-muted">Project Name:</span> <span className="text-pl-text">{formData.name}</span>
                            <span className="text-pl-muted">Asset / Block:</span> <span className="text-pl-text">{formData.asset}</span>
                            <span className="text-pl-muted">Start Date:</span> <span className="text-pl-text">{formData.startDate}</span>
                            <span className="text-pl-muted">Budget:</span> <span className="text-pl-text">${formData.budget}M</span>
                            <span className="text-pl-muted">Type:</span> <span className="text-pl-text">Exploration (Standard)</span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-pl-text">Included Templates:</h4>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 bg-pl-sunken rounded border border-pl-border text-xs text-pl-text flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true" /> 5 Stages Defined
                            </div>
                            <div className="p-2 bg-pl-sunken rounded border border-pl-border text-xs text-pl-text flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true" /> {EXPLORATION_TEMPLATE.gates.length} Decision Gates
                            </div>
                            <div className="p-2 bg-pl-sunken rounded border border-pl-border text-xs text-pl-text flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true" /> {EXPLORATION_TEMPLATE.tasks.length} Standard Tasks
                            </div>
                            <div className="p-2 bg-pl-sunken rounded border border-pl-border text-xs text-pl-text flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true" /> {EXPLORATION_TEMPLATE.risks.length} Common Risks
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ScrollArea>

        <DialogFooter className="border-t border-pl-border pt-4 mt-auto">
            {currentStep > 1 && (
                <Button variant="outline" onClick={prevStep} disabled={loading}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
            )}
            {currentStep < 4 ? (
                <Button onClick={nextStep}>
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            ) : (
                <Button onClick={handleCreate} disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Create Project
                </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExplorationProjectWizard;