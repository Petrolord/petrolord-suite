import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CollapsibleSection from './CollapsibleSection';
import { Settings, Beaker, Shield, Play, FolderOpen, Save } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import LoadProjectDialog from './LoadProjectDialog';

const defaultInputs = {
    projectName: "Gas Condensate Pipeline Integrity",
    pipelineLength: 10000,
    inletPressure: 2000,
    inletTemperature: 150,
    outletPressure: 1000,
    ambientTemperature: 40,
    apiGravity: 45,
    gor: 2500,
    waterCut: 10,
    co2: 2.5,
    h2s: 0.1,
};

const InputPanel = ({ onAnalyze, loading, onProjectLoad, initialInputs }) => {
  const [inputs, setInputs] = useState(initialInputs || defaultInputs);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState(inputs.projectName);
  const { toast } = useToast();

  useEffect(() => {
    if(initialInputs) {
        setInputs(initialInputs);
        setProjectName(initialInputs.projectName);
    }
  }, [initialInputs]);

  const handleInputChange = (field, value) => {
    const newInputs = { ...inputs, [field]: value };
    setInputs(newInputs);
    if (field === 'projectName') {
        setProjectName(value);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAnalyze(inputs);
  };

  const handleSaveProject = async () => {
      if (!projectName) {
          toast({ variant: 'destructive', title: 'Error', description: 'Project name is required.' });
          return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
          toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to save.' });
          return;
      }

      try {
          // Task 3: Implement explicit Select -> Update/Insert to avoid any ON CONFLICT issues entirely
          const { data: existingProject, error: fetchError } = await supabase
              .from('flow_assurance_projects')
              .select('id')
              .eq('user_id', user.id)
              .eq('project_name', projectName)
              .maybeSingle();

          if (fetchError) throw fetchError;

          const projectData = {
              user_id: user.id,
              project_name: projectName,
              inputs_data: { ...inputs, projectName },
              updated_at: new Date().toISOString()
          };
          
          if (existingProject) {
              // Update existing
              const { error: updateError } = await supabase
                  .from('flow_assurance_projects')
                  .update(projectData)
                  .eq('id', existingProject.id);
                  
              if (updateError) throw updateError;
          } else {
              // Insert new
              const { error: insertError } = await supabase
                  .from('flow_assurance_projects')
                  .insert({
                      ...projectData,
                      results_data: null // Init with empty results
                  });
                  
              if (insertError) throw insertError;
          }

          toast({ title: 'Project Saved', description: `"${projectName}" has been saved successfully.` });
          setIsSaveDialogOpen(false);
      } catch (error) {
          console.error('Save error:', error);
          toast({ variant: 'destructive', title: 'Save Error', description: error.message || 'An unexpected error occurred while saving.' });
      }
  };

  return (
    <>
        <form onSubmit={handleSubmit} className="space-y-6 h-full flex flex-col">
          <div className="flex-grow space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Flow Assurance Setup</h2>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" size="icon" onClick={() => setIsLoadDialogOpen(true)} className="border-slate-700 hover:bg-slate-800 text-white"><FolderOpen className="h-4 w-4"/></Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => setIsSaveDialogOpen(true)} className="border-slate-700 hover:bg-slate-800 text-white"><Save className="h-4 w-4"/></Button>
                </div>
            </div>

            <CollapsibleSection title="Project & System Configuration" icon={<Settings />} defaultOpen>
              <div className="space-y-4">
                <div><Label className="text-lime-300">Project Name</Label><Input value={inputs.projectName} onChange={(e) => handleInputChange('projectName', e.target.value)} className="bg-slate-800 border-slate-700 text-white" /></div>
                <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-lime-300">Length (ft)</Label><Input type="number" value={inputs.pipelineLength} onChange={(e) => handleInputChange('pipelineLength', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
                    <div><Label className="text-lime-300">Inlet P (psi)</Label><Input type="number" value={inputs.inletPressure} onChange={(e) => handleInputChange('inletPressure', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
                    <div><Label className="text-lime-300">Inlet T (°F)</Label><Input type="number" value={inputs.inletTemperature} onChange={(e) => handleInputChange('inletTemperature', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
                    <div><Label className="text-lime-300">Ambient T (°F)</Label><Input type="number" value={inputs.ambientTemperature} onChange={(e) => handleInputChange('ambientTemperature', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Fluid Characterization" icon={<Beaker />} defaultOpen>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-lime-300">API Gravity</Label><Input type="number" value={inputs.apiGravity} onChange={(e) => handleInputChange('apiGravity', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
                <div><Label className="text-lime-300">GOR (scf/STB)</Label><Input type="number" value={inputs.gor} onChange={(e) => handleInputChange('gor', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
                <div><Label className="text-lime-300">Water Cut (%)</Label><Input type="number" value={inputs.waterCut} onChange={(e) => handleInputChange('waterCut', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
                <div><Label className="text-lime-300">CO₂ (mol%)</Label><Input type="number" value={inputs.co2} onChange={(e) => handleInputChange('co2', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
                <div><Label className="text-lime-300">H₂S (ppm)</Label><Input type="number" value={inputs.h2s} onChange={(e) => handleInputChange('h2s', Number(e.target.value))} className="bg-slate-800 border-slate-700 text-white" /></div>
              </div>
            </CollapsibleSection>

             <CollapsibleSection title="Risk Model Settings" icon={<Shield />}>
                <div className="space-y-4">
                     <div>
                        <Label className="text-lime-300">Hydrate Risk Model</Label>
                        <select className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"><option>CSM-Hyd</option><option>Katz</option></select>
                    </div>
                    <div>
                        <Label className="text-lime-300">Corrosion Risk Model</Label>
                        <select className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"><option>Norsok M-506</option><option>De Waard-Milliams</option></select>
                    </div>
                </div>
            </CollapsibleSection>
          </div>

          <div className="pt-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 text-white font-semibold py-3 text-lg">
                {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div> : <Play className="w-5 h-5 mr-2" />}
                Predict & Monitor
              </Button>
            </motion.div>
          </div>
        </form>
        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
            <DialogContent className="bg-slate-900 border-slate-700 text-white">
                <DialogHeader><DialogTitle>Save Project</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <Label htmlFor="projectName" className="text-lime-300">Project Name</Label>
                    <Input id="projectName" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
                </div>
                <DialogFooter>
                    <Button variant="outline" className="border-slate-700 hover:bg-slate-800 text-white" onClick={() => setIsSaveDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveProject} className="bg-lime-600 hover:bg-lime-500 text-white">Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        <LoadProjectDialog isOpen={isLoadDialogOpen} onClose={() => setIsLoadDialogOpen(false)} onProjectLoad={onProjectLoad} />
    </>
  );
};

export default InputPanel;