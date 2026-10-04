// Left-rail inputs for the Pattern Forecast tab: flood-element geometry,
// FVFs, injection rate, fill-up gas, vertical sweep, run limits.
import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Beaker } from 'lucide-react';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { samplePatternData } from '@/utils/patternForecastCalculations';
import { UField, SectionLabel, fmt } from './primitives';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MOBILITY_BASES } from '@/utils/waterflooddesign/model';
import PvtIntakePanel from './PvtIntakePanel';

const GEO_FIELDS = [
  { k: 'area_acres', label: 'Pattern area', kind: 'area' },
  { k: 'h_ft', label: 'Net thickness', kind: 'length' },
  { k: 'phi', label: 'Porosity', kind: 'fraction' },
];
const FLUID_FIELDS = [
  { k: 'Bo', label: 'Bo', kind: 'fvfOil' },
  { k: 'Bw', label: 'Bw', kind: 'fvfOil' },
];
const OP_FIELDS = [
  { k: 'iw_bpd', label: 'Injection rate', kind: 'resRate' },
  { k: 'Sgi', label: 'Initial gas Sgi', kind: 'fraction' },
  { k: 'EV', label: 'Vertical sweep EV (0-1)', kind: 'dimensionless' },
  { k: 'worLimit', label: 'WOR economic limit (STB/STB)', kind: 'dimensionless' },
  { k: 'maxYears', label: 'Horizon', kind: 'years' },
];

const PatternPanel = () => {
  const { patternInputs, setPatternField, layeredResult, addNotification, u, migratedFrom } = useWaterfloodDesign();

  const loadSample = () => {
    const s = samplePatternData().pattern;
    Object.entries(s).forEach(([k, v]) => setPatternField(k, String(v)));
    setPatternField('mobilityBasis', 'craig');
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
          {GEO_FIELDS.map((f) => <UField key={f.k} label={f.label} kind={f.kind} u={u} testId={`wds-${f.k}`} value={patternInputs[f.k]} onChange={(v) => setPatternField(f.k, v)} />)}
          {FLUID_FIELDS.map((f) => <UField key={f.k} label={f.label} kind={f.kind} u={u} testId={`wds-${f.k}`} value={patternInputs[f.k]} onChange={(v) => setPatternField(f.k, v)} />)}
        </div>
      </section>

      <section>
        <SectionLabel>Operation</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {OP_FIELDS.map((f) => <UField key={f.k} label={f.label} kind={f.kind} u={u} testId={`wds-${f.k}`} value={patternInputs[f.k]} onChange={(v) => setPatternField(f.k, v)} />)}
        </div>
        {dpHint != null && (
          <Label className="text-[11px] text-pl-muted leading-snug block mt-2">
            Hint: the Layered Sweep tab's mid-stage Dykstra-Parsons coverage is {fmt.pct(dpHint)}; a coverage value can be used as EV.
          </Label>
        )}
      </section>

      <section data-testid="wds-mobility-basis">
        <SectionLabel>Mobility ratio for the areal sweep</SectionLabel>
        <Tabs value={patternInputs.mobilityBasis === 'endpoint' ? 'endpoint' : 'craig'} onValueChange={(v) => setPatternField('mobilityBasis', v)}>
          <TabsList className="h-8 p-0.5 w-full">
            <TabsTrigger value="craig" className="h-7 text-xs flex-1">Craig (at Sw behind front)</TabsTrigger>
            <TabsTrigger value="endpoint" className="h-7 text-xs flex-1">Endpoint</TabsTrigger>
          </TabsList>
        </Tabs>
        <Label className="text-[11px] text-pl-muted leading-snug block mt-2">
          {MOBILITY_BASES[patternInputs.mobilityBasis === 'endpoint' ? 'endpoint' : 'craig']}. The five-spot correlation was built on
          Craig's definition.
          {migratedFrom && patternInputs.mobilityBasis === 'endpoint'
            ? ' This project was saved before October 2026 and keeps the endpoint basis it was computed with; switch to Craig to use the correlation as published.'
            : ''}
        </Label>
      </section>

      <PvtIntakePanel target="pattern" />

      <section>
        <Button variant="outline" size="sm" onClick={loadSample} className="w-full">
          <Beaker className="w-4 h-4 mr-1" /> Sample pattern
        </Button>
      </section>

      <section>
        <Label className="text-[11px] text-pl-muted leading-snug block">
          The displacement (rel-perm, fluids, dip, polymer) comes from the Displacement tab. Areal sweep uses the published
          five-spot correlations; the forecast is a screening-level analytical composite. It is not a simulation.
        </Label>
      </section>
    </div>
  );
};

export default PatternPanel;
