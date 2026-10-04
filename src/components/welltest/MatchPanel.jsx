// Left rail for the Match tab: model selection, manual match parameters and
// the auto-fit trigger. Parameter metadata (labels, units, bounds) comes from
// the model catalog, so new WT3 models appear here without UI changes.
import React from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { MODEL_CATALOG, WELLBORE_STORAGE_MODELS, splitModelId, composeModelId } from '@/utils/welltest/models/modelCatalog';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, kindForCatalogUnit } from '@/utils/welltest/units';
import { SectionLabel, UnitInput, fmt } from './primitives';

// Slider position <-> value mapping honoring the catalog's log-scale flag.
const toSlider = (meta, value) => {
  const v = fmt.num(value);
  if (!Number.isFinite(v)) return 0;
  if (meta.logScale) {
    const lo = Math.log10(meta.min);
    const hi = Math.log10(meta.max);
    return (Math.log10(Math.min(Math.max(v, meta.min), meta.max)) - lo) / (hi - lo);
  }
  return (Math.min(Math.max(v, meta.min), meta.max) - meta.min) / (meta.max - meta.min);
};

const fromSlider = (meta, frac) => {
  if (meta.logScale) {
    const lo = Math.log10(meta.min);
    const hi = Math.log10(meta.max);
    return Math.pow(10, lo + frac * (hi - lo)).toPrecision(3);
  }
  return (meta.min + frac * (meta.max - meta.min)).toFixed(2);
};

const MatchPanel = () => {
  const { matchInputs, setMatchField, model, runAutoFit, isFitting, prepared, unitSystem } = useWellTestStudio();
  const { baseId, wellbore } = splitModelId(matchInputs.modelId);
  // Display unit for a catalog parameter in the active system; state stays
  // oilfield, the slider maps the oilfield value, the text input converts.
  const displayUnit = (meta) => {
    const converted = unitLabel(kindForCatalogUnit(meta.unit), unitSystem);
    return converted || meta.unit;
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Model</SectionLabel>
        <Select value={baseId} onValueChange={(v) => setMatchField('modelId', composeModelId(v, wellbore))}>
          <SelectTrigger className="h-9" aria-label="Reservoir model"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODEL_CATALOG.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* WTA-U2-002: the wellbore storage model composes with every reservoir model */}
        <Label className="text-xs text-pl-muted mt-3 block">Wellbore storage</Label>
        <Select value={wellbore} onValueChange={(v) => setMatchField('modelId', composeModelId(baseId, v))}>
          <SelectTrigger className="h-9" aria-label="Wellbore storage model" data-testid="wts-wellbore-model"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="constant">Constant</SelectItem>
            <SelectItem value="hegeman">Changing, Hegeman (error function)</SelectItem>
            <SelectItem value="fair">Changing, Fair (exponential)</SelectItem>
          </SelectContent>
        </Select>
        {wellbore !== 'constant' && (
          <p className="text-[11px] text-pl-muted mt-2" data-testid="wts-wellbore-note">
            C is the final storage. Ci/C above 1 is decreasing storage (the dp curve climbs from a lower unit slope to a higher one and the derivative rises above it); below 1 the phase redistribution pressure can overshoot (the hump). The change time sets when the storage changes. {WELLBORE_STORAGE_MODELS[wellbore]?.reference}.
          </p>
        )}
        {model && (
          <p className="text-[11px] text-pl-muted mt-2">{model.wellbore}. {model.boundary}.</p>
        )}
      </section>

      <section>
        <SectionLabel>Match parameters</SectionLabel>
        <div className="space-y-4">
          {model.parameters.map((meta) => (
            <div key={meta.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-pl-muted">{meta.label} ({displayUnit(meta)})</Label>
                <UnitInput
                  kind={kindForCatalogUnit(meta.unit)} system={unitSystem}
                  value={matchInputs[meta.key] ?? ''}
                  onChange={(v) => setMatchField(meta.key, v)}
                  className="h-7 w-24 text-right"
                  aria-label={`${meta.label} (${displayUnit(meta)})`}
                />
              </div>
              <Slider
                value={[toSlider(meta, matchInputs[meta.key])]}
                min={0} max={1} step={0.001}
                onValueChange={([f]) => setMatchField(meta.key, fromSlider(meta, f))}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-pl-muted mt-3">
          Drag to match the model curves onto the data, then refine with the regression.
        </p>
      </section>

      <section>
        <SectionLabel>Regression</SectionLabel>
        <Button
          className="w-full"
          disabled={isFitting || prepared.points.length < 8}
          onClick={runAutoFit}
        >
          <Wand2 className="w-4 h-4 mr-2" />
          {isFitting ? 'Fitting…' : 'Auto-fit model'}
        </Button>
        <p className="text-[11px] text-pl-muted mt-2">
          Levenberg-Marquardt on pressure and derivative simultaneously, started from the current manual match.
        </p>
      </section>
    </div>
  );
};

export default MatchPanel;
