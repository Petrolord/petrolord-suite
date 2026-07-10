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
    className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
  >
    <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
    <div className="flex items-start gap-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
      <Construction className="w-6 h-6 text-amber-300 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-amber-200">Not yet available</p>
        <p className="text-amber-100/80 text-sm leading-relaxed mt-1">{message}</p>
      </div>
    </div>
  </motion.div>
);

export default GatedFeatureNotice;
