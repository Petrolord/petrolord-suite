import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle, Info, Zap } from 'lucide-react';

const InsightsPanel = ({ alerts }) => {
  const allAlerts = Object.entries(alerts).flatMap(([key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      return value.map(item => ({
        type: key,
        message: typeof item === 'string'
          ? item
          : (item.message || `Injector: ${item.injector}, Producer: ${item.producer}`)
      }));
    }
    return [];
  });

  const getInsightDetails = (type) => {
    switch (type) {
      case 'high_watercut': return { icon: TrendingUp, color: 'from-yellow-500 to-orange-500', title: 'High Water Cut' };
      case 'poor_vrr': return { icon: TrendingDown, color: 'from-red-500 to-pink-500', title: 'Poor VRR' };
      case 'breakthrough': return { icon: Zap, color: 'from-purple-500 to-indigo-500', title: 'Potential Breakthrough' };
      case 'injectivity_issue': return { icon: AlertTriangle, color: 'from-orange-600 to-red-600', title: 'Injectivity Issue' };
      default: return { icon: Info, color: 'from-blue-500 to-cyan-500', title: 'General Info' };
    }
  };

  if (allAlerts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
      >
        <h2 className="text-2xl font-bold text-white mb-4">Insights & Alerts</h2>
        <div className="flex items-center justify-center flex-col text-center p-8 bg-white/5 rounded-lg">
          <CheckCircle className="w-12 h-12 text-green-400 mb-4" />
          <h3 className="text-xl font-semibold text-white">All Clear!</h3>
          <p className="text-cyan-200">No critical issues detected in the current dataset.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
    >
      <h2 className="text-2xl font-bold text-white mb-6">Insights & Alerts</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allAlerts.map((alert, index) => {
          const { icon: Icon, color, title } = getInsightDetails(alert.type);
          
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className="bg-white/5 rounded-lg p-4 border border-slate-700 hover:bg-white/10 transition-all duration-300"
            >
              <div className="flex items-start space-x-3">
                <div className={`bg-gradient-to-r ${color} p-2 rounded-lg flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold mb-1">{title}</h3>
                  <p className="text-cyan-200 text-sm leading-relaxed">{alert.message}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default InsightsPanel;