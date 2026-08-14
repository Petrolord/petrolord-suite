import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { generateVoiData } from '@/utils/voiCalculations';
import InputPanel from '@/components/voianalyzer/InputPanel';
import ResultsPanel from '@/components/voianalyzer/ResultsPanel';
import EmptyState from '@/components/voianalyzer/EmptyState';

const ValueOfInformationAnalyzer = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const initialInputs = {
    projectName: "Offshore Exploration Prospect 'Phoenix'",
    decisionName: "Drill Exploration Well",
    decisionCost: 40,
    outcomes: [
      { id: 1, name: 'Success Case', probability: 30, payoff: 300 },
      { id: 2, name: 'Dry Hole', probability: 70, payoff: -50 },
    ],
    infoScenario: {
      name: "3D Seismic Survey",
      cost: 10,
      indicators: [
        { id: 1, name: 'Positive Seismic', probability: 40, conditionalProbabilities: [{ outcomeId: 1, probability: 60 }, { outcomeId: 2, probability: 40 }] },
        { id: 2, name: 'Negative Seismic', probability: 60, conditionalProbabilities: [{ outcomeId: 1, probability: 10 }, { outcomeId: 2, probability: 90 }] },
      ]
    }
  };

  const handleAnalyze = useCallback((inputs) => {
    setLoading(true);
    setResults(null);

    try {
      const analysisResults = generateVoiData(inputs);
      setResults(analysisResults);
      toast({
        title: "Analysis Complete!",
        description: "Value of Information has been calculated.",
      });
    } catch (error) {
      console.error("VOI Error:", error);
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: error.message || "An unexpected error occurred.",
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
      <div className="flex h-full">
        <div className="w-full md:w-1/3 xl:w-1/4 p-6 bg-slate-900/50 backdrop-blur-lg border-r border-white/10 overflow-y-auto">
          <InputPanel onAnalyze={handleAnalyze} loading={loading} initialInputs={initialInputs} />
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {!results && !loading && (
            <EmptyState onAnalyze={() => handleAnalyze(initialInputs)} />
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