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
import { Field, SectionLabel } from './primitives';

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

const ParamRow = ({ def, cfg, base, disabled, onToggle, onPatch }) => {
  const enabled = !!cfg?.enabled;
  const type = cfg?.type || 'triangular';
  return (
    <div className={`rounded-md border px-2.5 py-2 ${enabled ? 'border-slate-700 bg-slate-800/40' : 'border-slate-800'} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-300">{def.label}</span>
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
            <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIST_TYPES.map((d) => <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {type === 'triangular' && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Min" value={cfg.min ?? ''} onChange={(v) => onPatch(def.key, { min: v })} />
              <Field label="Mode" value={cfg.mode ?? ''} onChange={(v) => onPatch(def.key, { mode: v })} />
              <Field label="Max" value={cfg.max ?? ''} onChange={(v) => onPatch(def.key, { max: v })} />
            </div>
          )}
          {type === 'uniform' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min" value={cfg.min ?? ''} onChange={(v) => onPatch(def.key, { min: v })} />
              <Field label="Max" value={cfg.max ?? ''} onChange={(v) => onPatch(def.key, { max: v })} />
            </div>
          )}
          {(type === 'normal' || type === 'lognormal') && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Mean" value={cfg.mean ?? ''} onChange={(v) => onPatch(def.key, { mean: v })} />
              <Field label="Std dev" value={cfg.stdDev ?? ''} onChange={(v) => onPatch(def.key, { stdDev: v })} />
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
    uncertaintyConfig, setUncertaintyIterations, setUncertaintyParam,
    isRunningUncertainty, uncertaintyProgress, runUncertainty,
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
          <Button size="sm" onClick={runUncertainty} disabled={isRunningUncertainty} className="h-9 bg-cyan-700 hover:bg-cyan-600">
            <Play className="w-4 h-4 mr-1" /> {isRunningUncertainty ? 'Running…' : 'Run'}
          </Button>
        </div>
        {isRunningUncertainty && (
          <div className="mt-3">
            <Progress value={uncertaintyProgress * 100} className="h-2" />
            <p className="text-[11px] text-slate-500 mt-1">{Math.round(uncertaintyProgress * 100)}% of realizations complete</p>
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
              />
            ))}
          </div>
          {g.title === 'Displacement parameters' && tabularKr && (
            <Label className="text-[11px] text-slate-500 leading-snug block mt-2">
              Rel-perm shape parameters cannot be varied while the Displacement tab uses a pasted kr table. Switch to Corey to enable them.
            </Label>
          )}
        </section>
      ))}

      <section>
        <Label className="text-[11px] text-slate-500 leading-snug block">
          Each realization substitutes the sampled values into the working case and reruns the five-spot forecast.
          Enabling a parameter seeds a plus/minus 20% triangular spread around its working value; edit freely.
          {enabledCount === 0 ? ' Enable at least one parameter to run.' : ''}
        </Label>
      </section>
    </div>
  );
};

export default UncertaintyPanel;
