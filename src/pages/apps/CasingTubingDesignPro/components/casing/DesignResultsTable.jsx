import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtSF, depthDisp, depthLabel } from '../../services/ctRun';

// Per-section engine results for ONE load case: worst-point SFs with the
// governing depths the profile scan found (not just the shoe).
const DesignResultsTable = ({ caseResult, depthUnit = 'm' }) => {
  if (!caseResult) return null;
  const unit = depthLabel(depthUnit);

  const getStatusColor = (status) => {
    if (status === 'PASS') return 'bg-emerald-900/30 text-emerald-400 border-emerald-800';
    if (status === 'WARNING') return 'bg-amber-900/30 text-amber-400 border-amber-800';
    return 'bg-red-900/30 text-red-400 border-red-800';
  };

  const sfColor = (val, threshold) => {
    if (val == null || !Number.isFinite(val)) return 'text-slate-500';
    if (val >= threshold * 1.1) return 'text-emerald-400';
    if (val >= threshold) return 'text-amber-400';
    return 'text-red-400 font-bold';
  };

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/50 overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-900">
          <TableRow className="border-slate-800 hover:bg-transparent">
            <TableHead className="h-8 text-[10px] font-bold text-slate-400">Section</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400">Interval MD ({unit})</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Burst SF</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Collapse SF</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Regime</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Tension SF</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Triaxial SF</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {caseResult.sections.map((res) => (
            <TableRow key={res.sectionId || res.name} className="border-slate-800 hover:bg-slate-800/50 h-8">
              <TableCell className="py-1 text-xs font-medium text-slate-200">
                {res.name}
                <span className="text-slate-500 ml-2 font-mono text-[10px]">{res.odIn}&quot; {res.weightLbFt}# {res.grade}</span>
              </TableCell>
              <TableCell className="py-1 text-xs font-mono text-slate-400">
                {Math.round(depthDisp(res.topMdM, depthUnit))} - {Math.round(depthDisp(res.bottomMdM, depthUnit))}
              </TableCell>
              <TableCell className={`py-1 text-xs font-mono text-center ${sfColor(res.burstSF, 1.1)}`} data-testid={`ct-burst-sf-${res.name}`}>
                {fmtSF(res.burstSF)}
                {res.burstAtTvdM != null && (
                  <span className="text-slate-600 block text-[9px]">@ {Math.round(depthDisp(res.burstAtTvdM, depthUnit))} {unit} TVD</span>
                )}
              </TableCell>
              <TableCell className={`py-1 text-xs font-mono text-center ${sfColor(res.collapseSF, 1.0)}`} data-testid={`ct-collapse-sf-${res.name}`}>
                {fmtSF(res.collapseSF)}
                {res.collapseAtTvdM != null && (
                  <span className="text-slate-600 block text-[9px]">@ {Math.round(depthDisp(res.collapseAtTvdM, depthUnit))} {unit} TVD</span>
                )}
              </TableCell>
              <TableCell className="py-1 text-[10px] text-center text-slate-500">{res.collapseRegime || '—'}</TableCell>
              <TableCell className={`py-1 text-xs font-mono text-center ${sfColor(res.tensionSF, 1.6)}`}>
                {fmtSF(res.tensionSF)}
              </TableCell>
              <TableCell className={`py-1 text-xs font-mono text-center ${sfColor(res.triaxSF, 1.25)}`} data-testid={`ct-triaxial-sf-${res.name}`}>
                {fmtSF(res.triaxSF)}
              </TableCell>
              <TableCell className="py-1 text-center">
                <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${getStatusColor(res.status)}`}>
                  {res.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default DesignResultsTable;
