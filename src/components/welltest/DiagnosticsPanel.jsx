// Left rail for the Diagnostics tab: derivative smoothing and overlay control.
import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel, fmt } from './primitives';

const DiagnosticsPanel = () => {
  const { testConfig, setTestField } = useWellTestStudio();
  const L = fmt.num(testConfig.smoothingL);

  return (
    <div className="space-y-6">
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
