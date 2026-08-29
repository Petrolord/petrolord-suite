import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Scale, ArrowLeft, Save, FolderOpen, Download } from 'lucide-react';
import InputPanel from '@/components/fiscaldesigner/InputPanel';
import ResultsPanel from '@/components/fiscaldesigner/ResultsPanel';
import EmptyState from '@/components/fiscaldesigner/EmptyState';
import { runFiscalComparison } from '@/utils/fiscalDesignerCalculations';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LoadProjectDialog from '@/components/fiscaldesigner/LoadProjectDialog';
import FiscalDesignerHelpGuide from '@/components/fiscaldesigner/FiscalDesignerHelpGuide';

const FiscalRegimeDesigner = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [projectInputs, setProjectInputs] = useState({
    name: 'Deepwater Block XYZ Development',
    production: { oil: { initial: 10000, decline: 10 }, gas: { initial: 50, decline: 8 }, ngl: { initial: 1500, decline: 12 } },
    costs: { capex: { drilling: 300, facilities: 150, subsea: 50 }, opex: { fixed: 10, variable: 5 } },
    prices: [ { year: 1, oil: 70, gas: 3.5, ngl: 30 }, { year: 5, oil: 75, gas: 4.0, ngl: 35 }, { year: 10, oil: 80, gas: 4.5, ngl: 40 } ],
    discountRate: 10,
  });
  const [regimes, setRegimes] = useState([
    { id: 1, name: 'Nigerian PIA (PSC)', royalty: { type: 'sliding_price', tiers: [{ threshold: 60, rate: 12.5 }, { threshold: 80, rate: 15 }] }, tax: { cit: 30, rrt: 20, minTax: 2 }, costRecoveryLimit: 70, profitSplit: { type: 'tiered_r_factor', tiers: [{ threshold: 1.0, split: 60 }, { threshold: 1.5, split: 50 }] } },
    { id: 2, name: 'Concessionary (Royalty/Tax)', royalty: { type: 'flat', rate: 12.5 }, tax: { cit: 50, rrt: 0, minTax: 0 }, costRecoveryLimit: 100, profitSplit: { type: 'flat', split: 100 } },
  ]);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState(projectInputs.name);

  const handleRunComparison = async (inputs) => {
    setLoading(true);
    setResults(null);
    setProjectInputs(inputs.projectInputs);
    setRegimes(inputs.regimes);
    toast({
      title: "Running Fiscal Comparison... 📊",
      description: `Comparing ${inputs.regimes.length} fiscal regimes. This may take a moment.`,
    });

    try {
      const comparisonResults = await runFiscalComparison(inputs);
      setResults(comparisonResults);
      toast({
        title: "Comparison Complete! ✅",
        description: `Successfully analyzed the fiscal regimes.`,
      });
    } catch (error) {
      console.error("Fiscal Comparison Error:", error);
      toast({
        title: "Comparison Failed",
        description: "An error occurred during the fiscal simulation.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!regimes || regimes.length === 0) {
      toast({ title: "No Regimes to Export", description: "Please define at least one fiscal regime.", variant: "destructive" });
      return;
    }
    const exportData = {
      exportDate: new Date().toISOString(),
      regimeCount: regimes.length,
      regimes: regimes.map(({ id, ...rest }) => rest), // Exclude internal ID from export
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `${projectInputs.name.replace(/\s+/g, '_')}_regimes.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    toast({ title: "Export Successful!", description: "Your regime file has been downloaded." });
  };

  const handleSaveProject = async () => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to save a project.", variant: "destructive" });
      return;
    }
    if (!newProjectName) {
        toast({ title: "Project Name Required", description: "Please enter a name for your project.", variant: "destructive" });
        return;
    }

    const { error } = await supabase.from('fiscal_regime_projects').insert({
      user_id: user.id,
      project_name: newProjectName,
      project_inputs: projectInputs,
      regimes_data: regimes,
    });

    if (error) {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Project Saved!", description: `"${newProjectName}" has been saved successfully.` });
      setIsSaveDialogOpen(false);
    }
  };

  const handleLoadProject = (project) => {
    setProjectInputs(project.project_inputs);
    setRegimes(project.regimes_data);
    setResults(null); // Clear previous results
    setIsLoadDialogOpen(false);
    toast({ title: "Project Loaded", description: `Successfully loaded "${project.project_name}".` });
  };

  return (
    <>
      <Helmet>
        <title>Fiscal Regime Designer - Petrolord Suite</title>
        <meta name="description" content="Build, compare, and stress-test petroleum fiscal terms with advanced analytics." />
      </Helmet>
      <div className="p-4 md:p-8 h-full flex flex-col">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
                <Link to="/dashboard/economics">
                <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                </Link>
                <div className="flex items-center space-x-3">
                    <div className="bg-gradient-to-r from-pink-500 to-fuchsia-500 p-3 rounded-xl">
                        <Scale className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-4xl font-bold text-white">Fiscal Regime Designer</h1>
                        <p className="text-lime-200 text-md md:text-lg">Build & Compare Petroleum Fiscal Terms</p>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <FiscalDesignerHelpGuide />
                <Button onClick={() => setIsLoadDialogOpen(true)} variant="outline" className="text-lime-300 border-lime-400/50 hover:bg-lime-500/20">
                    <FolderOpen className="w-4 h-4 mr-2" /> Load
                </Button>
                <Button onClick={() => { setNewProjectName(projectInputs.name); setIsSaveDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700">
                    <Save className="w-4 h-4 mr-2" /> Save
                </Button>
                <Button onClick={handleExport} disabled={!results} className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
                    <Download className="w-4 h-4 mr-2" /> Export Regime File
                </Button>
            </div>
          </div>
        </motion.div>
        <div className="flex-grow flex flex-col lg:flex-row gap-8">
          <div className="lg:w-2/5 flex-shrink-0">
            <InputPanel onRunComparison={handleRunComparison} loading={loading} initialProjectInputs={projectInputs} initialRegimes={regimes} />
          </div>
          <div className="lg:w-3/5 flex-grow">
            {loading ? (
              <div className="flex items-center justify-center h-full bg-white/5 rounded-xl border border-white/10 p-6">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lime-400 mx-auto"></div>
                  <p className="text-white mt-4 text-lg">Comparing Regimes...</p>
                  <p className="text-lime-300">Please wait, running complex calculations.</p>
                </div>
              </div>
            ) : results ? (
              <ResultsPanel results={results} />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl text-lime-300">Save Project</DialogTitle>
            <DialogDescription className="text-gray-400">Enter a name for your project to save it for later use.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="project-name" className="text-lime-300">Project Name</Label>
            <Input id="project-name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="bg-white/10 border-white/20 mt-2" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProject} className="bg-blue-600 hover:bg-blue-700">Save Project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoadProjectDialog 
        isOpen={isLoadDialogOpen}
        onOpenChange={setIsLoadDialogOpen}
        onLoadProject={handleLoadProject}
      />
    </>
  );
};

export default FiscalRegimeDesigner;