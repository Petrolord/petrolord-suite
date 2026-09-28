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
    <div className="bg-pl-surface border border-pl-border rounded-lg overflow-hidden">
      <div className="flex justify-between items-center p-3 bg-pl-sunken/60">
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="flex-grow flex items-center space-x-2 text-left">
          <motion.div animate={{ rotate: isOpen ? 0 : -90 }}>
            <ChevronDown className="w-5 h-5 text-pl-muted" />
          </motion.div>
          <span className="font-semibold text-pl-text">{variable.name}</span>
        </button>
        <Button variant="ghost" size="icon" onClick={() => onRemove(variable.id)} className="text-pl-danger-text hover:bg-pl-danger-bg">
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
            <div className="p-3 grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">{VARIABLE_PERCENTILE_LABELS.p10}</Label>
                <Input type="number" value={variable.p10} onChange={(e) => onChange(variable.id, 'p10', Number(e.target.value))} className="px-2 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </div>
              <div>
                <Label className="text-xs">{VARIABLE_PERCENTILE_LABELS.p50}</Label>
                <Input type="number" value={variable.p50} onChange={(e) => onChange(variable.id, 'p50', Number(e.target.value))} className="px-2 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </div>
              <div>
                <Label className="text-xs">{VARIABLE_PERCENTILE_LABELS.p90}</Label>
                <Input type="number" value={variable.p90} onChange={(e) => onChange(variable.id, 'p90', Number(e.target.value))} className="px-2 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VariableCard;