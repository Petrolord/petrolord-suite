// Pump selection (left rail). Two honest routes to a stage curve and no
// third one: the vendor's own published points, or a transparent model
// stage with named parameters. The predecessor app's invented curves
// under vendor-sounding model names are exactly what is refused here.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { useEsp } from '@/contexts/EspDesignContext';

const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
  </div>
);

const PumpPanel = () => {
  const { inputs, setSection, referenceStages, curve } = useEsp();
  const { pump, completion } = inputs;
  const stage = referenceStages.find((s) => s.id === pump.referenceStageId);
  const casingIdIn = parseFloat(completion.casingIdIn);
  const tooBig = pump.curveSource === 'reference' && stage
    && Number.isFinite(casingIdIn) && stage.housingOdIn >= casingIdIn;

  return (
    <div className="space-y-4">
      <Field label="Stage curve from">
        <Select value={pump.curveSource} onValueChange={(v) => setSection('pump', 'curveSource', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="reference">A reference model stage</SelectItem>
            <SelectItem value="vendor">The vendor's curve points</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {pump.curveSource === 'reference' ? (
        <>
          <Field
            label="Reference stage"
            hint="A shape built from four named parameters, grouped by the housing sizes the industry standardised on. It is not any manufacturer's pump and carries no part number."
          >
            <Select
              value={pump.referenceStageId}
              onValueChange={(v) => setSection('pump', 'referenceStageId', v)}
            >
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                {referenceStages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {stage && (
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-2 space-y-1">
              <p className="text-[11px] text-slate-500">
                {stage.bepBpd.toLocaleString()} bbl/d and {stage.bepHeadFt} ft per stage at best
                efficiency ({(stage.bepEfficiency * 100).toFixed(0)} percent), published range{' '}
                {stage.qMin.toLocaleString()} to {stage.qMax.toLocaleString()} bbl/d, housing{' '}
                {stage.housingOdIn} in.
              </p>
              {tooBig && (
                <p className="text-[11px] text-amber-400 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  A {stage.housingOdIn} in housing does not go into {casingIdIn} in casing. Pick a
                  smaller series or check the casing ID.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <Field
            label="Curve points"
            hint='One point per line: rate, head, efficiency. Efficiency is optional; a fourth column is brake power per stage. Lines that do not parse are dropped rather than guessed at.'
          >
            <Textarea
              rows={7}
              placeholder={'1500, 32, 55\n2500, 28, 70\n3500, 20, 60'}
              value={pump.curveText}
              onChange={(e) => setSection('pump', 'curveText', e.target.value)}
              className="bg-slate-800 border-slate-700 font-mono text-xs"
            />
          </Field>
          <Field
            label="Curve reference frequency (Hz)"
            hint="The frequency the vendor published the curve at. Everything else follows by the affinity laws."
          >
            <Input
              type="number"
              value={pump.curveRefHz}
              onChange={(e) => setSection('pump', 'curveRefHz', e.target.value)}
              className="h-9 bg-slate-800 border-slate-700"
            />
          </Field>
          {curve?.ok && (
            <p className="text-[11px] text-slate-600">
              {curve.points.length} point{curve.points.length === 1 ? '' : 's'} read,{' '}
              {curve.qMin.toLocaleString(undefined, { maximumFractionDigits: 0 })} to{' '}
              {curve.qMax.toLocaleString(undefined, { maximumFractionDigits: 0 })} bbl/d.
            </p>
          )}
        </>
      )}

      {!curve?.ok && (curve?.warnings || []).length > 0 && (
        <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2">
          <ul className="text-[11px] text-amber-200/80 space-y-1 list-disc pl-4">
            {curve.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="border-t border-slate-800 pt-3">
        <Field
          label="Drive frequency (Hz)"
          hint="Affinity laws for a fixed impeller: rate with speed, head with speed squared, power with speed cubed."
        >
          <Input
            type="number"
            value={pump.hz}
            onChange={(e) => setSection('pump', 'hz', e.target.value)}
            className="h-9 bg-slate-800 border-slate-700"
          />
        </Field>
      </div>
    </div>
  );
};

export default PumpPanel;
