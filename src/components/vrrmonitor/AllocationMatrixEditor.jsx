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
import { useStudioTheme, THEMED_TONE, THEMED_TONE_TEXT } from '@/components/studio/studioTheme';

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? '-' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const AllocationMatrixEditor = () => {
  const { inputs, ledgerWells, allocationCheck, setAllocationCell, evenSplitInjector } = useVrrMonitor();
  const { injectors, producers } = ledgerWells;
  const { tc } = useStudioTheme();

  if (!injectors.length || !producers.length) {
    return null;
  }

  const audit = allocateInjection(inputs.wellRows, inputs.allocation);

  return (
    <Card className={tc('bg-slate-900 border-slate-800', undefined)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Allocation factors
          <span className={tc('text-xs font-normal text-slate-500 ml-2', 'text-xs font-normal text-pl-muted ml-2')}>fraction of each injector's volume reaching each producer</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto space-y-3">
        <Table>
          <TableHeader>
            <TableRow className={tc('border-slate-800 hover:bg-transparent', 'hover:bg-transparent')}>
              <TableHead className={tc('text-slate-400', undefined)}>Injector</TableHead>
              {producers.map((p) => (
                <TableHead key={p} className={tc('text-slate-400 text-right whitespace-nowrap', 'text-right whitespace-nowrap normal-case')}>{p}</TableHead>
              ))}
              <TableHead className={tc('text-slate-400 text-right', 'text-right')}>Row sum</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {injectors.map((inj) => {
              const sum = allocationCheck.rowSums[inj] || 0;
              const over = sum > 1 + 1e-9;
              const partial = sum > 0 && sum < 1 - 1e-9;
              return (
                <TableRow key={inj} className={tc('border-slate-800', undefined)}>
                  <TableCell className={tc('font-mono text-slate-300', 'font-pl-mono')}>{inj}</TableCell>
                  {producers.map((prod) => (
                    <TableCell key={prod} className="p-1 text-right">
                      <Input
                        value={inputs.allocation[inj]?.[prod] ?? ''}
                        onChange={(e) => setAllocationCell(inj, prod, e.target.value)}
                        placeholder="0"
                        className={tc(`h-8 w-20 text-right bg-slate-800 ${over ? 'border-red-500/60' : 'border-slate-700'}`, `h-8 w-20 text-right font-pl-mono tabular-nums ${over ? 'border-pl-danger' : ''}`)}
                        aria-label={`Allocation ${inj} to ${prod}`}
                        aria-invalid={over || undefined}
                      />
                    </TableCell>
                  ))}
                  <TableCell className={tc(`text-right font-mono ${over ? 'text-red-400' : partial ? 'text-amber-400' : sum > 0 ? 'text-emerald-400' : 'text-slate-600'}`, `text-right font-pl-mono tabular-nums ${THEMED_TONE_TEXT[over ? 'danger' : partial ? 'warn' : sum > 0 ? 'good' : 'neutral']}`)}>
                    {sum > 0 ? sum.toFixed(3) : '-'}
                  </TableCell>
                  <TableCell className="p-1 text-right">
                    <Button
                      variant="ghost" size="sm" className={tc('h-7 text-xs text-slate-400', 'h-7 text-xs')}
                      onClick={() => evenSplitInjector(inj, producers)}
                      title={`Split ${inj} evenly across all producers. This is your choice; the engine assumes no split.`}
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
          <div key={`e${i}`} className={tc('text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-1.5', `text-xs border rounded px-3 py-1.5 ${THEMED_TONE.danger}`)}>{e}</div>
        ))}
        {allocationCheck.warnings.map((w, i) => (
          <div key={`w${i}`} className={tc('text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5', `text-xs border rounded px-3 py-1.5 ${THEMED_TONE.warn}`)}>{w}</div>
        ))}

        <p className={tc('text-xs text-slate-500', 'text-xs text-pl-muted')}>
          Conservation audit: {fmt(Object.values(audit.perProducer).reduce((s, v) => s + v.winj_stb, 0))} bbl water
          + {fmt(Object.values(audit.perProducer).reduce((s, v) => s + v.ginj_mscf, 0))} Mscf gas allocated;
          {' '}{fmt(audit.unallocated.winj_stb)} bbl + {fmt(audit.unallocated.ginj_mscf)} Mscf unallocated (out-of-zone).
        </p>
      </CardContent>
    </Card>
  );
};

export default AllocationMatrixEditor;
