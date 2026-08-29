import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, ArrowLeft, HelpCircle } from 'lucide-react';
import InputPanel from '@/components/npv/InputPanel';
import ResultsPanel from '@/components/npv/ResultsPanel';
import EmptyState from '@/components/npv/EmptyState';
import HelpSystem from '@/components/npv/help/HelpSystem';
import { calculateEconomics, runMonteCarlo, generateScenarios, runSensitivityAnalysis } from '@/utils/npvCalculations';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';

const TABLE = 'saved_npv_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save NPV scenarios.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'e2_economics_persistence');

/** Mode plus both input sets, so switching modes never loses the other one. */
export const defaultState = () => ({ mode: 'Quick', quickData: {}, expertData: {} });

export const stateFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.state && typeof payload.state === 'object' ? payload.state : payload;
  if (!raw.quickData && !raw.expertData) return null;
  return {
    mode: raw.mode === 'Expert' ? 'Expert' : 'Quick',
    quickData: raw.quickData || {},
    expertData: raw.expertData || {},
  };
};

const NpvScenarioBuilder = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [state, setState] = useState(defaultState);
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const serialize = useCallback((name) => ({
    name, schema: 1, state, modified: new Date().toISOString(),
  }), [state]);

  const restore = useCallback((payload) => {
    const restored = stateFromPayload(payload);
    if (!restored) return false;
    setState(restored);
    // Results are a pure function of the inputs, so a reopened scenario waits
    // to be recalculated rather than showing numbers from another case.
    setResults(null);
    return true;
  }, []);

  const persistence = useSavedProjects({
    service,
    serialize,
    restore,
    addNotification,
    describeError,
    watch: state,
    noun: 'Scenario',
  });

  const handleCalculate = async (inputs, mode) => {
    setLoading(true);
    
    // Use timeout to allow UI to render loading state before heavy calculation
    setTimeout(async () => {
        try {
            // 1. Base Case Deterministic Run
            const detResults = calculateEconomics(inputs);
            
            // 2. Generate Scenarios (Low/Base/High)
            const scenarios = generateScenarios(inputs);

            // 3. Sensitivity Analysis (Tornado/Spider)
            const sensitivity = runSensitivityAnalysis(inputs);

            // 4. Probabilistic Risk Analysis (Monte Carlo)
            // Define default uncertainties
            const uncertainties = { price: 0.2, capex: 0.2, reserves: 0.2 };
            const riskResults = await runMonteCarlo(inputs, { iterations: 1000, uncertainties });

            setResults({
                metrics: detResults.metrics,
                cashflow: detResults.cashflow,
                scenarios,
                sensitivity,
                risk: riskResults
            });

            toast({ title: "Calculation Complete", description: "All economic indicators, scenarios, and risk metrics updated." });
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Calculation Error", description: err.message });
        } finally {
            setLoading(false);
        }
    }, 100);
  };

  return (
    <>
      <Helmet>
        <title>NPV Scenario Builder - Petrolord Suite</title>
        <meta name="description" content="Advanced economic modeling with Quick and Expert modes." />
      </Helmet>
      
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="p-4 md:p-6 h-screen flex flex-col overflow-hidden bg-slate-950 text-white">
        {/* Header Section */}
        <div className="flex-shrink-0 mb-4 flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-800 pb-4 gap-4">
            <div>
                <div className="flex items-center space-x-4 mb-2">
                    <Link to="/dashboard/economics">
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    </Link>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="bg-gradient-to-r from-green-500 to-lime-500 p-2 rounded-xl shadow-lg shadow-lime-900/20">
                        <BarChart3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">NPV Scenario Builder</h1>
                        <p className="text-slate-400 text-xs">Scenario and risk-based project valuation</p>
                    </div>
                </div>
            </div>

            <div className="flex items-end gap-3">
                <div className="w-56">
                    <StudioProjectManager
                        label="Saved scenario"
                        projects={persistence.projects}
                        currentProjectId={persistence.currentProjectId}
                        onCreate={persistence.createProject}
                        onOpen={persistence.openProject}
                        onDelete={persistence.deleteProject}
                        confirmDeleteMessage="Delete this scenario and its saved inputs? This cannot be undone."
                    />
                </div>
                <StudioAutoSave
                    isSaving={persistence.isSaving}
                    saveError={persistence.saveError}
                    lastSaveTime={persistence.lastSaveTime}
                    onSave={persistence.manualSave}
                    disabled={!persistence.currentProjectId}
                />
                <Button variant="ghost" size="sm" onClick={() => setIsHelpOpen(true)} className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20">
                    <HelpCircle className="w-5 h-5 mr-2" /> Help & Training
                </Button>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-grow overflow-hidden">
            <div className="flex flex-col lg:flex-row gap-6 h-full">
                {/* Left Input Panel */}
                <div className="lg:w-1/3 xl:w-[30%] bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-hidden flex flex-col shadow-xl">
                    <InputPanel onCalculate={handleCalculate} loading={loading} state={state} setState={setState} />
                </div>

                {/* Right Results Panel */}
                <div className="lg:w-2/3 xl:w-[70%] flex flex-col overflow-hidden">
                    {results ? (
                    <ResultsPanel results={results} />
                    ) : (
                    <EmptyState />
                    )}
                </div>
            </div>
        </div>
        
        {/* Help System Modal */}
        <HelpSystem open={isHelpOpen} onOpenChange={setIsHelpOpen} />
      </div>
    </>
  );
};

export default NpvScenarioBuilder;