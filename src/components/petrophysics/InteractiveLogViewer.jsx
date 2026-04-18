
import React from 'react';
import { motion } from 'framer-motion';
import { Hand, ZoomIn } from 'lucide-react';

const InteractiveLogViewer = ({ petroState }) => {
  const { logData, curveMap } = petroState;

  const renderPlot = () => {
    if (!logData || !curveMap.gr) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-gray-800/50 border border-dashed border-white/20 rounded-xl">
          <div className="bg-gradient-to-r from-teal-500 to-cyan-500 p-4 rounded-full mb-6">
            <ZoomIn className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Interactive Log Viewer</h2>
          <p className="text-cyan-300 max-w-md">
            Upload a LAS file and map the 'GR' curve to display the log for interactive zone picking.
          </p>
        </div>
      );
    }

    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 bg-[#1f2937]">
        Chart removed
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-gray-800 p-4 rounded-lg shadow-lg h-full flex flex-col"
    >
      <div className="flex-grow h-[calc(100vh-200px)]">
        {renderPlot()}
      </div>
      <div className="text-center text-xs text-gray-400 pt-2 flex items-center justify-center gap-2">
        <Hand size={14} /> Drag to pan, scroll to zoom. <div className="w-px h-4 bg-gray-600"></div> <ZoomIn size={14} /> Drag vertically to select a zone.
      </div>
    </motion.div>
  );
};

export default InteractiveLogViewer;
