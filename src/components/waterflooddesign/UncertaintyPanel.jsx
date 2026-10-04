// Left-rail config for the Uncertainty tab: iteration count, per-parameter
// distributions over the working case, and the Monte Carlo run button.
// Parsing/validation lives in waterfloodUncertainty.parseUncertaintyConfig;
// this panel only edits the string-valued config the context persists.
import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play } from 'lucide-react';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { UNCERTAINTY_PARAMS } from '@/utils/waterfloodUncertainty';
import { Field, UField, SectionLabel } from './primitives';

const DIST_TYPES = [
  { value: 'triangular', label: 'Triangular' },
  { value: 'uniform', label: 'Uniform' },
  { value: 'normal', label: 'Normal' },
  { value: 'lognormal', label: 'Lognormal' },
];

// Seed a freshly enabled parameter from its working-case value so the user
// starts from a sensible plus/minus 20% spread instead of blank fields.
function seedFromBase(base) {
  const b = parseFloat(base);
  if (!Number.isFinite(b) || b === 0) return { type: 'triangular', min: '', mode: '', max: '', mean: '', stdDev: '' };
  const r = (v) => String(Number(v.toPrecision(4)));
  return {
    type: 'triangular',
    min: r(b * 0.8), mode: r(b), max: r(b * 1.2),
    mean: r(b), stdDev: r(Math.abs(b) * 0.1),
  };
}

// WF-U2-014 (closes WF-U1-021): the distribution values in the display units,
// stored oilfield like every input (every kind here converts by a factor, so a
// standard deviation converts as a value does)
export const ParamRow = ({ def, cfg, base, disabled, onToggle, onPatch, u }) => {
  const enabled = !!cfg?.enabled;
  const type = cfg?.type || 'triangular';
  const F = ({ label, field }) => (
    <UField label={label} kind={def.kind} u={u} value={cfg[field] ?? ''} onChange={(v) => onPatch(def.key, { [field]: v })} testId={`wds-mc-${def.key}-${field}`} />
  );
  return (
    <div className={`rounded-md border px-2.5 py-2 ${enabled ? 'border-pl-border bg-pl-sunken' : 'border-pl-border'} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-pl-text">{u ? u.head(def.name, def.kind) : def.label}</span>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(v) => onToggle(def.key, v, base)}
          aria-label={`Vary ${def.label}`}
        />
      </div>
      {enabled && (
        <div className="mt-2 space-y-2">
          <Select value={type} onValueChange={(v) => onPatch(def.key, { type: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIST_TYPES.map((d) => <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {type === 'triangular' && (
            <div className="grid grid-cols-3 gap-2">
              {F({ label: 'Min', field: 'min' })}
              {F({ label: 'Mode', field: 'mode' })}
              {F({ label: 'Max', field: 'max' })}
            </div>
          )}
          {type === 'uniform' && (
            <div className="grid grid-cols-2 gap-2">
              {F({ label: 'Min', field: 'min' })}
              {F({ label: 'Max', field: 'max' })}
            </div>
          )}
          {(type === 'normal' || type === 'lognormal') && (
            <div className="grid grid-cols-2 gap-2">
              {F({ label: 'Mean', field: 'mean' })}
              {F({ label: 'Std dev', field: 'stdDev' })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const UncertaintyPanel = () => {
  const {
    displacementInputs, patternInputs,
    uncertaintyConfig, setUncertaintyIterations, setUncertaintyParam, setUncertaintySeed,
    isRunningUncertainty, uncertaintyProgress, runUncertainty, u,
  } = useWaterfloodDesign();

  const tabularKr = displacementInputs.krSource === 'table';
  const baseFor = (def) => (def.group === 'pattern' ? patternInputs[def.key] : displacementInputs[def.key]);

  const onToggle = (key, enabled, base) => {
    const existing = uncertaintyConfig.params[key];
    if (enabled && !existing?.type) setUncertaintyParam(key, { enabled: true, ...seedFromBase(base) });
    else setUncertaintyParam(key, { enabled });
  };

  const enabledCount = Object.values(uncertaintyConfig.params).filter((p) => p?.enabled).length;
  const groups = [
    { title: 'Displacement parameters', items: UNCERTAINTY_PARAMS.filter((p) => p.group === 'displacement') },
    { title: 'Pattern parameters', items: UNCERTAINTY_PARAMS.filter((p) => p.group === 'pattern') },
  ];

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Monte Carlo run</SectionLabel>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Iterations (100 to 20,000)" value={uncertaintyConfig.iterations} onChange={setUncertaintyIterations} />
          {/* WF-U2-005: the seed of the run; blank draws one and records it */}
          <Field label="Seed (blank: drawn and recorded)" value={uncertaintyConfig.seed ?? ''} onChange={setUncertaintySeed} placeholder="drawn at run time" testId="wds-mc-seed" />
          <Button size="sm" onClick={runUncertainty} disabled={isRunningUncertainty} className="h-9">
            <Play className="w-4 h-4 mr-1" /> {isRunningUncertainty ? 'Running…' : 'Run'}
          </Button>
        </div>
        {isRunningUncertainty && (
          <div className="mt-3">
            <Progress value={uncertaintyProgress * 100} className="h-2" />
            <p className="text-[11px] text-pl-muted mt-1">{Math.round(uncertaintyProgress * 100)}% of realizations complete</p>
          </div>
        )}
      </section>

      {groups.map((g) => (
        <section key={g.title}>
          <SectionLabel>{g.title}</SectionLabel>
          <div className="space-y-2">
            {g.items.map((def) => (
              <ParamRow
                key={def.key}
                def={def}
                cfg={uncertaintyConfig.params[def.key]}
                base={baseFor(def)}
                disabled={def.coreyOnly && tabularKr}
                onToggle={onToggle}
                onPatch={setUncertaintyParam}
                u={u}
              />
            ))}
          </div>
          {g.title === 'Displacement parameters' && tabularKr && (
            <Label className="text-[11px] text-pl-muted leading-snug block mt-2">
              Rel-perm shape parameters cannot be varied while the Displacement tab uses a pasted kr table. Switch to Corey to enable them.
            </Label>
          )}
        </section>
      ))}

      <section>
        <Label className="text-[11px] text-pl-muted leading-snug block">
          Each realization substitutes the sampled values into the working case and reruns the pattern forecast.
          Enabling a parameter seeds a plus/minus 20% triangular spread around its working value; edit freely.
          {enabledCount === 0 ? ' Enable at least one parameter to run.' : ''}
        </Label>
      </section>
    </div>
  );
};

export default UncertaintyPanel;
