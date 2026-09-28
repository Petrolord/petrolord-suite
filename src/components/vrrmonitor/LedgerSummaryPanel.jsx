// Read-only monthly aggregation of the imported per-well ledger (V2):
// what buildFieldPeriods produced, with per-period VRRs, rolling VRR and
// the operator target-band flag.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { THEMED_TONE } from '@/components/studio/studioTheme';

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? '-' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const FLAG_STYLE = {
  under: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  'in-band': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  over: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
};

const FLAG_LABEL = { under: 'Under', 'in-band': 'In band', over: 'Over' };

// Design system: the same flags on the status roles.
const FLAG_TONE = { under: 'warn', 'in-band': 'good', over: 'info' };

const HEADS = ['Month', 'Oil (STB)', 'Water (STB)', 'Gas (Mscf)', 'Water Inj (bbl)', 'Gas Inj (Mscf)', 'Inst. VRR', 'Rolling', 'Cum. VRR', 'vs Target'];

const NUM = 'text-right font-pl-mono tabular-nums';

const LedgerSummaryPanel = () => {
  const { series, rolling, flags, targetBand } = useVrrMonitor();

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
                <TableCell className={NUM}>{fmt(row.Np)}</TableCell>
                <TableCell className={NUM}>{fmt(row.Wp)}</TableCell>
                <TableCell className={NUM}>{fmt(row.Gp)}</TableCell>
                <TableCell className={NUM}>{fmt(row.Wi)}</TableCell>
                <TableCell className={NUM}>{fmt(row.Gi)}</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums font-semibold">{fmt(row.instantaneousVRR, 2)}</TableCell>
                <TableCell className={NUM}>{fmt(rolling[i], 2)}</TableCell>
                <TableCell className={NUM}>{fmt(row.cumulativeVRR, 2)}</TableCell>
                <TableCell className="text-right">
                  {flags[i] ? (
                    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded border ${THEMED_TONE[FLAG_TONE[flags[i]]]}`}>
                      {FLAG_LABEL[flags[i]]}
                    </span>
                  ) : <span className="text-pl-muted">-</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-pl-muted mt-3">
          Aggregated by calendar month from the imported per-well rows. Adjust the target band and
          rolling window in the left rail; edit source data in your CSV and re-import.
        </p>
      </CardContent>
    </Card>
  );
};

export default LedgerSummaryPanel;
