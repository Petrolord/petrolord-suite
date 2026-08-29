import React, { useState, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { generateBreakevenData, DEFAULT_SEED } from '@/utils/breakevenCalculations';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import InputPanel from '@/components/breakevenanalyzer/InputPanel';
import ResultsPanel from '@/components/breakevenanalyzer/ResultsPanel';
import EmptyState from '@/components/breakevenanalyzer/EmptyState';
import BreakevenHelpGuide from '@/components/breakevenanalyzer/BreakevenHelpGuide';

const TABLE = 'saved_breakeven_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save breakeven studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'e2_economics_persistence');

export const defaultInputs = () => ({
  projectName: 'Deepwater Block XYZ Development',
  breakevenTarget: 'Breakeven Oil Price',
  iterations: 5000,
  seed: DEFAULT_SEED,
  discountRate: 10,
  targetNpv: 0,
  royaltyRate: 12.5,
  taxRate: 30,
  productionData: null,
  variables: [
    { id: 1, name: 'Total CAPEX ($MM)', p10: 800, p50: 1000, p90: 1300, distType: 'Triangular' },
    { id: 2, name: 'Annual OPEX ($MM/year)', p10: 50, p50: 60, p90: 75, distType: 'Triangular' },
    { id: 3, name: 'Production Efficiency (%)', p10: 85, p50: 90, p90: 95, distType: 'Triangular' },
  ],
});

/**
 * Read a stored payload back into input state.
 *
 * The production profile is stored with the study. Without it a reopened
 * study could not be re-run, and this app refuses to run without real
 * production data - correctly, and that would make a saved study useless.
 */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    variables: Array.isArray(raw.variables) && raw.variables.length > 0
      ? raw.variables
      : base.variables,
  };
};

const ProbabilisticBreakevenAnalyzer = () => {
  const [inputs, setInputs] = useState(defaultInputs);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const serialize = useCallback((name) => ({
    name, schema: 1, inputs, modified: new Date().toISOString(),
  }), [inputs]);

  const restore = useCallback((payload) => {
    const restored = inputsFromPayload(payload);
    if (!restored) return false;
    setInputs(restored);
    // Results are a pure function of the inputs and are never stored, so a
    // reopened study starts with the run button, not with someone else's
    // numbers still on screen.
    setResults(null);
    return true;
  }, []);

  const persistence = useSavedProjects({
    service,
    serialize,
    restore,
    addNotification,
    describeError,
    watch: inputs,
    noun: 'Study',
  });

  const projectList = useMemo(() => persistence.projects, [persistence.projects]);

  const handleAnalyze = useCallback((next) => {
    if (!next.productionData) {
      toast({
        variant: 'destructive',
        title: 'Missing Production Data',
        description: 'Please upload a production profile CSV to run the analysis.',
      });
      return;
    }

    setLoading(true);
    setResults(null);

    setTimeout(() => {
      try {
        const analysisResults = generateBreakevenData(next);
        setResults(analysisResults);
        toast({
          title: 'Simulation Complete!',
          description: 'Probabilistic breakeven analysis finished.',
        });
      } catch (error) {
        console.error('Analysis Error:', error);
        toast({
          variant: 'destructive',
          title: 'Analysis Failed',
          description: error.message || 'An unexpected error occurred during simulation.',
        });
      } finally {
        setLoading(false);
      }
    }, 50); // yield one frame so the loading state paints before the synchronous Monte Carlo run
  }, [toast]);

  return (
    <>
      <Helmet>
        <title>Probabilistic Breakeven Analyzer - Petrolord Suite</title>
        <meta name="description" content="Risk-informed project viability analysis with Monte Carlo simulation for breakeven price/volume." />
      </Helmet>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex h-full">
        <div className="w-full md:w-1/3 xl:w-1/4 p-6 bg-slate-900/50 backdrop-blur-lg border-r border-white/10 overflow-y-auto">
          <div className="mb-6 pb-4 border-b border-white/10 space-y-3">
            <StudioProjectManager
              label="Saved study"
              projects={projectList}
              currentProjectId={persistence.currentProjectId}
              onCreate={persistence.createProject}
              onOpen={persistence.openProject}
              onDelete={persistence.deleteProject}
              confirmDeleteMessage="Delete this breakeven study and its saved inputs? This cannot be undone."
            />
            <div className="flex items-center justify-between">
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <BreakevenHelpGuide />
            </div>
          </div>
          <InputPanel
            onAnalyze={handleAnalyze}
            loading={loading}
            inputs={inputs}
            setInputs={setInputs}
          />
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {!results && !loading && (
            <EmptyState onAnalyze={() => toast({ title: 'Please configure inputs and upload data first.' })} />
          )}
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lime-400 mx-auto"></div>
                <p className="text-white mt-4 text-lg">Running Monte Carlo Simulation...</p>
                <p className="text-lime-300">This may take a moment for complex models.</p>
              </div>
            </div>
          )}
          {results && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <ResultsPanel results={results} />
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProbabilisticBreakevenAnalyzer;
