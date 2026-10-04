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
import { THEMED_TONE, THEMED_TONE_TEXT } from '@/components/studio/studioTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const AllocationMatrixEditor = () => {
  const { inputs, ledgerWells, allocationCheck, setAllocationCell, evenSplitInjector, u, canWrite } = useVrrMonitor();
  const { injectors, producers } = ledgerWells;

  if (!injectors.length || !producers.length) {
    return null;
  }

  const audit = allocateInjection(inputs.wellRows, inputs.allocation);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Allocation factors
          <span className="text-xs font-normal text-pl-muted ml-2">fraction of each injector's volume reaching each producer</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto space-y-3">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Injector</TableHead>
              {producers.map((p) => (
                <TableHead key={p} className="text-right whitespace-nowrap normal-case">{p}</TableHead>
              ))}
              <TableHead className="text-right">Row sum</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {injectors.map((inj) => {
              const sum = allocationCheck.rowSums[inj] || 0;
              const over = sum > 1 + 1e-9;
              const partial = sum > 0 && sum < 1 - 1e-9;
              return (
                <TableRow key={inj}>
                  <TableCell className="font-pl-mono">{inj}</TableCell>
                  {producers.map((prod) => (
                    <TableCell key={prod} className="p-1 text-right">
                      <Input
                        value={inputs.allocation[inj]?.[prod] ?? ''}
                        onChange={(e) => setAllocationCell(inj, prod, e.target.value)}
                        placeholder="0"
                        className={`h-8 w-20 text-right font-pl-mono tabular-nums ${over ? 'border-pl-danger' : ''}`}
                        aria-label={`Allocation ${inj} to ${prod}`}
                        aria-invalid={over || undefined}
                        disabled={!canWrite}
                      />
                    </TableCell>
                  ))}
                  <TableCell className={`text-right font-pl-mono tabular-nums ${THEMED_TONE_TEXT[over ? 'danger' : partial ? 'warn' : sum > 0 ? 'good' : 'neutral']}`}>
                    {sum > 0 ? sum.toFixed(3) : EMPTY_VALUE}
                  </TableCell>
                  <TableCell className="p-1 text-right">
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => evenSplitInjector(inj, producers)}
                      disabled={!canWrite}
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
          <div key={`e${i}`} className={`text-xs border rounded px-3 py-1.5 ${THEMED_TONE.danger}`}>{e}</div>
        ))}
        {allocationCheck.warnings.map((w, i) => (
          <div key={`w${i}`} className={`text-xs border rounded px-3 py-1.5 ${THEMED_TONE.warn}`}>{w}</div>
        ))}

        <p className="text-xs text-pl-muted">
          Conservation audit: {fmt(u.show('water', Object.values(audit.perProducer).reduce((s, v) => s + v.winj_stb, 0)))} {u.label('water')} water
          + {fmt(u.show('gas', Object.values(audit.perProducer).reduce((s, v) => s + v.ginj_mscf, 0)))} {u.label('gas')} gas allocated;
          {' '}{fmt(u.show('water', audit.unallocated.winj_stb))} {u.label('water')} + {fmt(u.show('gas', audit.unallocated.ginj_mscf))} {u.label('gas')} unallocated (out-of-zone).
        </p>
      </CardContent>
    </Card>
  );
};

export default AllocationMatrixEditor;
