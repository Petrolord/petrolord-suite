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
import { MODEL_CATALOG } from '@/utils/welltest/models/modelCatalog';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel, fmt } from './primitives';

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
  const { matchInputs, setMatchField, model, runAutoFit, isFitting, prepared } = useWellTestStudio();

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Model</SectionLabel>
        <Select value={matchInputs.modelId} onValueChange={(v) => setMatchField('modelId', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODEL_CATALOG.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {model && (
          <p className="text-[11px] text-slate-500 mt-2">{model.wellbore}. {model.boundary}.</p>
        )}
      </section>

      <section>
        <SectionLabel>Match parameters</SectionLabel>
        <div className="space-y-4">
          {model.parameters.map((meta) => (
            <div key={meta.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-slate-400">{meta.label} ({meta.unit})</Label>
                <Input
                  value={matchInputs[meta.key] ?? ''}
                  onChange={(e) => setMatchField(meta.key, e.target.value)}
                  className="h-7 w-24 text-right bg-slate-800 border-slate-700"
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
        <p className="text-[11px] text-slate-500 mt-3">
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
        <p className="text-[11px] text-slate-500 mt-2">
          Levenberg-Marquardt on pressure and derivative simultaneously, started from the current manual match.
        </p>
      </section>
    </div>
  );
};

export default MatchPanel;
