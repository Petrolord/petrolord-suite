// Field and analyst for the PDF reviewer block (RCP-U1-019). Kept with
// the reservoir case (inputs.report) so a saved project reprints them.
// RL re-check (2026-10-02): company, licence or block and well control
// complete the identification (RL4), and the source of each group of inputs
// is stated here and printed in the Source column of the reports (RL1).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { SOURCE_GROUPS } from '../../services/reportInfo';

const IDENT = [
  ['field', 'Field (for reports)', 'e.g. Keta'],
  ['analyst', 'Analyst (for reports)', 'your name'],
  ['company', 'Company', 'operator or licence holder'],
  ['licence', 'Licence or block', 'e.g. OML 143'],
  ['well', 'Well control', 'e.g. Keta-1, Keta-2'],
];

export default function ReportDetails() {
  const { state, updateInputs } = useReservoirCalc();
  const report = state.inputs?.report || {};
  const set = (k, v) => updateInputs({ report: { ...report, [k]: v } });
  const setSource = (g, v) => updateInputs({ report: { ...report, sources: { ...(report.sources || {}), [g]: v } } });
  return (
    <div className="space-y-2" data-testid="rcp-report-details">
      <div className="grid grid-cols-2 gap-2">
        {IDENT.map(([k, label, hint]) => (
          <div key={k}>
            <Label className="text-[10px] text-pl-muted">{label}</Label>
            <Input className="h-7 text-xs" value={report[k] || ''} data-testid={`rcp-report-${k}`} onChange={(e) => set(k, e.target.value)} placeholder={hint} />
          </div>
        ))}
      </div>
      <div data-testid="rcp-report-sources">
        <Label className="text-[10px] text-pl-muted">Where the inputs came from (printed in the Source column of the reports)</Label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(SOURCE_GROUPS).map(([g, spec]) => (
            <div key={g}>
              <Label className="text-[10px] text-pl-muted">{spec.label}</Label>
              <Input className="h-7 text-xs" value={report.sources?.[g] || ''} data-testid={`rcp-report-source-${g}`} onChange={(e) => setSource(g, e.target.value)}
                placeholder={g === 'structure' ? 'e.g. Top D-07 depth map, 2026' : g === 'petrophysics' ? 'e.g. Keta-1 log analysis' : g === 'fluids' ? 'e.g. PVT report, Standing' : 'e.g. analog fields'} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
