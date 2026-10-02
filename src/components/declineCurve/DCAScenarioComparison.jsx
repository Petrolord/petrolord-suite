import { formatNominalAnnual, DI_BASIS_LABEL } from '@/utils/declineCurve/declineDisplay';
import React from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { exportScenarioComparison } from '@/utils/declineCurve/dcaExport';

const DCAScenarioComparison = () => {
  const { scenarios, selectedScenarios, selectedStream, currentWell } = useDeclineCurve();
  
  const relevantScenarios = scenarios.filter(s => selectedScenarios.includes(s.id) && s.stream === selectedStream);

  if (relevantScenarios.length === 0) {
    return <div className="text-center text-pl-muted text-sm py-8">Select scenarios to compare</div>;
  }

  const handleExport = () => {
    exportScenarioComparison(relevantScenarios, currentWell?.name || 'Well');
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
              <TableHead className="text-xs h-8 text-right">Qi</TableHead>
              <TableHead className="text-xs h-8 text-right">Di ({DI_BASIS_LABEL})</TableHead>
              <TableHead className="text-xs h-8 text-right">b</TableHead>
              <TableHead className="text-xs h-8 text-right">Remaining</TableHead>
              <TableHead className="text-xs h-8 text-right">EUR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relevantScenarios.map(s => (
              <TableRow key={s.id}>
                <TableCell className="py-2 text-xs font-medium text-pl-text">{s.name}</TableCell>
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums">{s.fitResults.qi.toFixed(1)}</TableCell>
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums">{formatNominalAnnual(s.fitResults.Di, 1)}</TableCell>
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums">{s.fitResults.b.toFixed(2)}</TableCell>
                {/* H3: the stored `eur` key is the remaining volume; EUR adds the produced volume */}
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums">{s.forecastResults.eur.toLocaleString(undefined, {maximumFractionDigits:0})}</TableCell>
                <TableCell className="py-2 text-xs text-right font-pl-mono tabular-nums font-semibold">{Number.isFinite(s.forecastResults.eurTotal) ? s.forecastResults.eurTotal.toLocaleString(undefined, {maximumFractionDigits:0}) : EMPTY_VALUE}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DCAScenarioComparison;