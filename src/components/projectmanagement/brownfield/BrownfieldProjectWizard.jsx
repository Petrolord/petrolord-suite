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
import { BROWNFIELD_TEMPLATE } from '@/data/brownfieldTemplate';
import { Loader2, CheckCircle, ArrowRight, ArrowLeft, Wrench, TrendingUp, DollarSign, Calendar, Settings } from 'lucide-react';
import { addWeeks } from 'date-fns';

const steps = [
  { id: 1, title: 'Asset & Scope', icon: Wrench },
  { id: 2, title: 'Optimization', icon: TrendingUp },
  { id: 3, title: 'Plan & Budget', icon: Calendar },
  { id: 4, title: 'Review', icon: CheckCircle }
];

const BrownfieldProjectWizard = ({ open, onOpenChange, onProjectCreated, userId }) => {
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
    existingInfrastructure: 'Offshore Platform',
    estimatedReserves: '',
    productionIncreaseTarget: '',
    wellCount: '0',
    facilityUpgrades: 'Debottlenecking',
    developmentStrategy: 'Tie-back',
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
    const totalWeeks = BROWNFIELD_TEMPLATE.stages.reduce((acc, stage) => acc + stage.duration_weeks, 0);
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
          company_name: 'Brownfield Solutions', 
          project_type: 'Brownfield Development',
          stage: 'Opportunity Identification',
          country: formData.country,
          asset: formData.asset,
          status: 'Green',
          percent_complete: 0
        })
        .select()
        .single();

      if (projError) throw projError;

      // 2. Create Tasks & Stages & Gates
      let currentOffset = 0;
      const tasksPayload = [];
      
      BROWNFIELD_TEMPLATE.stages.forEach((stage, stageIdx) => {
          const stageStart = addWeeks(new Date(formData.startDate), currentOffset);
          const stageEnd = addWeeks(stageStart, stage.duration_weeks);
          
          // Tasks
          const stageTasks = BROWNFIELD_TEMPLATE.tasks.filter(t => t.stage === stage.name);
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
          const stageGates = BROWNFIELD_TEMPLATE.gates.filter(g => g.stage === stage.name);
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
      const risksPayload = BROWNFIELD_TEMPLATE.risks.map(risk => ({
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
      const delivPayload = BROWNFIELD_TEMPLATE.deliverables.map(del => ({
          project_id: project.id,
          name: del.name,
          status: 'Draft',
          version: 'v0.1',
          app_source: 'Project Setup'
      }));
      const { error: delError } = await supabase.from('pm_deliverables').insert(delivPayload);
      if (delError) throw delError;

      // 5. Create Resources
      const resPayload = BROWNFIELD_TEMPLATE.resources.map(res => ({
          project_id: project.id,
          name: `TBD - ${res.discipline}`,
          type: res.type,
          discipline: res.discipline,
          availability_percent: 100,
          status: 'Planned'
      }));
      const { error: resError } = await supabase.from('pm_resources').insert(resPayload);
      if (resError) throw resError;

      toast({ title: "Project Created", description: "Brownfield project initialized." });
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
      {/* Interim (rollout 6C): a dark island until this file moves to theme roles; remove data-pl-theme then. */}
      <DialogContent data-pl-theme="dark" className="bg-slate-900 border-slate-700 text-white sm:max-w-[750px] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Settings className="w-6 h-6 text-orange-400" />
            New Brownfield Project
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Step {currentStep} of {steps.length}: {steps[currentStep-1].title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-between px-12 my-4">
            {steps.map((step) => (
                <div key={step.id} className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        currentStep >= step.id ? 'bg-orange-600 border-orange-600 text-white' : 'border-slate-600 text-slate-500'
                    }`}>
                        <step.icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs mt-2 ${currentStep >= step.id ? 'text-orange-400' : 'text-slate-600'}`}>{step.title}</span>
                </div>
            ))}
        </div>
        <Separator className="bg-slate-800" />

        <ScrollArea className="flex-1 px-4 py-6">
            {currentStep === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Project Name</Label>
                            <Input name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g. Platform B Revamp" className="bg-slate-800 border-slate-700" />
                        </div>
                        <div className="space-y-2">
                            <Label>Project Code</Label>
                            <Input name="code" value={formData.code} onChange={handleInputChange} placeholder="e.g. BRN-2024-01" className="bg-slate-800 border-slate-700" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Scope description..." className="bg-slate-800 border-slate-700" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Existing Infrastructure</Label>
                            <Select name="existingInfrastructure" value={formData.existingInfrastructure} onValueChange={(val) => handleSelectChange('existingInfrastructure', val)}>
                                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                                    <SelectItem value="Offshore Platform">Offshore Platform</SelectItem>
                                    <SelectItem value="Onshore Plant">Onshore Plant</SelectItem>
                                    <SelectItem value="FPSO">FPSO</SelectItem>
                                    <SelectItem value="Pipeline">Pipeline Network</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Asset / Field</Label>
                            <Input name="asset" value={formData.asset} onChange={handleInputChange} className="bg-slate-800 border-slate-700" />
                        </div>
                    </div>
                </div>
            )}

            {currentStep === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Facility Upgrade Type</Label>
                            <Select name="facilityUpgrades" value={formData.facilityUpgrades} onValueChange={(val) => handleSelectChange('facilityUpgrades', val)}>
                                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                                    <SelectItem value="Debottlenecking">Debottlenecking</SelectItem>
                                    <SelectItem value="Compression Upgrade">Compression Upgrade</SelectItem>
                                    <SelectItem value="Water Injection">Water Injection</SelectItem>
                                    <SelectItem value="Electrification">Electrification</SelectItem>
                                    <SelectItem value="Life Extension">Life Extension</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Production Increase Target</Label>
                            <Input name="productionIncreaseTarget" value={formData.productionIncreaseTarget} onChange={handleInputChange} placeholder="e.g. +5000 bopd" className="bg-slate-800 border-slate-700" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>New Wells (Infill)</Label>
                            <Input name="wellCount" type="number" value={formData.wellCount} onChange={handleInputChange} className="bg-slate-800 border-slate-700" />
                        </div>
                        <div className="space-y-2">
                            <Label>Incremental Reserves (MMboe)</Label>
                            <Input name="estimatedReserves" type="number" value={formData.estimatedReserves} onChange={handleInputChange} className="bg-slate-800 border-slate-700" />
                        </div>
                    </div>
                </div>
            )}

            {currentStep === 3 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input name="startDate" type="date" value={formData.startDate} onChange={handleInputChange} className="bg-slate-800 border-slate-700" />
                        </div>
                        <div className="space-y-2">
                            <Label>Estimated Budget (Millions)</Label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                                <Input name="budget" type="number" value={formData.budget} onChange={handleInputChange} className="pl-9 bg-slate-800 border-slate-700" />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Project Manager</Label>
                        <Input name="manager" value={formData.manager} onChange={handleInputChange} className="bg-slate-800 border-slate-700" />
                    </div>
                    <div className="p-4 bg-slate-800/50 rounded border border-slate-700 mt-4">
                        <h4 className="text-sm font-bold text-slate-300 mb-2">Auto-Calculated Timeline</h4>
                        <div className="flex justify-between text-xs text-slate-400">
                            <span>Opp. ID (4w)</span>
                            <span>Design (12w)</span>
                            <span>Execution (20w)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-700 rounded-full mt-1 overflow-hidden flex">
                            <div className="h-full bg-blue-500 w-[10%]"></div>
                            <div className="h-full bg-yellow-500 w-[30%]"></div>
                            <div className="h-full bg-green-500 w-[40%]"></div>
                            <div className="h-full bg-purple-500 w-[20%]"></div>
                        </div>
                    </div>
                </div>
            )}

            {currentStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-slate-800/50 p-4 rounded border border-slate-700 space-y-3">
                        <h3 className="font-bold text-white border-b border-slate-700 pb-2">Project Summary</h3>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                            <div className="flex flex-col"><span className="text-slate-500 text-xs">Project Name</span><span className="text-white">{formData.name}</span></div>
                            <div className="flex flex-col"><span className="text-slate-500 text-xs">Asset</span><span className="text-white">{formData.asset}</span></div>
                            <div className="flex flex-col"><span className="text-slate-500 text-xs">Upgrade</span><span className="text-white">{formData.facilityUpgrades}</span></div>
                            <div className="flex flex-col"><span className="text-slate-500 text-xs">Budget</span><span className="text-white font-mono">${formData.budget}M</span></div>
                            <div className="flex flex-col"><span className="text-slate-500 text-xs">Target Uplift</span><span className="text-white">{formData.productionIncreaseTarget}</span></div>
                            <div className="flex flex-col"><span className="text-slate-500 text-xs">Duration</span><span className="text-white">~{(BROWNFIELD_TEMPLATE.stages.reduce((a,b)=>a+b.duration_weeks,0)/4).toFixed(1)} months</span></div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                        <div className="p-2 bg-slate-800 rounded border border-slate-700 flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-orange-400" /> {BROWNFIELD_TEMPLATE.stages.length} Stages
                        </div>
                        <div className="p-2 bg-slate-800 rounded border border-slate-700 flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-orange-400" /> {BROWNFIELD_TEMPLATE.gates.length} Decision Gates
                        </div>
                        <div className="p-2 bg-slate-800 rounded border border-slate-700 flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-orange-400" /> {BROWNFIELD_TEMPLATE.tasks.length} Tasks Pre-loaded
                        </div>
                        <div className="p-2 bg-slate-800 rounded border border-slate-700 flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-orange-400" /> {BROWNFIELD_TEMPLATE.risks.length} Risks Initialized
                        </div>
                    </div>
                </div>
            )}
        </ScrollArea>

        <DialogFooter className="border-t border-slate-800 pt-4 mt-auto">
            {currentStep > 1 && (
                <Button variant="outline" onClick={prevStep} disabled={loading} className="border-slate-600 text-slate-300">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
            )}
            {currentStep < 4 ? (
                <Button onClick={nextStep} className="bg-orange-600 hover:bg-orange-700 text-white">
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            ) : (
                <Button onClick={handleCreate} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Create Project
                </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BrownfieldProjectWizard;