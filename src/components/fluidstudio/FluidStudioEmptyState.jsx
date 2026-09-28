import React from 'react';
    import { motion } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import { FlaskConical, TestTube } from 'lucide-react';

    const FluidStudioEmptyState = ({ onRunSample }) => {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center h-full text-center p-8 bg-pl-sunken border border-dashed border-pl-border rounded-xl"
        >
          <div className="bg-pl-primary text-pl-primary-fg p-4 rounded-full mb-6">
            <FlaskConical className="w-12 h-12" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-pl-text mb-2">Fluid Systems & Flow Behavior Studio</h2>
          <p className="text-pl-muted max-w-md mb-6">
            Configure your fluid properties and analysis type in the left panel, or load a sample dataset to get started.
          </p>
          <Button onClick={onRunSample} size="lg" className="font-semibold text-base px-8">
            <TestTube className="w-5 h-5 mr-2" />
            Load Sample Data
          </Button>
        </motion.div>
      );
    };

    export default FluidStudioEmptyState;