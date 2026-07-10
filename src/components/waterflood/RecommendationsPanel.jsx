import React from 'react';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUp, ArrowDown } from 'lucide-react';

const RecommendationsPanel = ({ data, note }) => {
  if (!data || data.length === 0) return null;

  const sortedData = [...data].sort((a, b) => Math.abs(b.delta_bpd) - Math.abs(a.delta_bpd));

  const getRowClass = (delta) => {
    if (delta > 0) return 'bg-green-500/10';
    if (delta < 0) return 'bg-red-500/10';
    return '';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
    >
      <h2 className="text-2xl font-bold text-white mb-1">Injector Recommendations</h2>
      <p className="text-cyan-200/80 text-sm mb-4">
        Field-level VRR balance{note ? ` — ${note}` : ''} These target overall voidage replacement, not per-pattern geometry.
      </p>
      <div className="max-h-96 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-slate-900/80 backdrop-blur-sm">
            <TableRow>
              <TableHead className="text-lime-300">Injector</TableHead>
              <TableHead className="text-lime-300 text-right">Avg Inj (30d)</TableHead>
              <TableHead className="text-lime-300 text-right">Suggested Inj</TableHead>
              <TableHead className="text-lime-300 text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row, index) => (
              <TableRow key={index} className={`border-slate-800 ${getRowClass(row.delta_bpd)}`}>
                <TableCell className="font-mono">{row.injector}</TableCell>
                <TableCell className="text-right font-mono">{Math.round(row.avg_inj_last30_bpd).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">{Math.round(row.suggested_inj_bpd).toLocaleString()}</TableCell>
                <TableCell className={`text-right font-mono flex items-center justify-end ${row.delta_bpd > 0 ? 'text-green-400' : 'text-red-400'}`}>
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