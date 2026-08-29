// The pipe and its service limits (left rail, every tab).
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useLineSizing } from '@/contexts/LineSizingContext';
import { Field, NumberInput } from './fields';

const PipePanel = () => {
  const {
    inputs, setSection, pipeSchedule, roughnessOptions, erosionalPresets, applyCPreset, bore,
  } = useLineSizing();
  const { pipe } = inputs;

  const npsOptions = [...new Set(pipeSchedule.map((r) => r.nps))];
  const schedOptions = pipeSchedule
    .filter((r) => r.nps === parseFloat(pipe.nps))
    .map((r) => r.schedule);

  return (
    <div className="space-y-4">
      <Field label="Pipe source">
        <Select value={pipe.source} onValueChange={(v) => setSection('pipe', 'source', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="schedule">From the checked schedule table</SelectItem>
            <SelectItem value="custom">Type the bore directly</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {pipe.source === 'schedule' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="NPS (in)">
            <Select value={pipe.nps} onValueChange={(v) => setSection('pipe', 'nps', v)}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                {npsOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Schedule">
            <Select value={pipe.schedule} onValueChange={(v) => setSection('pipe', 'schedule', v)}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(schedOptions.length ? schedOptions : ['40']).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : (
        <Field label="Inside diameter (in)">
          <NumberInput section="pipe" name="customIdIn" step="0.001" />
        </Field>
      )}
      {!bore.error && (
        <p className="text-[11px] text-slate-500">{bore.label}</p>
      )}

      <Field label="Roughness" hint="The custom value below wins when set.">
        <Select value={pipe.roughnessId} onValueChange={(v) => setSection('pipe', 'roughnessId', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roughnessOptions.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.label} ({r.roughnessIn} in)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Custom roughness (in)">
        <NumberInput section="pipe" name="customRoughIn" step="0.0001" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Length (ft)"><NumberInput section="pipe" name="lengthFt" /></Field>
        <Field label="Elevation change (ft)"><NumberInput section="pipe" name="elevChangeFt" /></Field>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Erosional limit (API RP 14E)</p>
        <Field label="Service" hint="Picking a service fills C; it stays editable, because RP 14E says its values are conservative.">
          <Select value={pipe.cPreset} onValueChange={applyCPreset}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              {erosionalPresets.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="C factor"><NumberInput section="pipe" name="cFactor" /></Field>
      </div>
    </div>
  );
};

export default PipePanel;
