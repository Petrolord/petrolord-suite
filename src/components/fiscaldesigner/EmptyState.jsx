import React from 'react';
import { motion } from 'framer-motion';
import { Scale, FileInput, SlidersHorizontal, BarChartHorizontal } from 'lucide-react';

const EmptyState = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6 h-full flex flex-col justify-center"
    >
      <div className="text-center py-12">
        <Scale className="w-16 h-16 text-fuchsia-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-4">Fiscal Regime Designer</h2>
        <p className="text-lime-200 mb-6 max-w-2xl mx-auto">
          Model and compare multiple fiscal regimes side-by-side. Understand the impact of royalties, taxes, and profit splits on project economics for both contractor and government.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
          <div className="bg-white/5 rounded-lg p-4">
            <FileInput className="w-8 h-8 text-purple-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">1. Define Project</h3>
            <p className="text-lime-300 text-sm">Input production, cost, and price profiles.</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <SlidersHorizontal className="w-8 h-8 text-pink-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">2. Build Regimes</h3>
            <p className="text-lime-300 text-sm">Create scenarios with different fiscal terms.</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <BarChartHorizontal className="w-8 h-8 text-fuchsia-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">3. Compare Results</h3>
            <p className="text-lime-300 text-sm">Analyze NPV, cash flows and government take (undiscounted) beside government share of net revenue.</p>
          </div>
        </div>
        
        <div className="mt-8 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-pink-500/20">
          <h3 className="text-lg font-semibold text-white mb-3">Integrated Economics Engine</h3>
          <p className="text-lime-200 text-sm max-w-3xl mx-auto">
            This application features an integrated economics engine that performs all cash flow calculations and financial metrics directly within the app. The "Run Comparison" button triggers this powerful, client-side analysis.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default EmptyState;