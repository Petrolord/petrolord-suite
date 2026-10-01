// Field and analyst for the PDF reviewer block (RCP-U1-019). Kept with
// the reservoir case (inputs.report) so a saved project reprints them.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';

export default function ReportDetails() {
  const { state, updateInputs } = useReservoirCalc();
  const report = state.inputs?.report || {};
  const set = (k, v) => updateInputs({ report: { ...report, [k]: v } });
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="rcp-report-details">
      <div>
        <Label className="text-[10px] text-pl-muted">Field (for reports)</Label>
        <Input className="h-7 text-xs" value={report.field || ''} data-testid="rcp-report-field" onChange={(e) => set('field', e.target.value)} placeholder="e.g. Keta" />
      </div>
      <div>
        <Label className="text-[10px] text-pl-muted">Analyst (for reports)</Label>
        <Input className="h-7 text-xs" value={report.analyst || ''} data-testid="rcp-report-analyst" onChange={(e) => set('analyst', e.target.value)} placeholder="your name" />
      </div>
    </div>
  );
}
