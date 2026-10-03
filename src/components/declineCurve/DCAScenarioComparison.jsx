import { formatDecline, declineBasisLabel } from '@/utils/declineCurve/declineDisplay';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import React from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { exportScenarioComparison } from '@/utils/declineCurve/dcaExport';

const DCAScenarioComparison = () => {
  const { scenarios, selectedScenarios, selectedStream, currentWell } = useDeclineCurve();
  const u = useDcaUnits();
  const vol = (v) => (Number.isFinite(v) ? Math.round(u.volumeTo(selectedStream, v)).toLocaleString() : EMPTY_VALUE);
  
  const relevantScenarios = scenarios.filter(s => selectedScenarios.includes(s.id) && s.stream === selectedStream);

  if (relevantScenarios.length === 0) {
    return <div className="text-center text-pl-muted text-sm py-8">Select scenarios to compare</div>;
  }

  const handleExport = () => {
    exportScenarioComparison(relevantScenarios, currentWell?.name || 'Well', u);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-pl-text">Scenario Comparison</h3>
        <Button variant="ghost" size="sm" onClick={handleExport} className="h-6 text-xs gap-1">
          <Download size={12} /> Export
        </Button>
      </div>

      <div className="rounded-md border border-pl-border bg-pl-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs h-8">Scenario</TableHead>
              <TableHead className="text-xs h-8 text-right">qi ({u.rateLabel(selectedStream)})</TableHead>
              <TableHead className="text-xs h-8 text-right">Di ({declineBasisLabel(u)})</TableHead>
              <TableHead className="text-xs h-8 text-right">b</TableHead>
              <TableHead className="text-xs h-8 text-right">Remaining ({u.volumeLabel(selectedStream)})</TableHead>
              <TableHead className="text-xs h-8 text-right">EUR ({u.volumeLabel(selectedStream)})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relevantScenarios.map(s => (
              <TableRow key={s.id}>
                <TableCell className="py-2 text-xs font-medium text-pl-text">{s.name}</TableCell>
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums">{u.rateTo(selectedStream, s.fitResults.qi).toFixed(1)}</TableCell>
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums">{formatDecline(s.fitResults.Di, u)}</TableCell>
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums">{s.fitResults.b.toFixed(2)}</TableCell>
                {/* H3: the stored `eur` key is the remaining volume; EUR adds the produced volume */}
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums">{vol(s.forecastResults.remaining ?? s.forecastResults.eur)}</TableCell>
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums font-semibold">{vol(s.forecastResults.eurTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DCAScenarioComparison;