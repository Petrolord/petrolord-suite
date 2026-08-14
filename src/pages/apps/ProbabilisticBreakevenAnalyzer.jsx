import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { generateBreakevenData } from '@/utils/breakevenCalculations';
import InputPanel from '@/components/breakevenanalyzer/InputPanel';
import ResultsPanel from '@/components/breakevenanalyzer/ResultsPanel';
import EmptyState from '@/components/breakevenanalyzer/EmptyState';

const ProbabilisticBreakevenAnalyzer = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const initialInputs = {
    projectName: "Deepwater Block XYZ Development",
    breakevenTarget: 'Breakeven Oil Price',
    iterations: 5000,
    discountRate: 10,
    targetNpv: 0,
    royaltyRate: 12.5,
    taxRate: 30,
    productionData: null,
    variables: [
        { id: 1, name: 'Total CAPEX ($MM)', p10: 800, p50: 1000, p90: 1300, distType: 'Triangular' },
        { id: 2, name: 'Annual OPEX ($MM/year)', p10: 50, p50: 60, p90: 75, distType: 'Triangular' },
        { id: 3, name: 'Production Efficiency (%)', p10: 85, p50: 90, p90: 95, distType: 'Triangular' },
    ]
  };

  const handleAnalyze = useCallback((inputs) => {
    if (!inputs.productionData) {
      toast({
        variant: "destructive",
        title: "Missing Production Data",
        description: "Please upload a production profile CSV to run the analysis.",
      });
      return;
    }

    setLoading(true);
    setResults(null);

    setTimeout(() => {
      try {
        const analysisResults = generateBreakevenData(inputs);
        setResults(analysisResults);
        toast({
          title: "Simulation Complete!",
          description: "Probabilistic breakeven analysis finished.",
        });
      } catch (error) {
        console.error("Analysis Error:", error);
        toast({
          variant: "destructive",
          title: "Analysis Failed",
          description: error.message || "An unexpected error occurred during simulation.",
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
      <div className="flex h-full">
        <div className="w-full md:w-1/3 xl:w-1/4 p-6 bg-slate-900/50 backdrop-blur-lg border-r border-white/10 overflow-y-auto">
          <InputPanel onAnalyze={handleAnalyze} loading={loading} initialInputs={initialInputs} />
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {!results && !loading && (
            <EmptyState onAnalyze={() => toast({ title: "Please configure inputs and upload data first."})} />
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