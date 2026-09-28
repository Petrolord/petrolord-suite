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
import { FIELD_DEVELOPMENT_TEMPLATE } from '@/data/fieldDevelopmentTemplate';
import { Loader2, CheckCircle, ArrowRight, ArrowLeft, Factory, Layers, DollarSign, Calendar, Activity, Shovel as Pickaxe } from 'lucide-react';
import { addWeeks, format } from 'date-fns';

const steps = [
  { id: 1, title: 'Basics', icon: Factory },
  { id: 2, title: 'Technical Scope', icon: Pickaxe },
  { id: 3, title: 'Plan & Budget', icon: Calendar },
  { id: 4, title: 'Review', icon: CheckCircle }
];

const FieldDevelopmentProjectWizard = ({ open, onOpenChange, onProjectCreated, userId }) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    asset: '',
    country: '',
    region: '',
    fieldName: '',
    developmentConcept: 'Fixed Platform',
    waterDepth: '',
    estimatedReserves: '',
    productionTarget: '',
    wellCount: '10',
    facilityType: 'Processing Platform',
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
    const totalWeeks = FIELD_DEVELOPMENT_TEMPLATE.stages.reduce((acc, stage) => acc + stage.duration_weeks, 0);
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
          baseline_budget: parseFloat(formData.budget) * 1000000, 
          company_name: 'Field Dev Ops', 
          project_type: 'Field Development',
          stage: 'Concept',
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
      
      FIELD_DEVELOPMENT_TEMPLATE.stages.forEach((stage, stageIdx) => {
          const stageStart = addWeeks(new Date(formData.startDate), currentOffset);
          const stageEnd = addWeeks(stageStart, stage.duration_weeks);
          
          // Tasks
          const stageTasks = FIELD_DEVELOPMENT_TEMPLATE.tasks.filter(t => t.stage === stage.name);
          stageTasks.forEach((task, taskIdx) => {
              tasksPayload.push({
                  project_id: project.id,
                  name: task.name,
                  type: task.type,
                  status: 'To Do',
                  workstream: task.workstream,
                  task_category: stage.name,
                  planned_start_date: stageStart.toISOString(),
                  planned_end_date: stageEnd.toISOString(),
                  display_order: (stageIdx * 100) + taskIdx
              });
          });

          // Gates
          const stageGates = FIELD_DEVELOPMENT_TEMPLATE.gates.filter(g => g.stage === stage.name);
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
      const risksPayload = FIELD_DEVELOPMENT_TEMPLATE.risks.map(risk => ({
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
      const delivPayload = FIELD_DEVELOPMENT_TEMPLATE.deliverables.map(del => ({
          project_id: project.id,
          name: del.name,
          status: 'Draft',
          version: 'v0.1',
          app_source: 'Project Setup'
      }));
      const { error: delError } = await supabase.from('pm_deliverables').insert(delivPayload);
      if (delError) throw delError;

      // 5. Create Resources
      const resPayload = FIELD_DEVELOPMENT_TEMPLATE.resources.map(res => ({
          project_id: project.id,
          name: `TBD - ${res.discipline}`,
          type: res.type,
          discipline: res.discipline,
          availability_percent: 100,
          status: 'Planned'
      }));
      const { error: resError } = await supabase.from('pm_resources').insert(resPayload);
      if (resError) throw resError;

      toast({ title: "Project Created", description: "Field Development project initialized." });
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
      <DialogContent className="sm:max-w-[750px] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Factory className="w-6 h-6 text-pl-primary-text" aria-hidden="true" />
            New Field Development Project
          </DialogTitle>
          <DialogDescription className="text-pl-muted">
            Step {currentStep} of {steps.length}: {steps[currentStep-1].title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-between px-12 my-4">
            {steps.map((step) => (
                <div key={step.id} className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        currentStep >= step.id ? 'bg-pl-primary border-pl-primary text-pl-primary-fg' : 'border-pl-border-strong text-pl-muted'
                    }`}>
                        <step.icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs mt-2 ${currentStep >= step.id ? 'text-pl-primary-text font-medium' : 'text-pl-muted'}`}>{step.title}</span>
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
                            <Input name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g. Delta Field Expansion" />
                        </div>
                        <div className="space-y-2">
                            <Label>Project Code</Label>
                            <Input name="code" value={formData.code} onChange={handleInputChange} placeholder="e.g. FDP-2024-05" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Scope description..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Country</Label>
                            <Input name="country" value={formData.country} onChange={handleInputChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Asset</Label>
                            <Input name="asset" value={formData.asset} onChange={handleInputChange} />
                        </div>
                    </div>
                </div>
            )}

            {currentStep === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Field Name</Label>
                            <Input name="fieldName" value={formData.fieldName} onChange={handleInputChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Water Depth (m)</Label>
                            <Input name="waterDepth" type="number" value={formData.waterDepth} onChange={handleInputChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Development Concept</Label>
                            <Select name="developmentConcept" value={formData.developmentConcept} onValueChange={(val) => handleSelectChange('developmentConcept', val)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Fixed Platform">Fixed Platform</SelectItem>
                                    <SelectItem value="FPSO">FPSO</SelectItem>
                                    <SelectItem value="Subsea Tie-back">Subsea Tie-back</SelectItem>
                                    <SelectItem value="Onshore Facility">Onshore Facility</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Production Target (bopd/mmscfd)</Label>
                            <Input name="productionTarget" value={formData.productionTarget} onChange={handleInputChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Development Wells</Label>
                            <Input name="wellCount" type="number" value={formData.wellCount} onChange={handleInputChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Est. Reserves (MMboe)</Label>
                            <Input name="estimatedReserves" type="number" value={formData.estimatedReserves} onChange={handleInputChange} />
                        </div>
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
                            <Label>Estimated Budget (Millions)</Label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-pl-muted" />
                                <Input name="budget" type="number" value={formData.budget} onChange={handleInputChange} className="pl-9" />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Project Manager</Label>
                        <Input name="manager" value={formData.manager} onChange={handleInputChange} />
                    </div>
                    <div className="p-4 bg-pl-sunken rounded border border-pl-border mt-4">
                        <h4 className="text-sm font-bold text-pl-text mb-2">Auto-Calculated Timeline</h4>
                        <div className="flex justify-between text-xs text-pl-muted">
                            <span>Concept (8w)</span>
                            <span>FEED (16w)</span>
                            <span>Execute (48w)</span>
                        </div>
                        <div className="w-full h-2 bg-pl-border rounded-full mt-1 overflow-hidden flex">
                            <div className="h-full bg-pl-primary w-[10%] border-r border-pl-surface"></div>
                            <div className="h-full bg-pl-primary/75 w-[20%] border-r border-pl-surface"></div>
                            <div className="h-full bg-pl-primary/50 w-[50%] border-r border-pl-surface"></div>
                            <div className="h-full bg-pl-primary/30 w-[20%]"></div>
                        </div>
                    </div>
                </div>
            )}

            {currentStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-pl-sunken p-4 rounded border border-pl-border space-y-3">
                        <h3 className="font-bold text-pl-text border-b border-pl-border pb-2">Project Summary</h3>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                            <div className="flex flex-col"><span className="text-pl-muted text-xs">Project Name</span><span className="text-pl-text">{formData.name}</span></div>
                            <div className="flex flex-col"><span className="text-pl-muted text-xs">Asset</span><span className="text-pl-text">{formData.asset}</span></div>
                            <div className="flex flex-col"><span className="text-pl-muted text-xs">Concept</span><span className="text-pl-text">{formData.developmentConcept}</span></div>
                            <div className="flex flex-col"><span className="text-pl-muted text-xs">Budget</span><span className="text-pl-text font-mono">${formData.budget}M</span></div>
                            <div className="flex flex-col"><span className="text-pl-muted text-xs">Wells</span><span className="text-pl-text">{formData.wellCount}</span></div>
                            <div className="flex flex-col"><span className="text-pl-muted text-xs">Duration</span><span className="text-pl-text">~{(FIELD_DEVELOPMENT_TEMPLATE.stages.reduce((a,b)=>a+b.duration_weeks,0)/4).toFixed(1)} months</span></div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-pl-text">
                        <div className="p-2 bg-pl-sunken rounded border border-pl-border flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true" /> {FIELD_DEVELOPMENT_TEMPLATE.stages.length} Phases
                        </div>
                        <div className="p-2 bg-pl-sunken rounded border border-pl-border flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true" /> {FIELD_DEVELOPMENT_TEMPLATE.gates.length} Decision Gates
                        </div>
                        <div className="p-2 bg-pl-sunken rounded border border-pl-border flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true" /> {FIELD_DEVELOPMENT_TEMPLATE.tasks.length} Tasks Pre-loaded
                        </div>
                        <div className="p-2 bg-pl-sunken rounded border border-pl-border flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true" /> {FIELD_DEVELOPMENT_TEMPLATE.risks.length} Risks Initialized
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

export default FieldDevelopmentProjectWizard;