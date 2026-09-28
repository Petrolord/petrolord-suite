import React from 'react';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUp, ArrowDown } from 'lucide-react';

const RecommendationsPanel = ({ data, note }) => {
  if (!data || data.length === 0) return null;

  const sortedData = [...data].sort((a, b) => Math.abs(b.delta_bpd) - Math.abs(a.delta_bpd));

  const getRowClass = (delta) => {
    if (delta > 0) return 'bg-pl-success-bg';
    if (delta < 0) return 'bg-pl-danger-bg';
    return '';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
    >
      <h2 className="text-2xl font-bold text-pl-text mb-1">Injector Recommendations</h2>
      <p className="text-pl-muted text-sm mb-4">
        Field-level VRR balance{note ? ` — ${note}` : ''} These target overall voidage replacement, not per-pattern geometry.
      </p>
      <div className="max-h-96 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-pl-surface backdrop-blur-sm">
            <TableRow>
              <TableHead>Injector</TableHead>
              <TableHead className="text-right">Avg Inj (30d)</TableHead>
              <TableHead className="text-right">Suggested Inj</TableHead>
              <TableHead className="text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row, index) => (
              <TableRow key={index} className={`border-pl-border ${getRowClass(row.delta_bpd)}`}>
                <TableCell className="font-pl-mono tabular-nums">{row.injector}</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums">{Math.round(row.avg_inj_last30_bpd).toLocaleString()}</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums">{Math.round(row.suggested_inj_bpd).toLocaleString()}</TableCell>
                <TableCell className={`text-right font-pl-mono tabular-nums flex items-center justify-end ${row.delta_bpd > 0 ? 'text-pl-success-text' : 'text-pl-danger-text'}`}>
                  {row.delta_bpd > 0 ? <ArrowUp className="w-4 h-4 mr-1"/> : <ArrowDown className="w-4 h-4 mr-1"/>}
                  {Math.round(row.delta_bpd).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </motion.div>
  );
};

export default RecommendationsPanel;