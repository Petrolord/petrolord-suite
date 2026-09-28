import React from 'react';
import { motion } from 'framer-motion';
import { Milestone } from 'lucide-react';

const EmptyState = () => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full text-center p-8 bg-pl-surface border border-dashed border-pl-border rounded-xl"
    >
      <div className="bg-pl-primary p-4 rounded-full mb-6">
        <Milestone className="w-12 h-12 text-pl-primary-fg" />
      </div>
      <h2 className="text-2xl font-bold text-pl-text mb-2">Welcome to Project Management Pro</h2>
      <p className="text-pl-muted max-w-md mb-6">
        Select a project from the panel on the left, or create a new one to get started.
      </p>
    </motion.div>
  );
};

export default EmptyState;