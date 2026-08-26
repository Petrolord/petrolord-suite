// Read-only monthly aggregation of the imported per-well ledger (V2):
// what buildFieldPeriods produced, with per-period VRRs, rolling VRR and
// the operator target-band flag.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const FLAG_STYLE = {
  under: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  'in-band': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  over: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
};

const FLAG_LABEL = { under: 'Under', 'in-band': 'In band', over: 'Over' };

const HEADS = ['Month', 'Oil (STB)', 'Water (STB)', 'Gas (Mscf)', 'Water Inj (bbl)', 'Gas Inj (Mscf)', 'Inst. VRR', 'Rolling', 'Cum. VRR', 'vs Target'];

const LedgerSummaryPanel = () => {
  const { series, rolling, flags, targetBand } = useVrrMonitor();

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Monthly field ledger
          <span className="text-xs font-normal text-slate-500 ml-2">
            target band {targetBand.min.toFixed(2)}–{targetBand.max.toFixed(2)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              {HEADS.map((h) => (
                <TableHead key={h} className="text-slate-400 whitespace-nowrap text-right first:text-left">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((row, i) => (
              <TableRow key={row.label} className="border-slate-800">
                <TableCell className="font-mono text-slate-300">{row.label}</TableCell>
                <TableCell className="text-right font-mono text-slate-400">{fmt(row.Np)}</TableCell>
                <TableCell className="text-right font-mono text-slate-400">{fmt(row.Wp)}</TableCell>
                <TableCell className="text-right font-mono text-slate-400">{fmt(row.Gp)}</TableCell>
                <TableCell className="text-right font-mono text-slate-400">{fmt(row.Wi)}</TableCell>
                <TableCell className="text-right font-mono text-slate-400">{fmt(row.Gi)}</TableCell>
                <TableCell className="text-right font-mono text-slate-200">{fmt(row.instantaneousVRR, 2)}</TableCell>
                <TableCell className="text-right font-mono text-slate-300">{fmt(rolling[i], 2)}</TableCell>
                <TableCell className="text-right font-mono text-slate-300">{fmt(row.cumulativeVRR, 2)}</TableCell>
                <TableCell className="text-right">
                  {flags[i] ? (
                    <span className={`inline-block text-[11px] px-2 py-0.5 rounded border ${FLAG_STYLE[flags[i]]}`}>
                      {FLAG_LABEL[flags[i]]}
                    </span>
                  ) : <span className="text-slate-600">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-slate-500 mt-3">
          Aggregated by calendar month from the imported per-well rows. Adjust the target band and
          rolling window in the left rail; edit source data in your CSV and re-import.
        </p>
      </CardContent>
    </Card>
  );
};

export default LedgerSummaryPanel;
