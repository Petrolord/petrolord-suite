import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { generateVoiData } from '@/utils/voiCalculations';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import InputPanel from '@/components/voianalyzer/InputPanel';
import ResultsPanel from '@/components/voianalyzer/ResultsPanel';
import EmptyState from '@/components/voianalyzer/EmptyState';
import VoiHelpGuide from '@/components/voianalyzer/VoiHelpGuide';

const TABLE = 'saved_voi_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save VOI studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'e2_economics_persistence');

export const defaultInputs = () => ({
  projectName: "Offshore Exploration Prospect 'Phoenix'",
  decisionName: 'Drill Exploration Well',
  decisionCost: 40,
  outcomes: [
    { id: 1, name: 'Success Case', probability: 30, payoff: 300 },
    { id: 2, name: 'Dry Hole', probability: 70, payoff: -50 },
  ],
  infoScenario: {
    name: '3D Seismic Survey',
    cost: 10,
    indicators: [
      { id: 1, name: 'Positive Seismic', probability: 40, conditionalProbabilities: [{ outcomeId: 1, probability: 60 }, { outcomeId: 2, probability: 40 }] },
      { id: 2, name: 'Negative Seismic', probability: 60, conditionalProbabilities: [{ outcomeId: 1, probability: 10 }, { outcomeId: 2, probability: 90 }] },
    ],
  },
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  if (!Array.isArray(raw.outcomes) || !raw.infoScenario) return null;
  return {
    ...base,
    ...raw,
    infoScenario: { ...base.infoScenario, ...raw.infoScenario },
  };
};

const ValueOfInformationAnalyzer = () => {
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

  const handleAnalyze = useCallback((next) => {
    setLoading(true);
    setResults(null);

    try {
      const analysisResults = generateVoiData(next);
      setResults(analysisResults);
      toast({
        title: 'Analysis Complete!',
        description: 'Value of Information has been calculated.',
      });
    } catch (error) {
      console.error('VOI Error:', error);
      toast({
        variant: 'destructive',
        title: 'Analysis Failed',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return (
    <>
      <Helmet>
        <title>Value of Information Analyzer - Petrolord Suite</title>
        <meta name="description" content="Advanced Value of Information (VOI) analysis for oil and gas projects." />
      </Helmet>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex h-full">
        <div className="w-full md:w-1/3 xl:w-1/4 p-6 bg-slate-900/50 backdrop-blur-lg border-r border-white/10 overflow-y-auto">
          <div className="mb-6 pb-4 border-b border-white/10 space-y-3">
            <StudioProjectManager
              label="Saved study"
              projects={persistence.projects}
              currentProjectId={persistence.currentProjectId}
              onCreate={persistence.createProject}
              onOpen={persistence.openProject}
              onDelete={persistence.deleteProject}
              confirmDeleteMessage="Delete this VOI study and its saved inputs? This cannot be undone."
            />
            <div className="flex items-center justify-between">
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <VoiHelpGuide />
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
            <EmptyState onAnalyze={() => handleAnalyze(inputs)} />
          )}
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lime-400 mx-auto"></div>
                <p className="text-white mt-4 text-lg">Running Decision Tree Analysis...</p>
                <p className="text-lime-300">Please wait while we calculate EMV and VOI.</p>
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

export default ValueOfInformationAnalyzer;
