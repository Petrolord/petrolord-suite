import React from 'react';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import Papa from 'papaparse';

const PatternResponsePanel = ({ data }) => {
  if (!data || data.length === 0) return null;

  const sortedData = [...data].sort((a, b) => b.corr - a.corr);

  const handleExport = () => {
    const csv = Papa.unparse(sortedData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'pattern_response.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-pl-text">Pattern Response</h2>
        <Button onClick={handleExport} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-pl-surface backdrop-blur-sm">
            <TableRow>
              <TableHead>Injector</TableHead>
              <TableHead>Producer</TableHead>
              <TableHead className="text-right">Lag (days)</TableHead>
              <TableHead className="text-right">Correlation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.slice(0, 25).map((row, index) => (
              <TableRow key={index} className="border-pl-border">
                <TableCell className="font-pl-mono tabular-nums">{row.injector}</TableCell>
                <TableCell className="font-pl-mono tabular-nums">{row.producer}</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums">{row.lag_days}</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums">{row.corr.toFixed(3)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </motion.div>
  );
};

export default PatternResponsePanel;