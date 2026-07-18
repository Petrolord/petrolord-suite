// Left rail for the Diagnostics tab: derivative smoothing, the gas
// pseudo-time abscissa (WT8) and reading guidance.
import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel, fmt } from './primitives';

const DiagnosticsPanel = () => {
  const { testConfig, setTestField, reservoirSpec } = useWellTestStudio();
  const L = fmt.num(testConfig.smoothingL);
  const isGas = reservoirSpec.reservoir?.fluid === 'gas';

  return (
    <div className="space-y-6">
      {isGas && (
        <section>
          <SectionLabel>Abscissa</SectionLabel>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Diagnostic time axis</Label>
            <Select value={testConfig.abscissa || 'time'} onValueChange={(v) => setTestField('abscissa', v)}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="time">Elapsed time</SelectItem>
                <SelectItem value="pseudo-time">Normalized pseudo-time</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500">
              Normalized pseudo-time integrates mu(p) ct(p) along the gauge pressures, correcting the late-time
              derivative of large-drawdown gas tests. The same transform is applied to the model overlay, so the
              match comparison is unaffected. Straight-line analyses stay on elapsed time.
            </p>
          </div>
        </section>
      )}
      <section>
        <SectionLabel>Derivative</SectionLabel>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-slate-400">Bourdet smoothing L</Label>
              <span className="text-xs text-slate-300 font-medium">{Number.isFinite(L) ? L.toFixed(2) : '0.10'} cycles</span>
            </div>
            <Slider
              value={[Number.isFinite(L) ? L : 0.1]}
              min={0} max={0.5} step={0.01}
              onValueChange={([v]) => setTestField('smoothingL', String(v))}
            />
            <p className="text-[11px] text-slate-500">
              Differentiation window in log cycles. 0.1 is the standard choice; raise it for noisy gauges, keep it
              under 0.3 to avoid smearing real features.
            </p>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Reading the plot</SectionLabel>
        <ul className="text-[11px] text-slate-500 space-y-2 list-disc pl-4">
          <li>Early unit slope on both curves: wellbore storage.</li>
          <li>Flat derivative: infinite-acting radial flow. The stabilization level sets kh.</li>
          <li>Half slope: linear flow (fracture or channel). Quarter slope: bilinear flow.</li>
          <li>Late derivative rising to unit slope: closed-system depletion. Falling derivative: constant-pressure support.</li>
        </ul>
      </section>
    </div>
  );
};

export default DiagnosticsPanel;
