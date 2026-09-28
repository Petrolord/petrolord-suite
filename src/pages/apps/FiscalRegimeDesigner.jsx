import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Scale, Save, FolderOpen, Download } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { ThemedApp } from '@/design/ThemeProvider';
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
import { FullPrecisionProvider, FullPrecisionToggle } from '@/components/fullprecision/FullPrecision';

const FiscalRegimeDesignerContent = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [projectInputs, setProjectInputs] = useState({
    name: 'Deepwater Block XYZ Development',
    production: { oil: { initial: 10000, decline: 10 }, gas: { initial: 50000, decline: 8 }, ngl: { initial: 1500, decline: 12 } }, // gas in Mcf/d (50 MMscf/d)
    costs: { capex: { drilling: 300, facilities: 150, subsea: 50 }, opex: { fixed: 10, variable: 5 } },
    prices: [ { year: 1, oil: 70, gas: 3.5, ngl: 30 }, { year: 5, oil: 75, gas: 4.0, ngl: 35 }, { year: 10, oil: 80, gas: 4.5, ngl: 40 } ],
    discountRate: 10,
  });
  const [regimes, setRegimes] = useState([
    // a generic sample (Fiscal T1-001): these are not the PIA 2021 terms, which
    // come from Load Template (PIA 2021 royalty and cumulative-production split)
    { id: 1, name: 'Sample PSC (R-factor split)', royalty: { type: 'sliding_price', tiers: [{ threshold: 60, rate: 12.5 }, { threshold: 80, rate: 15 }] }, tax: { cit: 30, rrt: 20, minTax: 2 }, costRecoveryLimit: 70, profitSplit: { type: 'tiered_r_factor', tiers: [{ threshold: 1.0, split: 60 }, { threshold: 1.5, split: 50 }] } },
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
      // EC2-8: the engine refuses a tier table with a repeated threshold with
      // a RangeError naming the regime and the table; say that, not a
      // generic failure.
      toast({
        title: "Comparison Failed",
        description: error instanceof RangeError ? error.message : "An error occurred during the fiscal simulation.",
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
    <FullPrecisionProvider>
      <Helmet>
        <title>Fiscal Regime Designer - Petrolord Suite</title>
        <meta name="description" content="Build, compare, and stress-test petroleum fiscal terms with advanced analytics." />
      </Helmet>
      <AppHeader
        backTo="/dashboard/economics"
        backLabel="Back to Economics"
        icon={Scale}
        title="Fiscal Regime Designer"
        subtitle="Build & Compare Petroleum Fiscal Terms"
        actions={(
          <>
            <FullPrecisionToggle app="fiscal-regime-designer" />
            <FiscalDesignerHelpGuide />
          </>
        )}
      />
      <div className="p-4 md:p-8 h-full flex flex-col">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Button onClick={() => setIsLoadDialogOpen(true)} variant="outline">
            <FolderOpen className="w-4 h-4 mr-2" /> Load
          </Button>
          <Button onClick={() => { setNewProjectName(projectInputs.name); setIsSaveDialogOpen(true); }}>
            <Save className="w-4 h-4 mr-2" /> Save
          </Button>
          <Button onClick={handleExport} disabled={!results} variant="outline">
            <Download className="w-4 h-4 mr-2" /> Export Regime File
          </Button>
        </div>
        <div className="flex-grow flex flex-col lg:flex-row gap-8">
          <div className="lg:w-2/5 flex-shrink-0">
            <InputPanel onRunComparison={handleRunComparison} loading={loading} initialProjectInputs={projectInputs} initialRegimes={regimes} />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center justify-center h-full bg-pl-surface rounded-xl border border-pl-border p-6 shadow-pl-sm">
                <div className="text-center" role="status">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pl-primary mx-auto"></div>
                  <p className="text-pl-text mt-4 text-lg">Comparing Regimes...</p>
                  <p className="text-pl-muted">Please wait, running complex calculations.</p>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl">Save Project</DialogTitle>
            <DialogDescription>Enter a name for your project to save it for later use.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="project-name">Project Name</Label>
            <Input id="project-name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="mt-2" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProject}>Save Project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoadProjectDialog 
        isOpen={isLoadDialogOpen}
        onOpenChange={setIsLoadDialogOpen}
        onLoadProject={handleLoadProject}
      />
    </FullPrecisionProvider>
  );
};

// Design system rollout batch 2E (docs/scope/DesignSystem-Rollout.md): the
// page wraps itself in <ThemedApp>, so it opens light and the header toggle
// switches it to dark per user. The comparison charts keep the white chart
// standard.
const FiscalRegimeDesigner = () => (
  <ThemedApp className="min-h-screen" data-testid="fiscal-theme-scope">
    <FiscalRegimeDesignerContent />
  </ThemedApp>
);

export default FiscalRegimeDesigner;