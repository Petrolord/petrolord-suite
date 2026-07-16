import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { PieChart, ArrowLeft } from 'lucide-react';
import InputPanel from '@/components/riskedreserves/InputPanel';
import ResultsPanel from '@/components/riskedreserves/ResultsPanel';
import EmptyState from '@/components/riskedreserves/EmptyState';
import { runMonteCarloSimulation } from '@/utils/riskedReservesCalculations';

const RiskedReservesValuation = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleRunSimulation = async (inputs) => {
    setLoading(true);
    setResults(null);
    toast({
      title: "Running Monte Carlo Simulation... 🎲",
      description: `Performing ${inputs.simulationSettings.iterations} iterations. This may take a moment.`,
    });

    try {
      const simulationResults = await runMonteCarloSimulation(inputs);
      setResults(simulationResults);
      toast({
        title: "Simulation Complete! ✅",
        description: `Successfully analyzed the project's risk profile.`,
      });
    } catch (error) {
      console.error("Monte Carlo Simulation Error:", error);
      toast({
        title: "Simulation Failed",
        description: "An error occurred during the probabilistic valuation.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Risked Reserves Valuation - Petrolord Suite</title>
        <meta name="description" content="Probabilistic reserves valuation using Monte Carlo simulation." />
      </Helmet>
      <div className="p-4 md:p-8 h-full flex flex-col">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <Link to="/dashboard/reservoir">
              <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Reservoir Management
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-xl">
              <PieChart className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-white">Risked Reserves Valuation</h1>
              <p className="text-lime-200 text-md md:text-lg">Monte Carlo Simulation for Project Economics</p>
            </div>
          </div>
        </motion.div>
        <div className="flex flex-col lg:flex-row gap-8 flex-grow">
          <div className="lg:w-2/5 xl:w-1/3">
            <InputPanel onRunSimulation={handleRunSimulation} loading={loading} />
          </div>
          <div className="lg:w-3/5 xl:w-2/3">
            {loading ? (
              <div className="flex items-center justify-center h-full bg-white/5 rounded-xl border border-white/10 p-6">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lime-400 mx-auto"></div>
                  <p className="text-white mt-4 text-lg">Simulating...</p>
                  <p className="text-lime-300">Please wait, this can take a moment.</p>
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
    </>
  );
};

export default RiskedReservesValuation;