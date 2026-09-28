import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, FileInput, SlidersHorizontal, BarChartHorizontal } from 'lucide-react';

const EmptyState = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 h-full flex flex-col justify-center shadow-pl-sm"
    >
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 text-pl-muted mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-2xl font-bold text-pl-text mb-4">NPV Scenario Builder</h2>
        <p className="text-pl-muted mb-6 max-w-2xl mx-auto">
          Define your production profile, create multiple economic scenarios, and instantly compare key financial metrics like NPV and IRR to make informed investment decisions.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
          <div className="bg-pl-sunken rounded-lg p-4">
            <FileInput className="w-8 h-8 text-pl-primary-text mx-auto mb-2" aria-hidden="true" />
            <h3 className="text-pl-text font-semibold mb-1">1. Input Profile</h3>
            <p className="text-pl-muted text-sm">Upload or define a production forecast.</p>
          </div>
          <div className="bg-pl-sunken rounded-lg p-4">
            <SlidersHorizontal className="w-8 h-8 text-pl-primary-text mx-auto mb-2" aria-hidden="true" />
            <h3 className="text-pl-text font-semibold mb-1">2. Build Scenarios</h3>
            <p className="text-pl-muted text-sm">Create cases with different CAPEX, OPEX, and prices.</p>
          </div>
          <div className="bg-pl-sunken rounded-lg p-4">
            <BarChartHorizontal className="w-8 h-8 text-pl-primary-text mx-auto mb-2" aria-hidden="true" />
            <h3 className="text-pl-text font-semibold mb-1">3. Compare Results</h3>
            <p className="text-pl-muted text-sm">Analyze cash flows, NPV, IRR, and sensitivities.</p>
          </div>
        </div>
        
        <div className="mt-8 p-4 bg-pl-sunken rounded-lg border border-pl-border">
          <h3 className="text-lg font-semibold text-pl-text mb-3">How It Computes</h3>
          <p className="text-pl-muted text-sm max-w-3xl mx-auto">
            The Calculate button runs a full fiscal cash-flow model in your browser: year-by-year revenue, royalty and tax (or PSC cost recovery and profit split), NPV, IRR, payback, low/base/high scenarios, tornado sensitivities, and a 1,000-iteration Monte Carlo risk analysis.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default EmptyState;