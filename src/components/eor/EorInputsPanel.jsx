// The screening inputs (EOR-U1): every value in the display unit of the
// project, its source beside it (RL1), the formation, the depth reference,
// the context values that are printed and not screened, and the sample
// label (RL1: sample data is labelled as sample).
import React, { useState } from 'react';
import { Beaker, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import InputSourceControl from '@/lib/inputProvenance/InputSourceControl';
import { FORMATION_OPTIONS } from '@/utils/eorScreeningCalculations';
import { INPUT_DEFS, DEPTH_REFERENCES, inputSource } from '@/utils/eor/reportModel';
import { useEorScreening } from '@/contexts/EorScreeningContext';
import EorField from './EorField';

const NONE = '__none__';

const SourceLine = ({ k }) => {
  const { inputs, setInputMetaField, canWrite } = useEorScreening();
  const [open, setOpen] = useState(false);
  const def = INPUT_DEFS.find((d) => d.key === k);
  return (
    <div className="text-[10px] text-pl-muted">
      <button type="button" className="underline decoration-dotted text-left" onClick={() => setOpen(!open)} data-testid={`eor-source-${k}`}>
        Source: {inputSource(inputs, k)}
      </button>
      {open && (
        <div className="mt-1">
          <InputSourceControl label={`${def.label}: source`} meta={inputs.inputMeta?.[k]} disabled={!canWrite} onChange={(field, value) => setInputMetaField(k, field, value)} />
        </div>
      )}
    </div>
  );
};

const EorInputsPanel = () => {
  const {
    inputs, setFormField, setContextField, setDepthReference, loadSample, clearInputs, canWrite,
  } = useEorScreening();
  const form = inputs.form || {};
  return (
    <Card className="h-fit" data-testid="eor-inputs">
      <CardHeader className="pb-3">
        <CardTitle className="text-pl-text text-base flex items-center gap-2">
          <Beaker className="w-4 h-4 text-pl-primary-text" /> Reservoir &amp; fluid
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {inputs.sampleNote && (
          <p className="rounded-md border border-pl-warning/40 bg-pl-warning-bg px-2 py-1.5 text-[11px] text-pl-warning-text" data-testid="eor-sample-note">
            {inputs.sampleNote}
          </p>
        )}
        {INPUT_DEFS.filter((d) => d.group === 'form' && d.key !== 'formation').map((d) => (
          <div key={d.key} className="space-y-0.5">
            <EorField id={`eor-${d.key}`} label={d.label} kind={d.kind} value={form[d.key]} disabled={!canWrite} onChange={(v) => setFormField(d.key, v)} />
            <SourceLine k={d.key} />
          </div>
        ))}
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Formation type</Label>
          <Select value={form.formation || NONE} disabled={!canWrite} onValueChange={(v) => setFormField('formation', v === NONE ? '' : v)}>
            <SelectTrigger className="h-8 text-sm" data-testid="eor-formation" aria-label="Formation type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not given</SelectItem>
              {FORMATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <SourceLine k="formation" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted">Depth reference</Label>
          <Select value={inputs.depthReference || NONE} disabled={!canWrite} onValueChange={(v) => setDepthReference(v === NONE ? '' : v)}>
            <SelectTrigger className="h-8 text-sm" data-testid="eor-depth-reference" aria-label="Depth reference"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEPTH_REFERENCES.map(([k, label]) => <SelectItem key={k || NONE} value={k || NONE}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-pl-muted">The criteria are true vertical depths. The reference is printed; no correction is applied.</p>
        </div>

        <div className="pt-2 border-t border-pl-border space-y-2">
          <p className="text-[11px] font-semibold text-pl-muted uppercase tracking-wide">Context (printed, not screened)</p>
          {INPUT_DEFS.filter((d) => d.group === 'context').map((d) => (
            <div key={d.key} className="space-y-0.5">
              <EorField id={`eor-${d.key}`} label={d.label.replace(' (context, not screened)', '')} kind={d.kind} value={inputs.context?.[d.key]} disabled={!canWrite} onChange={(v) => setContextField(d.key, v)} />
              <SourceLine k={d.key} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="w-full" title="An illustrative West-Texas-style carbonate CO2 candidate (not a real field)" disabled={!canWrite} onClick={loadSample}>
            Load sample
          </Button>
          <Button variant="outline" size="sm" className="w-full" disabled={!canWrite} onClick={clearInputs} data-testid="eor-clear">
            Clear inputs
          </Button>
        </div>
        <p className="text-[11px] text-pl-muted flex gap-1.5">
          <Info size={13} className="shrink-0 mt-0.5" />
          Screening shortlists candidate methods; it does not design or predict recovery.
          Blank inputs leave criteria unscored with no assumed value.
        </p>
      </CardContent>
    </Card>
  );
};

export default EorInputsPanel;
