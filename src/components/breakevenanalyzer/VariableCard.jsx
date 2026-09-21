import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X, ChevronDown } from 'lucide-react';
import { VARIABLE_PERCENTILE_LABELS } from './percentileLabels';

const VariableCard = ({ variable, onChange, onRemove }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-white/10 border border-white/20 rounded-lg overflow-hidden">
      <div className="flex justify-between items-center p-3 bg-white/5">
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="flex-grow flex items-center space-x-2 text-left">
          <motion.div animate={{ rotate: isOpen ? 0 : -90 }}>
            <ChevronDown className="w-5 h-5 text-lime-300" />
          </motion.div>
          <span className="font-semibold text-white">{variable.name}</span>
        </button>
        <Button variant="ghost" size="icon" onClick={() => onRemove(variable.id)} className="text-red-400 hover:bg-red-500/20 hover:text-red-300">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 grid grid-cols-3 gap-3">
              <div>
                <Label className="text-lime-300 text-xs">{VARIABLE_PERCENTILE_LABELS.p10}</Label>
                <Input type="number" value={variable.p10} onChange={(e) => onChange(variable.id, 'p10', Number(e.target.value))} className="bg-white/5 border-white/20" />
              </div>
              <div>
                <Label className="text-lime-300 text-xs">{VARIABLE_PERCENTILE_LABELS.p50}</Label>
                <Input type="number" value={variable.p50} onChange={(e) => onChange(variable.id, 'p50', Number(e.target.value))} className="bg-white/5 border-white/20" />
              </div>
              <div>
                <Label className="text-lime-300 text-xs">{VARIABLE_PERCENTILE_LABELS.p90}</Label>
                <Input type="number" value={variable.p90} onChange={(e) => onChange(variable.id, 'p90', Number(e.target.value))} className="bg-white/5 border-white/20" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VariableCard;