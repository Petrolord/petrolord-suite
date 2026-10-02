import React from 'react';
import { motion } from 'framer-motion';
import { Target, Calculator, TrendingUp, DollarSign, BarChart3, Zap } from 'lucide-react';

const EmptyState = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-4 sm:p-6 shadow-pl-sm"
    >
      <div className="text-center py-12">
        <Target className="w-16 h-16 text-pl-muted mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-pl-text mb-4">Ready to compare well spacings</h2>
        <p className="text-pl-muted mb-6">
          Enter your field characteristics and economic parameters to compare spacing cases on well count, capital, volume, cost per barrel and NPV. The app nominates no optimum.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
          <div className="bg-pl-sunken rounded-lg p-4">
            <Calculator className="w-8 h-8 text-pl-muted mx-auto mb-2" />
            <h3 className="text-pl-text font-semibold mb-1">Spacing economics</h3>
            <p className="text-pl-muted text-sm">Capex, produced volume, cost per barrel and NPV for every spacing in your range</p>
          </div>
          <div className="bg-pl-sunken rounded-lg p-4">
            <TrendingUp className="w-8 h-8 text-pl-muted mx-auto mb-2" />
            <h3 className="text-pl-text font-semibold mb-1">Interactive Charts</h3>
            <p className="text-pl-muted text-sm">NPV, field recovery and cost per barrel plotted against spacing</p>
          </div>
          <div className="bg-pl-sunken rounded-lg p-4">
            <Zap className="w-8 h-8 text-pl-muted mx-auto mb-2" />
            <h3 className="text-pl-text font-semibold mb-1">Stated assumptions</h3>
            <p className="text-pl-muted text-sm">A fixed recovery factor over the area each well drains, with no interference modelled</p>
          </div>
        </div>
        
        <div className="rounded-lg p-4 sm:p-6 border border-pl-border bg-pl-sunken/60">
          <h3 className="text-lg font-semibold text-pl-text mb-3">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-start space-x-3">
              <div className="bg-pl-primary text-pl-primary-fg rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">1</div>
              <div>
                <p className="text-pl-text font-medium">Input Parameters</p>
                <p className="text-pl-muted">Reservoir, fluid, and economic data</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-pl-primary text-pl-primary-fg rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">2</div>
              <div>
                <p className="text-pl-text font-medium">Calculate Scenarios</p>
                <p className="text-pl-muted">Test multiple spacing options</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-pl-primary text-pl-primary-fg rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">3</div>
              <div>
                <p className="text-pl-text font-medium">Optimize NPV</p>
                <p className="text-pl-muted">Find maximum value spacing</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-pl-primary text-pl-primary-fg rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">4</div>
              <div>
                <p className="text-pl-text font-medium">Visual Results</p>
                <p className="text-pl-muted">Charts and recommendations</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default EmptyState;