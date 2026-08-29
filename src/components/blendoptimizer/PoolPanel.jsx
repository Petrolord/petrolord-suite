// The component pool and the specification set (DS2).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useBlendOptimizer } from '@/contexts/BlendOptimizerContext';

const Cell = ({ label, value, onChange, unit }) => (
  <div>
    <Label className="text-[10px] text-slate-400">{label}{unit ? ` (${unit})` : ''}</Label>
    <Input
      type="number" step="any" value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 bg-slate-950 border-slate-700 text-xs"
    />
  </div>
);

const ComponentCard = ({ component }) => {
  const { setComponent, removeComponent, result } = useBlendOptimizer();
  const line = result.status === 'optimal'
    ? result.recipe.find((r) => r.id === component.id)
    : null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={component.name}
          onChange={(e) => setComponent(component.id, { name: e.target.value })}
          className="h-8 bg-slate-950 border-slate-700 text-sm font-medium"
        />
        <Button
          variant="ghost" size="icon" title="Remove this component"
          onClick={() => removeComponent(component.id)}
          className="h-8 w-8 text-slate-500 hover:text-red-400"
        >
          <Trash2 size={15} />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Cost" unit="$/bbl" value={component.cost} onChange={(v) => setComponent(component.id, { cost: v })} />
        <Cell label="Density" unit="kg/l" value={component.density} onChange={(v) => setComponent(component.id, { density: v, sg: v })} />
        <Cell label="Max" unit="bbl" value={component.maxVolume} onChange={(v) => setComponent(component.id, { maxVolume: v })} />
        <Cell label="RON" value={component.ron} onChange={(v) => setComponent(component.id, { ron: v })} />
        <Cell label="MON" value={component.mon} onChange={(v) => setComponent(component.id, { mon: v })} />
        <Cell label="Sulfur" unit="ppm" value={component.sulfurPpm} onChange={(v) => setComponent(component.id, { sulfurPpm: v })} />
        <Cell label="RVP" unit="psi" value={component.rvp} onChange={(v) => setComponent(component.id, { rvp: v })} />
        <Cell label="Cetane" value={component.cetane} onChange={(v) => setComponent(component.id, { cetane: v })} />
        <Cell label="Visc" unit="cSt" value={component.viscosityCSt} onChange={(v) => setComponent(component.id, { viscosityCSt: v })} />
        <Cell label="Flash" unit="C" value={component.flashPointC} onChange={(v) => setComponent(component.id, { flashPointC: v })} />
        <Cell label="Min" unit="bbl" value={component.minVolume} onChange={(v) => setComponent(component.id, { minVolume: v })} />
      </div>
      {line && (
        <p className="text-[11px] text-slate-400">
          In the recipe: <span className="font-mono text-lime-300">{line.volume.toFixed(1)} bbl</span>
          {' '}({(line.volumeFraction * 100).toFixed(1)}%)
        </p>
      )}
    </div>
  );
};

const PoolPanel = () => {
  const {
    inputs, addComponent, applyTemplate, setTargetVolume, setSpec, templates,
  } = useBlendOptimizer();

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-slate-400">Product specification</Label>
        <Select value={inputs.templateId} onValueChange={applyTemplate}>
          <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-sm mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
            {Object.values(templates).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-amber-300/80 mt-2">
          Templates are starting points, not a compliance oracle. Fuel specifications are set by
          regulation and they change: confirm every limit against the regulation in force. Each one
          is editable below.
        </p>
      </div>

      <div>
        <Label className="text-xs text-slate-400">Target volume (bbl)</Label>
        <Input
          type="number" value={inputs.targetVolume}
          onChange={(e) => setTargetVolume(e.target.value)}
          className="h-8 bg-slate-950 border-slate-700 text-sm mt-1"
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-white">Specifications</h2>
        {inputs.specs.map((s) => (
          <div key={s.id} className="rounded border border-slate-800 bg-slate-900/60 p-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-200">{s.name}{s.unit ? ` (${s.unit})` : ''}</span>
              <span className="text-[10px] text-slate-500">{s.basis} basis</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Cell label="Min" value={s.min} onChange={(v) => setSpec(s.id, { min: v === '' ? null : v })} />
              <Cell label="Max" value={s.max} onChange={(v) => setSpec(s.id, { max: v === '' ? null : v })} />
            </div>
            {s.note && <p className="text-[10px] text-slate-500 mt-1">{s.note}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-semibold text-white">Component pool</h2>
        <Button variant="outline" size="sm" onClick={addComponent} className="h-7 border-slate-700 text-slate-300">
          <PlusCircle size={14} className="mr-1" /> Add
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">
        The pool loaded here is an illustrative gasoline pool, not anyone&apos;s actual streams.
        Leave a property blank where you do not have it: a specification the pool cannot support is
        reported as not applied rather than assumed.
      </p>
      {inputs.components.map((c) => <ComponentCard key={c.id} component={c} />)}
    </div>
  );
};

export default PoolPanel;
