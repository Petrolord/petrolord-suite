// CT-T1-003 (senior test T1): the table scrolls rather than clips at 1366 with both side panels open.
import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtSF, depthDisp, depthLabel } from '../../services/ctRun';
import { EMPTY_VALUE } from '@/lib/emptyValue';

// Per-section engine results for ONE load case: worst-point SFs with the
// governing depths the profile scan found (not just the shoe).
const DesignResultsTable = ({ caseResult, depthUnit = 'm' }) => {
  if (!caseResult) return null;
  const unit = depthLabel(depthUnit);

  const statusVariant = (status) => {
    if (status === 'PASS') return 'success';
    if (status === 'WARNING') return 'warning';
    return 'danger';
  };

  const sfColor = (val, threshold) => {
    if (val == null || !Number.isFinite(val)) return 'text-pl-muted';
    if (val >= threshold * 1.1) return 'text-pl-success-text';
    if (val >= threshold) return 'text-pl-warning-text';
    return 'text-pl-danger-text font-bold';
  };

  return (
    <div className="rounded-md border border-pl-border bg-pl-surface overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-pl-border hover:bg-transparent">
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted">Section</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted">Interval MD ({unit})</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Burst SF</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Collapse SF</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Regime</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Tension SF</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Triaxial SF</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {caseResult.sections.map((res) => (
            <TableRow key={res.sectionId || res.name} className="border-pl-border hover:bg-pl-sunken h-8">
              <TableCell className="py-1 text-xs font-medium text-pl-text">
                {res.name}
                <span className="text-pl-muted ml-2 font-pl-mono tabular-nums text-[10px]">{res.odIn}&quot; {res.weightLbFt}# {res.grade}</span>
              </TableCell>
              <TableCell className="py-1 text-xs font-pl-mono tabular-nums text-pl-muted">
                {Math.round(depthDisp(res.topMdM, depthUnit))} - {Math.round(depthDisp(res.bottomMdM, depthUnit))}
              </TableCell>
              <TableCell className={`py-1 text-xs font-pl-mono tabular-nums text-center ${sfColor(res.burstSF, 1.1)}`} data-testid={`ct-burst-sf-${res.name}`}>
                {fmtSF(res.burstSF)}
                {res.burstAtTvdM != null && (
                  <span className="text-pl-muted block text-[9px]">@ {Math.round(depthDisp(res.burstAtTvdM, depthUnit))} {unit} TVD</span>
                )}
              </TableCell>
              <TableCell className={`py-1 text-xs font-pl-mono tabular-nums text-center ${sfColor(res.collapseSF, 1.0)}`} data-testid={`ct-collapse-sf-${res.name}`}>
                {fmtSF(res.collapseSF)}
                {res.collapseAtTvdM != null && (
                  <span className="text-pl-muted block text-[9px]">@ {Math.round(depthDisp(res.collapseAtTvdM, depthUnit))} {unit} TVD</span>
                )}
              </TableCell>
              <TableCell className="py-1 text-[10px] text-center text-pl-muted">{res.collapseRegime || EMPTY_VALUE}</TableCell>
              <TableCell className={`py-1 text-xs font-pl-mono tabular-nums text-center ${sfColor(res.tensionSF, 1.6)}`}>
                {fmtSF(res.tensionSF)}
              </TableCell>
              <TableCell className={`py-1 text-xs font-pl-mono tabular-nums text-center ${sfColor(res.triaxSF, 1.25)}`} data-testid={`ct-triaxial-sf-${res.name}`}>
                {fmtSF(res.triaxSF)}
              </TableCell>
              <TableCell className="py-1 text-center">
                <Badge variant={statusVariant(res.status)} className="text-[10px] h-5 px-1.5">
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
