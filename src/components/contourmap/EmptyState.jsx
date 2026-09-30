import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Layers, UploadCloud } from 'lucide-react';

const EmptyState = ({ onUpload }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full text-center p-8 bg-pl-surface border-2 border-dashed border-pl-border-strong rounded-xl"
    >
      <div className="bg-pl-sunken p-4 rounded-full mb-6">
        <Layers className="w-12 h-12 text-pl-primary-text" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold text-pl-text mb-2 tracking-tight">Contour Map Digitizer</h2>
      <p className="text-pl-muted max-w-md mb-8">
        Upload a scanned contour map, georeference it with control points, trace the contours automatically or by hand, and grid them into a surface for Mapping & Surface Studio.
      </p>
      <Button 
        onClick={onUpload} 
        size="lg"
        className="font-semibold px-8"
      >
        <UploadCloud className="w-5 h-5 mr-3" />
        Upload Map to Get Started
      </Button>
    </motion.div>
  );
};

export default EmptyState;