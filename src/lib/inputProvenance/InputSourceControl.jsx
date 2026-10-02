// Input provenance: the one control every Suite app shows beside an input to
// say where the value came from (source selector, the correlation name when
// the source is a correlation, and a free-text quality note). Taken from the
// Well Test Analysis Studio Data tab (tester round 2, 2026-10-02).
//
//   <InputSourceControl
//     label="Viscosity mu" meta={inputMeta.mu}
//     onChange={(field, value) => setInputMetaField('mu', field, value)}
//   />
//
// `meta` is one record of the provenance map (lib/inputProvenance/model);
// `onChange` receives the field ('source' | 'correlation' | 'note') and its
// new value. The control holds no state of its own.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INPUT_SOURCES } from './model.js';

// Radix Select cannot hold an empty string as a value
const NONE = '__none__';

export const NOTE_PLACEHOLDER = 'Note: sample, quality, contamination';

export const InputSourceControl = ({
  label, meta, onChange, testId, sources = INPUT_SOURCES, notePlaceholder = NOTE_PLACEHOLDER, disabled = false,
}) => {
  const m = meta || {};
  return (
    <div className="space-y-1" data-testid={testId}>
      <Label className="text-xs text-pl-muted">{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Select value={m.source || NONE} onValueChange={(v) => onChange('source', v === NONE ? '' : v)} disabled={disabled}>
          <SelectTrigger className="h-8" aria-label={`${label} source`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(sources).map(([k, text]) => <SelectItem key={k || NONE} value={k || NONE}>{text}</SelectItem>)}
          </SelectContent>
        </Select>
        {m.source === 'correlation' ? (
          <Input className="h-8" placeholder="Which correlation" aria-label={`${label} correlation`} value={m.correlation || ''} onChange={(e) => onChange('correlation', e.target.value)} disabled={disabled} />
        ) : <span />}
      </div>
      <Input className="h-8" placeholder={notePlaceholder} aria-label={`${label} note`} value={m.note || ''} onChange={(e) => onChange('note', e.target.value)} disabled={disabled} />
    </div>
  );
};

export default InputSourceControl;
