import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtSF, nToKN, paToMPa } from '../../services/ctRun';
import { EMPTY_VALUE } from '@/lib/emptyValue';

// Packer loading per operating case: the engine total tubing-to-packer
// force against the packer rating.
const PackerLoadsTable = ({ cases, ratingN }) => {
  if (!cases || cases.length === 0) {
    return <div className="p-4 text-center text-xs text-pl-muted">No packer loads calculated.</div>;
  }

  return (
    <Table>
      <TableHeader className="bg-pl-sunken sticky top-0 z-10">
        <TableRow className="border-pl-border hover:bg-transparent">
          <TableHead className="h-8 text-[10px] font-bold text-pl-muted">Load Case</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">ΔPi at Packer (MPa)</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">ΔPo (MPa)</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Load (kN)</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Rating (kN)</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">SF</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((c) => (
          <TableRow key={c.loadCaseId} className="border-pl-border hover:bg-pl-sunken h-8">
            <TableCell className="py-1 text-xs font-medium text-pl-text">{c.name}</TableCell>
            <TableCell className="py-1 text-xs text-right font-pl-mono tabular-nums text-pl-muted">{paToMPa(c.dPiPa).toFixed(1)}</TableCell>
            <TableCell className="py-1 text-xs text-right font-pl-mono tabular-nums text-pl-muted">{paToMPa(c.dPoPa).toFixed(1)}</TableCell>
            <TableCell className="py-1 text-xs text-right font-pl-mono tabular-nums text-pl-text">{nToKN(c.loads.forces.totalN).toFixed(1)}</TableCell>
            <TableCell className="py-1 text-xs text-right font-pl-mono tabular-nums text-pl-muted">{ratingN != null ? Math.round(nToKN(ratingN)) : EMPTY_VALUE}</TableCell>
            <TableCell className={`py-1 text-xs text-center font-pl-mono tabular-nums font-bold ${c.loads.packer.sf != null && c.loads.packer.sf < 1.2 ? 'text-pl-danger-text' : 'text-pl-success-text'}`}>
              {fmtSF(c.loads.packer.sf)}
            </TableCell>
            <TableCell className="py-1 text-center">
              <Badge variant={c.status === 'PASS' ? 'success' : c.status === 'WARNING' ? 'warning' : 'danger'} className="text-[10px] h-5 px-1.5">
                {c.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default PackerLoadsTable;
