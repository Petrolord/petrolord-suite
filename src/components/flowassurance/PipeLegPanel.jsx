// One pipe leg: geometry, the coating stack, and what the two ends of
// the pipe are losing heat to.
//
// The stack is described the way a pipe is actually built up -- each
// coating sits on the one before it -- rather than as a list of
// thicknesses the user has to add correctly by hand. The U it produces
// is shown live, with the share each layer carries, because the whole
// argument for insulation is that one layer dominates and that is worth
// seeing rather than asserting.
import React from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import { Field, fmt } from './fields';

const LegNumber = ({ leg, name, step = 'any' }) => {
  const { inputs, setSection } = useFlowAssurance();
  return (
    <Input
      type="number"
      step={step}
      value={inputs[leg][name] ?? ''}
      onChange={(e) => setSection(leg, name, e.target.value)}
      className="h-9 bg-slate-800 border-slate-700"
    />
  );
};

const PipeLegPanel = ({ leg, title, optional }) => {
  const {
    inputs, setSection, addCoating, updateCoating, removeCoating,
    conductivities, outsideFilms, insideFilms, legUs,
  } = useFlowAssurance();
  const spec = inputs[leg];
  const u = legUs[leg];

  return (
    <div className="space-y-4">
      {optional && (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-slate-400">Include this leg</Label>
          <Switch
            checked={!!spec.enabled}
            onCheckedChange={(v) => setSection(leg, 'enabled', v)}
          />
        </div>
      )}
      {!spec.enabled ? (
        <p className="text-[11px] text-slate-600">
          {title} is off, so the trace ends where the leg before it does.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Length (ft)"><LegNumber leg={leg} name="lengthFt" /></Field>
            <Field label="Bore (in)"><LegNumber leg={leg} name="idIn" step="0.01" /></Field>
            <Field label="Wall (in)"><LegNumber leg={leg} name="wallIn" step="0.001" /></Field>
            <Field label="Roughness (in)"><LegNumber leg={leg} name="roughnessIn" step="0.0001" /></Field>
            <Field label="Ambient (F)"><LegNumber leg={leg} name="ambientTempF" /></Field>
            <Field label="Burial depth (ft)" hint="To the pipe centreline. Zero is lying on the bottom.">
              <LegNumber leg={leg} name="burialFt" step="0.1" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Field label="Inside film" hint="A flowing liquid is nearly a short circuit. It stops being one when the line shuts in.">
              <Select value={spec.insideFilmId} onValueChange={(v) => setSection(leg, 'insideFilmId', v)}>
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                  {insideFilms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label} ({f.h})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Outside film" hint="The one genuinely uncertain input in a U calculation: still water and a swept seabed differ by an order of magnitude.">
              <Select value={spec.outsideFilmId} onValueChange={(v) => setSection(leg, 'outsideFilmId', v)}>
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                  {outsideFilms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label} ({f.h})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {Number(spec.burialFt) > 0 && (
              <Field label="Soil">
                <Select value={spec.soilId} onValueChange={(v) => setSection(leg, 'soilId', v)}>
                  <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                    {conductivities.filter((c) => c.id.startsWith('soil')).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <div className="border-t border-slate-800 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1">
                <Layers className="w-3 h-3" /> Coating stack
              </p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addCoating(leg)}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {!spec.coatings.length && (
              <p className="text-[11px] text-slate-600">
                Bare pipe. Everything outside the steel is what keeps the fluid warm.
              </p>
            )}
            {spec.coatings.map((c) => (
              <div key={c.id} className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    value={c.materialId}
                    onValueChange={(v) => updateCoating(leg, c.id, { materialId: v })}
                  >
                    <SelectTrigger className="h-8 bg-slate-800 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                      {conductivities.filter((x) => !x.id.startsWith('soil')).map((x) => (
                        <SelectItem key={x.id} value={x.id}>{x.label} (k = {x.k})</SelectItem>
                      ))}
                      <SelectItem value="custom">Custom conductivity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {c.materialId === 'custom' && (
                  <Input
                    type="number" step="0.001" placeholder="k"
                    value={c.k ?? ''}
                    onChange={(e) => updateCoating(leg, c.id, { k: e.target.value })}
                    className="h-8 w-20 bg-slate-800 border-slate-700 text-xs"
                  />
                )}
                <Input
                  type="number" step="0.05" placeholder="in"
                  value={c.thicknessIn ?? ''}
                  onChange={(e) => updateCoating(leg, c.id, { thicknessIn: e.target.value })}
                  className="h-8 w-20 bg-slate-800 border-slate-700 text-xs"
                />
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-rose-400"
                  onClick={() => removeCoating(leg, c.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {u && (
            <div className="border-t border-slate-800 pt-3">
              {u.ok ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Overall U</p>
                    <p className="text-lg font-semibold tabular-nums text-cyan-300">
                      {fmt(u.uBtuHrFt2F, 3)}{' '}
                      <span className="text-xs font-normal text-slate-500">Btu/hr-ft2-F</span>
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2">
                    Referred to the {fmt(u.referenceIdIn, 2)} in bore. A U quoted without its
                    reference area is not a number.
                  </p>
                  <div className="space-y-1">
                    {u.resistances.map((r) => (
                      <div key={r.id} className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-cyan-600"
                            style={{ width: `${Math.min(100, r.sharePct)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 w-40 truncate">{r.label || r.id}</p>
                        <p className="text-[10px] tabular-nums text-slate-400 w-12 text-right">
                          {r.sharePct.toFixed(1)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-rose-400">{u.error}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PipeLegPanel;
