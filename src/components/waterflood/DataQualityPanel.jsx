import React from 'react';
import { motion } from 'framer-motion';
import { Check, AlertCircle, Database } from 'lucide-react';

const DataQualityPanel = ({ data }) => {
  if (!data) return null;

  const { issues, duplicates_removed, negatives_zeroed, rows_in, rows_out } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
    >
      <h2 className="text-2xl font-bold text-pl-text mb-4">Data Quality Summary</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-pl-sunken p-4 rounded-lg flex items-center space-x-3">
          <Database className="w-8 h-8 text-pl-muted" aria-hidden="true" />
          <div>
            <p className="text-sm text-pl-muted">Rows In / Out</p>
            <p className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text">{rows_in} / {rows_out}</p>
          </div>
        </div>
        <div className="bg-pl-sunken p-4 rounded-lg flex items-center space-x-3">
          <AlertCircle className="w-8 h-8 text-pl-muted" aria-hidden="true" />
          <div>
            <p className="text-sm text-pl-muted">Duplicates Removed</p>
            <p className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text">{duplicates_removed}</p>
          </div>
        </div>
        <div className="bg-pl-sunken p-4 rounded-lg flex items-center space-x-3">
          <AlertCircle className="w-8 h-8 text-pl-muted" aria-hidden="true" />
          <div>
            <p className="text-sm text-pl-muted">Negatives Zeroed</p>
            <p className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text">{negatives_zeroed}</p>
          </div>
        </div>
        <div className="bg-pl-sunken p-4 rounded-lg flex items-center space-x-3">
          <Check className="w-8 h-8 text-pl-muted" aria-hidden="true" />
          <div>
            <p className="text-sm text-pl-muted">Other Issues</p>
            <p className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text">{issues?.length || 0}</p>
          </div>
        </div>
      </div>
      {issues && issues.length > 0 && (
        <div className="mt-4 bg-pl-warning-bg p-4 rounded-lg border border-pl-warning/40">
          <h3 className="font-semibold text-pl-warning-text mb-2">Data Issues Found:</h3>
          <ul className="list-disc list-inside text-pl-warning-text text-sm space-y-1">
            {issues.map((issue, index) => <li key={index}>{issue}</li>)}
          </ul>
        </div>
      )}
    </motion.div>
  );
};

export default DataQualityPanel;