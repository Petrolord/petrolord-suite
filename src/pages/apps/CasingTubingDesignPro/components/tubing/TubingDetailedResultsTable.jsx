import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { nToKN, paToMPa } from '../../services/ctRun';
import { EMPTY_VALUE } from '@/lib/emptyValue';

// The Lubinski force breakdown per operating case: piston, ballooning,
// thermal, total, length change and buckling state.
const TubingDetailedResultsTable = ({ cases }) => {
  if (!cases || cases.length === 0) {
    return <div className="p-4 text-center text-xs text-pl-muted">No tubing load cases defined.</div>;
  }

  const statusVariant = (status) => {
    if (status === 'PASS') return 'success';
    if (status === 'WARNING') return 'warning';
    return 'danger';
  };

  return (
    <div className="h-full overflow-auto custom-scrollbar">
      <Table>
        <TableHeader className="bg-pl-sunken sticky top-0 z-10">
          <TableRow className="border-pl-border hover:bg-transparent">
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted">Case</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">ΔPi (MPa)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Piston (kN)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Ballooning (kN)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Thermal (kN)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Total (kN)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">ΔL (m)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Buckling</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Stroke</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((c) => {
            const f = c.loads.forces;
            const b = c.loads.buckling;
            return (
              <TableRow key={c.loadCaseId} className="border-pl-border hover:bg-pl-sunken h-8 text-[11px]">
                <TableCell className="py-1 font-medium text-pl-text">{c.name}</TableCell>
                <TableCell className="py-1 text-right font-pl-mono tabular-nums text-pl-muted">{paToMPa(c.dPiPa).toFixed(1)}</TableCell>
                <TableCell className="py-1 text-right font-pl-mono tabular-nums text-pl-text">{nToKN(f.pistonN).toFixed(1)}</TableCell>
                <TableCell className="py-1 text-right font-pl-mono tabular-nums text-pl-text">{nToKN(f.ballooningN).toFixed(1)}</TableCell>
                <TableCell className="py-1 text-right font-pl-mono tabular-nums text-pl-text">{nToKN(f.thermalN).toFixed(1)}</TableCell>
                <TableCell className={`py-1 text-right font-pl-mono tabular-nums font-bold ${f.totalN < 0 ? 'text-pl-warning-text' : 'text-pl-text'}`}>
                  {nToKN(f.totalN).toFixed(1)}
                </TableCell>
                <TableCell className="py-1 text-right font-pl-mono tabular-nums text-pl-muted">
                  {c.loads.lengthChanges.totalM.toFixed(2)}
                </TableCell>
                <TableCell className={`py-1 text-center ${b.state === 'helical' ? 'text-pl-danger-text' : b.state === 'sinusoidal' ? 'text-pl-warning-text' : 'text-pl-success-text'}`}>
                  {b.state}
                </TableCell>
                <TableCell className="py-1 text-center text-pl-muted">
                  {c.loads.packer.strokeOk == null ? EMPTY_VALUE : (c.loads.packer.strokeOk ? 'ok' : 'exceeded')}
                </TableCell>
                <TableCell className="py-1 text-center">
                  <Badge variant={statusVariant(c.status)} className="text-[9px] h-4 px-1 py-0">
                    {c.status}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-[10px] text-pl-muted px-3 py-2">
        Sign convention: positive force = added tension at the packer; negative ΔL = string shortening. Buckling onset uses the Dawson-Paslay and helical limits with the real tubing-casing radial clearance.
      </p>
    </div>
  );
};

export default TubingDetailedResultsTable;
