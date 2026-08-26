import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtSF, nToKN, paToMPa } from '../../services/ctRun';

// Packer loading per operating case: the engine total tubing-to-packer
// force against the packer rating.
const PackerLoadsTable = ({ cases, ratingN }) => {
  if (!cases || cases.length === 0) {
    return <div className="p-4 text-center text-xs text-slate-500">No packer loads calculated.</div>;
  }

  return (
    <Table>
      <TableHeader className="bg-slate-900 sticky top-0 z-10">
        <TableRow className="border-slate-800 hover:bg-transparent">
          <TableHead className="h-8 text-[10px] font-bold text-slate-400">Load Case</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">ΔPi at Packer (MPa)</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">ΔPo (MPa)</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Load (kN)</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Rating (kN)</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">SF</TableHead>
          <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-center">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((c) => (
          <TableRow key={c.loadCaseId} className="border-slate-800 hover:bg-slate-800/50 h-8">
            <TableCell className="py-1 text-xs font-medium text-slate-300">{c.name}</TableCell>
            <TableCell className="py-1 text-xs text-right font-mono text-slate-400">{paToMPa(c.dPiPa).toFixed(1)}</TableCell>
            <TableCell className="py-1 text-xs text-right font-mono text-slate-400">{paToMPa(c.dPoPa).toFixed(1)}</TableCell>
            <TableCell className="py-1 text-xs text-right font-mono text-slate-300">{nToKN(c.loads.forces.totalN).toFixed(1)}</TableCell>
            <TableCell className="py-1 text-xs text-right font-mono text-slate-400">{ratingN != null ? Math.round(nToKN(ratingN)) : '—'}</TableCell>
            <TableCell className={`py-1 text-xs text-center font-mono font-bold ${c.loads.packer.sf != null && c.loads.packer.sf < 1.2 ? 'text-red-400' : 'text-emerald-400'}`}>
              {fmtSF(c.loads.packer.sf)}
            </TableCell>
            <TableCell className="py-1 text-center">
              <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${c.status === 'PASS' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-800' : c.status === 'WARNING' ? 'bg-amber-900/20 text-amber-400 border-amber-800' : 'bg-red-900/20 text-red-400 border-red-800'}`}>
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
