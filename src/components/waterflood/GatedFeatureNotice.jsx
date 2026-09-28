import React from 'react';
import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';

// An honest placeholder for analytics that are not yet physically derived.
// Used instead of rendering unverified/fabricated engine output so an engineer
// is never shown a number they could mistake for a real result.
const GatedFeatureNotice = ({ title, message }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
  >
    <h2 className="text-2xl font-bold text-pl-text mb-4">{title}</h2>
    <div className="flex items-start gap-4 bg-pl-warning-bg border border-pl-warning/40 rounded-lg p-4">
      <Construction className="w-6 h-6 text-pl-warning-text flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-pl-warning-text">Not yet available</p>
        <p className="text-pl-warning-text text-sm leading-relaxed mt-1">{message}</p>
      </div>
    </div>
  </motion.div>
);

export default GatedFeatureNotice;
