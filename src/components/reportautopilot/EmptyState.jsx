import React from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

const EmptyState = () => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full text-center p-8 bg-pl-surface border border-dashed border-pl-border-strong rounded-xl"
    >
      <div className="bg-pl-sunken p-4 rounded-full mb-6">
        <Bot className="w-12 h-12 text-pl-primary-text" />
      </div>
      <h2 className="text-2xl font-bold text-pl-text mb-2">Technical Report Autopilot</h2>
      <p className="text-pl-muted max-w-md mb-6">
        Choose a report type, then give it your measured figures, notes and any text or CSV files. The draft is written only from what you give it; where a section has no facts behind it, the draft says so.
      </p>
      <p className="text-xs text-pl-muted">Click "Generate Report" when you're ready.</p>
    </motion.div>
  );
};

export default EmptyState;