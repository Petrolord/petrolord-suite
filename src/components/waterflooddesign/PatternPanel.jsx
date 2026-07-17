// Left-rail inputs for the Pattern Forecast tab: flood-element geometry,
// FVFs, injection rate, fill-up gas, vertical sweep, run limits.
import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Beaker } from 'lucide-react';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { samplePatternData } from '@/utils/patternForecastCalculations';
import { Field, SectionLabel, fmt } from './primitives';

const GEO_FIELDS = [
  { k: 'area_acres', label: 'Pattern area (acres)' },
  { k: 'h_ft', label: 'Net thickness (ft)' },
  { k: 'phi', label: 'Porosity (frac)' },
];
const FLUID_FIELDS = [
  { k: 'Bo', label: 'Bo (rb/stb)' },
  { k: 'Bw', label: 'Bw (rb/stb)' },
];
const OP_FIELDS = [
  { k: 'iw_bpd', label: 'Injection rate (rb/d)' },
  { k: 'Sgi', label: 'Initial gas Sgi (frac)' },
  { k: 'EV', label: 'Vertical sweep EV (0-1)' },
  { k: 'worLimit', label: 'WOR economic limit' },
  { k: 'maxYears', label: 'Horizon (years)' },
];

const PatternPanel = () => {
  const { patternInputs, setPatternField, layeredResult, addNotification } = useWaterfloodDesign();

  const loadSample = () => {
    const s = samplePatternData().pattern;
    Object.entries(s).forEach(([k, v]) => setPatternField(k, String(v)));
    addNotification('Sample pattern loaded', 'info');
  };

  const dpHint = layeredResult?.dykstraParsons?.length
    ? layeredResult.dykstraParsons[Math.floor(layeredResult.dykstraParsons.length / 2)].coverage
    : null;

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Flood element (five-spot)</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {GEO_FIELDS.map((f) => <Field key={f.k} label={f.label} value={patternInputs[f.k]} onChange={(v) => setPatternField(f.k, v)} />)}
          {FLUID_FIELDS.map((f) => <Field key={f.k} label={f.label} value={patternInputs[f.k]} onChange={(v) => setPatternField(f.k, v)} />)}
        </div>
      </section>

      <section>
        <SectionLabel>Operation</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {OP_FIELDS.map((f) => <Field key={f.k} label={f.label} value={patternInputs[f.k]} onChange={(v) => setPatternField(f.k, v)} />)}
        </div>
        {dpHint != null && (
          <Label className="text-[11px] text-slate-500 leading-snug block mt-2">
            Hint: the Layered Sweep tab's mid-stage Dykstra-Parsons coverage is {fmt.pct(dpHint)}; a coverage value can be used as EV.
          </Label>
        )}
      </section>

      <section>
        <Button variant="outline" size="sm" onClick={loadSample} className="w-full bg-slate-800 border-slate-700">
          <Beaker className="w-4 h-4 mr-1" /> Sample pattern
        </Button>
      </section>

      <section>
        <Label className="text-[11px] text-slate-500 leading-snug block">
          The displacement (rel-perm, fluids, dip, polymer) comes from the Displacement tab. Areal sweep uses the published
          five-spot correlations; the forecast is a screening-level analytical composite, not a simulation.
        </Label>
      </section>
    </div>
  );
};

export default PatternPanel;
