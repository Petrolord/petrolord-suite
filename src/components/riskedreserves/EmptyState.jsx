import React from 'react';
import { motion } from 'framer-motion';
import { PieChart, SlidersHorizontal, BarChart2, Zap } from 'lucide-react';

const EmptyState = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6 h-full flex flex-col justify-center"
    >
      <div className="text-center py-12">
        <PieChart className="w-16 h-16 text-blue-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-4">Risked Reserves Valuation</h2>
        <p className="text-lime-200 mb-6 max-w-2xl mx-auto">
          Define probabilistic distributions for your key project variables, run a Monte Carlo simulation, and visualize the full range of potential economic outcomes.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
          <div className="bg-white/5 rounded-lg p-4">
            <SlidersHorizontal className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">1. Define Variables</h3>
            <p className="text-lime-300 text-sm">Set P10, P50, and P90 values for reserves, costs, and prices.</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <Zap className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">2. Run Simulation</h3>
            <p className="text-lime-300 text-sm">Perform thousands of iterations to model uncertainty.</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <BarChart2 className="w-8 h-8 text-teal-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">3. Analyze Results</h3>
            <p className="text-lime-300 text-sm">View NPV distributions, S-curves, and sensitivities.</p>
          </div>
        </div>
        
        <div className="mt-8 p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-lg border border-cyan-500/20">
          <h3 className="text-lg font-semibold text-white mb-3">How It Computes</h3>
          <p className="text-lime-200 text-sm max-w-3xl mx-auto">
            The Run Simulation button executes a real Monte Carlo engine in your browser: triangular sampling of reserves, price, and costs through a discounted cash-flow model, returning the full NPV distribution with P90/P50/P10, chance of positive NPV, and sensitivity rankings.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default EmptyState;