import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Activity, Play, UploadCloud } from 'lucide-react';

const EmptyState = ({ onAnalyze, fileReady = false }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full text-center p-8 bg-pl-surface border border-dashed border-pl-border-strong rounded-xl"
    >
      <div className="p-4 rounded-full mb-6 bg-pl-primary text-pl-primary-fg">
        <Activity className="w-12 h-12" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-semibold text-pl-text mb-2">Probabilistic Breakeven Analyzer</h2>
      <p className="text-pl-muted max-w-md mb-6">
        Upload a production profile, define distributions for your key economic variables, and run a Monte Carlo simulation to understand the true risk profile of your project's breakeven point.
      </p>
      <div className="flex items-center justify-center p-4 rounded-lg bg-pl-sunken border border-pl-border">
        <UploadCloud className="w-6 h-6 mr-3 shrink-0 text-pl-muted" aria-hidden="true" />
        <p className="text-pl-text" data-testid="be-next-step">
          {fileReady
            ? 'Production profile loaded. Set the variables, then press Run Simulation at the bottom of the setup panel.'
            : 'Start by uploading a production CSV in the panel to the left.'}
        </p>
      </div>
    </motion.div>
  );
};

export default EmptyState;