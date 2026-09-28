import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle, Info, Zap } from 'lucide-react';

// Alert icons carry the alert's status (paired with its title).
const TONE = {
  warning: 'bg-pl-warning-bg text-pl-warning-text',
  danger: 'bg-pl-danger-bg text-pl-danger-text',
  info: 'bg-pl-info-bg text-pl-info-text',
};

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
      case 'high_watercut': return { icon: TrendingUp, tone: TONE.warning, title: 'High Water Cut' };
      case 'poor_vrr': return { icon: TrendingDown, tone: TONE.danger, title: 'Poor VRR' };
      case 'breakthrough': return { icon: Zap, tone: TONE.warning, title: 'Potential Breakthrough' };
      case 'injectivity_issue': return { icon: AlertTriangle, tone: TONE.danger, title: 'Injectivity Issue' };
      default: return { icon: Info, tone: TONE.info, title: 'General Info' };
    }
  };

  if (allAlerts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
      >
        <h2 className="text-2xl font-bold text-pl-text mb-4">Insights & Alerts</h2>
        <div className="flex items-center justify-center flex-col text-center p-8 bg-pl-sunken rounded-lg">
          <CheckCircle className="w-12 h-12 text-pl-success-text mb-4" />
          <h3 className="text-xl font-semibold text-pl-text">All Clear!</h3>
          <p className="text-pl-muted">No critical issues detected in the current dataset.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
    >
      <h2 className="text-2xl font-bold text-pl-text mb-6">Insights & Alerts</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allAlerts.map((alert, index) => {
          const { icon: Icon, tone, title } = getInsightDetails(alert.type);
          
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className="bg-pl-sunken rounded-lg p-4 border border-pl-border transition-colors"
            >
              <div className="flex items-start space-x-3">
                <div className={`${tone} p-2 rounded-lg flex-shrink-0`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 className="text-pl-text font-semibold mb-1">{title}</h3>
                  <p className="text-pl-muted text-sm leading-relaxed">{alert.message}</p>
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