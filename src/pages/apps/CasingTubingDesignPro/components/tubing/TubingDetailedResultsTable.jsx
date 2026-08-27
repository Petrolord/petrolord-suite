import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { nToKN, paToMPa } from '../../services/ctRun';

// The Lubinski force breakdown per operating case: piston, ballooning,
// thermal, total, length change and buckling state.
const TubingDetailedResultsTable = ({ cases }) => {
  if (!cases || cases.length === 0) {
    return <div className="p-4 text-center text-xs text-slate-500">No tubing load cases defined.</div>;
  }

  const getStatusColor = (status) => {
    if (status === 'PASS') return 'bg-emerald-900/30 text-emerald-400 border-emerald-800';
    if (status === 'WARNING') return 'bg-amber-900/30 text-amber-400 border-amber-800';
    return 'bg-red-900/30 text-red-400 border-red-800';
  };

  return (
    <div className="h-full overflow-auto custom-scrollbar">
      <Table>
        <TableHeader className="bg-slate-900 sticky top-0 z-10">
          <TableRow className="border-slate-800 hover:bg-transparent">
            <TableHead className="h-8 text-[10px] font-bold text-slate-400">Case</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">ΔPi (MPa)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Piston (kN)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Ballooning (kN)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Thermal (kN)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Total (kN)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">ΔL (m)</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Buckling</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Stroke</TableHead>
            <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((c) => {
            const f = c.loads.forces;
            const b = c.loads.buckling;
            return (
              <TableRow key={c.loadCaseId} className="border-slate-800 hover:bg-slate-800/50 h-8 text-[11px]">
                <TableCell className="py-1 font-medium text-slate-200">{c.name}</TableCell>
                <TableCell className="py-1 text-right font-mono text-slate-400">{paToMPa(c.dPiPa).toFixed(1)}</TableCell>
                <TableCell className="py-1 text-right font-mono text-slate-300">{nToKN(f.pistonN).toFixed(1)}</TableCell>
                <TableCell className="py-1 text-right font-mono text-slate-300">{nToKN(f.ballooningN).toFixed(1)}</TableCell>
                <TableCell className="py-1 text-right font-mono text-slate-300">{nToKN(f.thermalN).toFixed(1)}</TableCell>
                <TableCell className={`py-1 text-right font-mono font-bold ${f.totalN < 0 ? 'text-amber-300' : 'text-slate-100'}`}>
                  {nToKN(f.totalN).toFixed(1)}
                </TableCell>
                <TableCell className="py-1 text-right font-mono text-slate-400">
                  {c.loads.lengthChanges.totalM.toFixed(2)}
                </TableCell>
                <TableCell className={`py-1 text-center ${b.state === 'helical' ? 'text-red-400' : b.state === 'sinusoidal' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {b.state}
                </TableCell>
                <TableCell className="py-1 text-center text-slate-400">
                  {c.loads.packer.strokeOk == null ? '—' : (c.loads.packer.strokeOk ? 'ok' : 'exceeded')}
                </TableCell>
                <TableCell className="py-1 text-center">
                  <Badge variant="outline" className={`text-[9px] h-4 px-1 py-0 ${getStatusColor(c.status)}`}>
                    {c.status}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-[10px] text-slate-500 px-3 py-2">
        Sign convention: positive force = added tension at the packer; negative ΔL = string shortening. Buckling onset uses the Dawson-Paslay and helical limits with the real tubing-casing radial clearance.
      </p>
    </div>
  );
};

export default TubingDetailedResultsTable;
