import React from 'react';
import { motion } from 'framer-motion';
import { Target, Calculator, TrendingUp, DollarSign, BarChart3, Zap } from 'lucide-react';

const EmptyState = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
    >
      <div className="text-center py-12">
        <Target className="w-16 h-16 text-blue-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-4">Ready for Well Spacing Optimization</h2>
        <p className="text-lime-200 mb-6">
          Enter your field characteristics and economic parameters to find the optimal well spacing that maximizes NPV.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
          <div className="bg-white/5 rounded-lg p-4">
            <Calculator className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">Spacing economics</h3>
            <p className="text-lime-300 text-sm">Capex, produced volume, cost per barrel and NPV for every spacing in your range</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <TrendingUp className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">Interactive Charts</h3>
            <p className="text-lime-300 text-sm">NPV, field recovery and cost per barrel plotted against spacing</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <Zap className="w-8 h-8 text-orange-400 mx-auto mb-2" />
            <h3 className="text-white font-semibold mb-1">Stated assumptions</h3>
            <p className="text-lime-300 text-sm">A fixed recovery factor over the area each well drains, with no interference modelled</p>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-lg p-6 border border-blue-500/20">
          <h3 className="text-lg font-semibold text-white mb-3">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-start space-x-3">
              <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">1</div>
              <div>
                <p className="text-white font-medium">Input Parameters</p>
                <p className="text-lime-300">Reservoir, fluid, and economic data</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">2</div>
              <div>
                <p className="text-white font-medium">Calculate Scenarios</p>
                <p className="text-lime-300">Test multiple spacing options</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">3</div>
              <div>
                <p className="text-white font-medium">Optimize NPV</p>
                <p className="text-lime-300">Find maximum value spacing</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">4</div>
              <div>
                <p className="text-white font-medium">Visual Results</p>
                <p className="text-lime-300">Charts and recommendations</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default EmptyState;