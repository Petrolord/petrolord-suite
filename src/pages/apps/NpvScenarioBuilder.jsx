import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { BarChart3, HelpCircle } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { ThemedApp } from '@/design/ThemeProvider';
import InputPanel from '@/components/npv/InputPanel';
import ResultsPanel from '@/components/npv/ResultsPanel';
import EmptyState from '@/components/npv/EmptyState';
import HelpSystem from '@/components/npv/help/HelpSystem';
import {
  calculateEconomics, runMonteCarlo, generateScenarios, runSensitivityAnalysis, DEFAULT_MC_SEED,
} from '@/utils/npvCalculations';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { FullPrecisionProvider, FullPrecisionToggle } from '@/components/fullprecision/FullPrecision';

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

const NpvScenarioBuilderContent = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [riskRunning, setRiskRunning] = useState(false);
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
            // Define default uncertainties. The run is seeded (EC3-0), so the
            // same inputs always reproduce the same risk cases.
            const uncertainties = { price: 0.2, capex: 0.2, reserves: 0.2 };
            const riskResults = await runMonteCarlo(inputs, { iterations: 1000, uncertainties, seed: DEFAULT_MC_SEED });

            setResults({
                inputs,
                metrics: detResults.metrics,
                cashflow: detResults.cashflow,
                scenarios,
                sensitivity,
                risk: { ...riskResults, uncertainties }
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

  // W3 (D3): with Full precision on, the Risk tab lets the Monte Carlo run at
  // chosen settings on the case last calculated. Same engine, same seed rule.
  const handleRerunRisk = async (settings) => {
    if (!results?.inputs) return;
    setRiskRunning(true);
    try {
      const risk = await runMonteCarlo(results.inputs, settings);
      setResults((prev) => (prev ? { ...prev, risk: { ...risk, uncertainties: settings.uncertainties } } : prev));
    } catch (err) {
      toast({ variant: 'destructive', title: 'Monte Carlo not run', description: err.message });
    } finally {
      setRiskRunning(false);
    }
  };

  return (
    <FullPrecisionProvider>
      <Helmet>
        <title>NPV Scenario Builder - Petrolord Suite</title>
        <meta name="description" content="Advanced economic modeling with Quick and Expert modes." />
      </Helmet>
      
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden">
        <AppHeader
          backTo="/dashboard/economics"
          backLabel="Back to Economics"
          icon={BarChart3}
          title="NPV Scenario Builder"
          subtitle="Scenario and risk-based project valuation"
          actions={(
            <>
              <FullPrecisionToggle app="npv-scenario-builder" />
              <div className="w-full sm:w-56">
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
              <Button variant="outline" size="sm" onClick={() => setIsHelpOpen(true)}>
                <HelpCircle className="w-4 h-4 mr-2" /> Help & Training
              </Button>
            </>
          )}
        />

        {/* Main Content Area */}
        <div className="flex-grow min-h-0 p-4 md:p-6 lg:overflow-hidden">
            <div className="flex flex-col lg:flex-row gap-6 lg:h-full">
                {/* Left Input Panel */}
                <div className="lg:w-1/3 xl:w-[30%] bg-pl-surface border border-pl-border rounded-xl p-4 lg:overflow-hidden flex flex-col shadow-pl-sm">
                    <InputPanel onCalculate={handleCalculate} loading={loading} state={state} setState={setState} />
                </div>

                {/* Right Results Panel */}
                <div className="lg:w-2/3 xl:w-[70%] min-w-0 flex flex-col lg:overflow-hidden">
                    {results ? (
                    <ResultsPanel results={results} onRerunRisk={handleRerunRisk} riskRunning={riskRunning} />
                    ) : (
                    <EmptyState />
                    )}
                </div>
            </div>
        </div>
        
        {/* Help System Modal */}
        <HelpSystem open={isHelpOpen} onOpenChange={setIsHelpOpen} />
      </div>
    </FullPrecisionProvider>
  );
};

// Design system rollout batch 2E (docs/scope/DesignSystem-Rollout.md): the
// page wraps itself in <ThemedApp>, so it opens light and the header toggle
// switches it to dark per user. The cash-flow, sensitivity and risk charts
// keep the white chart standard.
const NpvScenarioBuilder = () => (
  <ThemedApp className="min-h-screen" data-testid="npv-theme-scope">
    <NpvScenarioBuilderContent />
  </ThemedApp>
);

export default NpvScenarioBuilder;