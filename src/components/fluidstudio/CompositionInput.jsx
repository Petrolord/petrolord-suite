import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Atom, Scale } from 'lucide-react';
import { COMPONENT_ORDER, COMPONENTS, PLUS_FRACTION_KEY } from '@/utils/fluidstudio/eos/components';
import { emptyComposition } from '@/utils/fluidstudio/eosAnalysis';

const Num = ({ id, label, value, onChange, unit, hint, step = 'any' }) => (
  <div>
    <Label htmlFor={id} className="text-sm font-medium text-slate-300">{label}</Label>
    <div className="flex items-center mt-1">
      <Input id={id} type="number" step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
      {unit && <span className="ml-2 text-sm text-slate-400">{unit}</span>}
    </div>
    {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
  </div>
);

/**
 * Composition tab (FS5): mole-percent feed for the PR78 path, the C7+
 * description, and the flash conditions. Mounted only when the fluid
 * model selector is set to compositional.
 */
const CompositionInput = ({ composition, onChange }) => {
  const comp = composition?.zPct ? composition : emptyComposition();
  const zPct = comp.zPct;

  const sumPct = useMemo(
    () => [...COMPONENT_ORDER, PLUS_FRACTION_KEY].reduce((s, k) => s + (Number(zPct[k]) || 0), 0),
    [zPct],
  );
  const sumOk = Math.abs(sumPct - 100) <= 1;

  const patch = (p) => onChange({ ...comp, ...p });
  const setZ = (key, value) => patch({ zPct: { ...zPct, [key]: value === '' ? 0 : Number(value) } });
  const setPlus = (field, value) => patch({ plus: { ...comp.plus, [field]: value === '' ? null : Number(value) } });
  const setEnv = (field, value) => patch({ envelope: { ...comp.envelope, [field]: value === '' ? null : Number(value) } });

  const normalize = () => {
    if (!(sumPct > 0)) return;
    const f = 100 / sumPct;
    patch({
      zPct: Object.fromEntries(
        Object.entries(zPct).map(([k, v]) => [k, v > 0 ? Number((v * f).toFixed(4)) : 0]),
      ),
    });
  };

  return (
    <div className="space-y-4 p-1">
      <h3 className="text-lg font-semibold text-lime-300 flex items-center"><Atom className="w-5 h-5 mr-2" />Feed composition</h3>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {COMPONENT_ORDER.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <Label htmlFor={`z-${k}`} className="w-10 shrink-0 text-xs font-mono text-slate-300">{k}</Label>
            <Input
              id={`z-${k}`}
              type="number"
              step="any"
              min="0"
              value={zPct[k] || ''}
              placeholder="0"
              onChange={(e) => setZ(k, e.target.value)}
              className="bg-slate-800 border-slate-600 text-white h-8 text-sm"
              title={COMPONENTS[k].name}
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Label htmlFor="z-c7p" className="w-10 shrink-0 text-xs font-mono text-cyan-300">C7+</Label>
          <Input
            id="z-c7p"
            type="number"
            step="any"
            min="0"
            value={zPct[PLUS_FRACTION_KEY] || ''}
            placeholder="0"
            onChange={(e) => setZ(PLUS_FRACTION_KEY, e.target.value)}
            className="bg-slate-800 border-slate-600 text-white h-8 text-sm"
            title="Heptanes plus"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2">
        <span className={`text-sm ${sumOk ? 'text-slate-300' : 'text-amber-300'}`}>
          Total {sumPct.toFixed(2)} mol%
        </span>
        <Button size="sm" variant="outline" onClick={normalize} className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20 h-7">
          <Scale className="w-3.5 h-3.5 mr-1.5" />Normalize
        </Button>
      </div>
      {!sumOk && (
        <p className="text-xs text-amber-300">The EOS renormalizes internally, but a total far from 100% usually means a typo.</p>
      )}

      {(Number(zPct[PLUS_FRACTION_KEY]) || 0) > 0 && (
        <>
          <h4 className="text-sm font-semibold text-lime-300 pt-1">C7+ description</h4>
          <div className="grid grid-cols-2 gap-3">
            <Num id="plus-mw" label="Molecular weight" value={comp.plus?.mw} onChange={(v) => setPlus('mw', v)} unit="lb/lb-mol" />
            <Num id="plus-sg" label="Specific gravity" value={comp.plus?.sg} onChange={(v) => setPlus('sg', v)} unit="60/60" />
          </div>
          <Num
            id="plus-tb"
            label="Normal boiling point (optional)"
            value={comp.plus?.tbF}
            onChange={(v) => setPlus('tbF', v)}
            unit="°F"
            hint="Leave blank to estimate it from MW and SG with the Soreide correlation."
          />
        </>
      )}

      <h4 className="text-sm font-semibold text-lime-300 pt-1">Flash conditions</h4>
      <div className="grid grid-cols-2 gap-3">
        <Num id="eos-p" label="Pressure" value={comp.pressure} onChange={(v) => patch({ pressure: v === '' ? null : Number(v) })} unit="psia" />
        <Num id="eos-t" label="Temperature" value={comp.temp} onChange={(v) => patch({ temp: v === '' ? null : Number(v) })} unit="°F" />
      </div>

      <h4 className="text-sm font-semibold text-lime-300 pt-1">Envelope window</h4>
      <div className="grid grid-cols-3 gap-3">
        <Num id="env-tmin" label="T min" value={comp.envelope?.tMinF} onChange={(v) => setEnv('tMinF', v)} unit="°F" />
        <Num id="env-tmax" label="T max" value={comp.envelope?.tMaxF} onChange={(v) => setEnv('tMaxF', v)} unit="°F" />
        <Num id="env-nt" label="Points" value={comp.envelope?.nT} onChange={(v) => setEnv('nT', v)} step="1" />
      </div>
      <p className="text-xs text-slate-500">The envelope traces in a background worker from the Compositional results tab. Composition and conditions here feed the flash instantly.</p>
    </div>
  );
};

export default CompositionInput;
