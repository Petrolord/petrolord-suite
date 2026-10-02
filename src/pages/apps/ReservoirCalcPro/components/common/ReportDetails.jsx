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
];
const MORE = [
  ['company', 'Company', 'operator or licence holder'],
  ['licence', 'Licence or block', 'e.g. OML 143'],
  ['well', 'Well control', 'e.g. Keta-1, Keta-2'],
];
const HINT = { structure: 'e.g. Top D-07 depth map, 2026', petrophysics: 'e.g. Keta-1 log analysis', fluids: 'e.g. PVT report, Standing', recovery: 'e.g. analog fields' };

export default function ReportDetails() {
  const { state, updateInputs } = useReservoirCalc();
  const report = state.inputs?.report || {};
  const set = (k, v) => updateInputs({ report: { ...report, [k]: v } });
  const setSource = (g, v) => updateInputs({ report: { ...report, sources: { ...(report.sources || {}), [g]: v } } });
  const stated = MORE.filter(([k]) => String(report[k] || '').trim()).length + Object.keys(SOURCE_GROUPS).filter((g) => String(report.sources?.[g] || '').trim()).length;
  const cell = ([k, label, hint]) => (
    <div key={k}>
      <Label className="text-[10px] text-pl-muted">{label}</Label>
      <Input className="h-7 text-xs" value={report[k] || ''} data-testid={`rcp-report-${k}`} onChange={(e) => set(k, e.target.value)} placeholder={hint} />
    </div>
  );
  // the captions below are spans with an aria-label on the field: a second
  // <label> naming porosity or recovery would shadow the input fields' own
  const quiet = (k, label, hint, value, onChange, testId) => (
    <div key={k}>
      <span className="block text-[10px] text-pl-muted">{label}</span>
      <Input className="h-7 text-xs" value={value} aria-label={label} data-testid={testId} onChange={(e) => onChange(e.target.value)} placeholder={hint} />
    </div>
  );
  return (
    <div className="space-y-2" data-testid="rcp-report-details">
      <div className="grid grid-cols-2 gap-2">{IDENT.map(cell)}</div>
      {/* closed by default, so the input panel keeps its height */}
      <details data-testid="rcp-report-more">
        <summary className="cursor-pointer text-[10px] text-pl-muted hover:text-pl-text">
          Company, licence, well control and input sources for the reports ({stated} of {MORE.length + Object.keys(SOURCE_GROUPS).length} stated)
        </summary>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">{MORE.map(([k, label, hint]) => quiet(k, label, hint, report[k] || '', (v) => set(k, v), `rcp-report-${k}`))}</div>
          <div data-testid="rcp-report-sources">
            <span className="block text-[10px] text-pl-muted">Where the inputs came from (printed in the Source column of the reports)</span>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(SOURCE_GROUPS).map(([g, spec]) => quiet(g, spec.label, HINT[g], report.sources?.[g] || '', (v) => setSource(g, v), `rcp-report-source-${g}`))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
