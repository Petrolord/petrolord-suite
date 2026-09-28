import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GitMerge, Play } from 'lucide-react';

const EmptyState = ({ onAnalyze }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full text-center p-8 bg-pl-surface border border-dashed border-pl-border-strong rounded-xl"
    >
      <div className="p-4 rounded-full mb-6 bg-pl-primary text-pl-primary-fg">
        <GitMerge className="w-12 h-12" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-semibold text-pl-text mb-2">Value of Information Analyzer</h2>
      <p className="text-pl-muted max-w-md mb-6">
        Construct a decision tree, model your uncertainties, and run the analysis to quantify the value of acquiring new information before making a critical investment.
      </p>
      <Button onClick={onAnalyze} className="font-semibold py-3 text-lg px-8">
        <Play className="w-5 h-5 mr-2" />
        Run Demo Analysis
      </Button>
    </motion.div>
  );
};

export default EmptyState;