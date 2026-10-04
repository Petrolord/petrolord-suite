// Read-only monthly aggregation of the imported per-well ledger (V2):
// what buildFieldPeriods produced, with per-period VRRs, rolling VRR and
// the operator target-band flag.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { THEMED_TONE } from '@/components/studio/studioTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const FLAG_LABEL = { under: 'Under', 'in-band': 'In band', over: 'Over' };

// Design system: the same flags on the status roles.
const FLAG_TONE = { under: 'warn', 'in-band': 'good', over: 'info' };


const NUM = 'text-right font-pl-mono tabular-nums';

const LedgerSummaryPanel = () => {
  const { series, rolling, flags, targetBand, u, withheld, ledger } = useVrrMonitor();
  const HEADS = ['Month', u.head('Oil', 'oil'), u.head('Water', 'water'), u.head('Gas', 'gas'), u.head('Water Inj', 'water'), u.head('Gas Inj', 'gas'), u.head('Produced', 'reservoir'), u.head('Injected', 'reservoir'), 'Inst. VRR', 'Rolling', 'Cum. VRR', 'vs Target'];
  const gd = u.system === 'si' ? 2 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Monthly field ledger
          <span className="text-xs font-normal text-pl-muted ml-2">
            target band {targetBand.min.toFixed(2)} to {targetBand.max.toFixed(2)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {HEADS.map((h) => (
                <TableHead key={h} className="whitespace-nowrap text-right first:text-left">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((row, i) => (
              <TableRow key={row.label}>
                <TableCell className="font-pl-mono tabular-nums whitespace-nowrap">{row.label}</TableCell>
                <TableCell className={NUM}>{fmt(u.show('oil', row.Np))}</TableCell>
                <TableCell className={NUM}>{fmt(u.show('water', row.Wp))}</TableCell>
                <TableCell className={NUM}>{fmt(u.show('gas', row.Gp), gd)}</TableCell>
                <TableCell className={NUM}>{fmt(u.show('water', row.Wi))}</TableCell>
                <TableCell className={NUM}>{fmt(u.show('gas', row.Gi), gd)}</TableCell>
                <TableCell className={NUM}>{fmt(u.show('reservoir', ledger.rows[i]?.producedRB))}</TableCell>
                <TableCell className={NUM}>{fmt(u.show('reservoir', ledger.rows[i]?.injectedRB))}</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums font-semibold">{withheld ? EMPTY_VALUE : fmt(row.instantaneousVRR, 2)}</TableCell>
                <TableCell className={NUM}>{withheld ? EMPTY_VALUE : fmt(rolling[i], 2)}</TableCell>
                <TableCell className={NUM}>{withheld ? EMPTY_VALUE : fmt(row.cumulativeVRR, 2)}</TableCell>
                <TableCell className="text-right">
                  {flags[i] ? (
                    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded border ${THEMED_TONE[FLAG_TONE[flags[i]]]}`}>
                      {FLAG_LABEL[flags[i]]}
                    </span>
                  ) : <span className="text-pl-muted">{EMPTY_VALUE}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-pl-muted mt-3">
          Aggregated by calendar month from the imported per-well rows; produced and injected in reservoir volume at
          each month's FVFs. The full ledger by term, with the FVFs and a provenance header, is on the Report tab (Ledger
          CSV). Adjust the target band and rolling window in the left rail; edit source data in your file and re-import.
        </p>
      </CardContent>
    </Card>
  );
};

export default LedgerSummaryPanel;
