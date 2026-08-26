// Injector x producer allocation matrix (V4). Fractions are the
// operator's judgement; each injector row should sum to <= 1 (shortfall =
// out-of-zone, shown in the audit line). The Even split button is an
// explicit user action — the engine itself never assumes splits.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { allocateInjection } from '@/utils/vrrCalculations';

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const AllocationMatrixEditor = () => {
  const { inputs, ledgerWells, allocationCheck, setAllocationCell, evenSplitInjector } = useVrrMonitor();
  const { injectors, producers } = ledgerWells;

  if (!injectors.length || !producers.length) {
    return null;
  }

  const audit = allocateInjection(inputs.wellRows, inputs.allocation);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Allocation factors
          <span className="text-xs font-normal text-slate-500 ml-2">fraction of each injector's volume reaching each producer</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto space-y-3">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-400">Injector</TableHead>
              {producers.map((p) => (
                <TableHead key={p} className="text-slate-400 text-right whitespace-nowrap">{p}</TableHead>
              ))}
              <TableHead className="text-slate-400 text-right">Row sum</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {injectors.map((inj) => {
              const sum = allocationCheck.rowSums[inj] || 0;
              const over = sum > 1 + 1e-9;
              const partial = sum > 0 && sum < 1 - 1e-9;
              return (
                <TableRow key={inj} className="border-slate-800">
                  <TableCell className="font-mono text-slate-300">{inj}</TableCell>
                  {producers.map((prod) => (
                    <TableCell key={prod} className="p-1 text-right">
                      <Input
                        value={inputs.allocation[inj]?.[prod] ?? ''}
                        onChange={(e) => setAllocationCell(inj, prod, e.target.value)}
                        placeholder="0"
                        className={`h-8 w-20 text-right bg-slate-800 ${over ? 'border-red-500/60' : 'border-slate-700'}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell className={`text-right font-mono ${over ? 'text-red-400' : partial ? 'text-amber-400' : sum > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {sum > 0 ? sum.toFixed(3) : '—'}
                  </TableCell>
                  <TableCell className="p-1 text-right">
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs text-slate-400"
                      onClick={() => evenSplitInjector(inj, producers)}
                      title={`Split ${inj} evenly across all producers (your call, not the engine's)`}
                    >
                      Even split
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {allocationCheck.errors.map((e, i) => (
          <div key={`e${i}`} className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-1.5">{e}</div>
        ))}
        {allocationCheck.warnings.map((w, i) => (
          <div key={`w${i}`} className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5">{w}</div>
        ))}

        <p className="text-xs text-slate-500">
          Conservation audit: {fmt(Object.values(audit.perProducer).reduce((s, v) => s + v.winj_stb, 0))} bbl water
          + {fmt(Object.values(audit.perProducer).reduce((s, v) => s + v.ginj_mscf, 0))} Mscf gas allocated;
          {' '}{fmt(audit.unallocated.winj_stb)} bbl + {fmt(audit.unallocated.ginj_mscf)} Mscf unallocated (out-of-zone).
        </p>
      </CardContent>
    </Card>
  );
};

export default AllocationMatrixEditor;
