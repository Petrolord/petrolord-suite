import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DataQualityAssessmentGuide = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
        <h2 className="text-xl font-bold text-white">Data Quality Assessment (QC)</h2>
        <p className="text-slate-400 text-sm">
            Rigorous QC is the foundation of a reliable velocity model. The system assigns a quality flag (0-100) to each well based on the following criteria.
        </p>

        <div className="rounded-md border border-slate-800 bg-slate-900">
            <Table>
                <TableHeader className="bg-slate-950">
                    <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-300">Check</TableHead>
                        <TableHead className="text-slate-300">Pass Criteria <Check className="inline w-3 h-3 text-emerald-400"/></TableHead>
                        <TableHead className="text-slate-300">Fail Criteria <X className="inline w-3 h-3 text-red-400"/></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow className="border-slate-800">
                        <TableCell className="font-medium text-slate-200">Datum Consistency</TableCell>
                        <TableCell className="text-slate-400 text-xs">SRD matches Well KB within 0.5m</TableCell>
                        <TableCell className="text-slate-400 text-xs">Shift &gt; 2m detected</TableCell>
                    </TableRow>
                    <TableRow className="border-slate-800">
                        <TableCell className="font-medium text-slate-200">Monotonicity</TableCell>
                        <TableCell className="text-slate-400 text-xs">Time and Depth always increase</TableCell>
                        <TableCell className="text-slate-400 text-xs">Negative dZ or dT found (inversions)</TableCell>
                    </TableRow>
                    <TableRow className="border-slate-800">
                        <TableCell className="font-medium text-slate-200">Velocity Limits</TableCell>
                        <TableCell className="text-slate-400 text-xs">1500 m/s &lt; V &lt; 7000 m/s</TableCell>
                        <TableCell className="text-slate-400 text-xs">V &lt; Water Velocity or V &gt; Matrix</TableCell>
                    </TableRow>
                    <TableRow className="border-slate-800">
                        <TableCell className="font-medium text-slate-200">Outliers</TableCell>
                        <TableCell className="text-slate-400 text-xs">Within 2σ of regional trend</TableCell>
                        <TableCell className="text-slate-400 text-xs">&gt; 3σ deviation from trend</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    </div>
  );
};

export default DataQualityAssessmentGuide;