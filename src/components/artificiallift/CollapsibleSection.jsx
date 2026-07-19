import React, { useState } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { ChevronDown } from 'lucide-react';

    const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
      const [isOpen, setIsOpen] = useState(defaultOpen);

      return (
        <div className="bg-white/5 border border-white/10 rounded-lg">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex justify-between items-center p-4 text-left"
          >
            <div className="flex items-center space-x-3">
              <div className="text-lime-300">{icon}</div>
              <h3 className="font-semibold text-white">{title}</h3>
            </div>
            <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
              <ChevronDown className="w-5 h-5 text-lime-300" />
            </motion.div>
          </button>
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="p-4 border-t border-white/10">
                  {children}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    };

    export default CollapsibleSection;