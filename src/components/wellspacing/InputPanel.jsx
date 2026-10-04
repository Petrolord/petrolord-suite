// The Well Spacing inputs (WS-U1): every value in the display unit of the
// project with its source beside it (RL1), grouped as the engine reads them
// (the case, the drainage diagnostics, the record), the sample labelled as a
// sample, and the well layout that sets the distance between wells. The
// flood-pattern list of earlier builds (5-spot, 7-spot, line drive) entered
// no equation and is replaced by the layout (WS-U1-004).
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import InputSourceControl from '@/lib/inputProvenance/InputSourceControl';
import { formatCoordinates } from '@/utils/coordinateUtils';
import InteractiveMap from '@/components/wellspacing/InteractiveMap';
import { FIELDS, LAYOUT_OPTIONS } from '@/utils/wellspacing/model';
import { inputSource } from '@/utils/wellspacing/reportModel';
import { useWellSpacing } from '@/contexts/WellSpacingContext';
import WsField from './WsField';

const GROUPS = [
  ['reservoir', 'Reservoir', 'Read by the case: EUR, NPV and every number of the table.'],
  ['fluid', 'Fluid', 'Bo divides the oil in place; the GOR also sells the gas. A Bo you give replaces Standing\'s correlation.'],
  ['well', 'Well', 'Decline is effective annual: 15 means the rate falls 15% in a year.'],
  ['economics', 'Economics', 'Money in US$. Royalty is one rate on gross revenue; no income tax.'],
  ['range', 'Spacing range', 'The layout sets the distance between wells for a spacing.'],
  ['drainage', 'Drainage diagnostics', 'Optional. Timing and deliverability per case; they change no EUR and no NPV.'],
];

const SourceLine = ({ k }) => {
  const { inputs, setInputMetaField, canWrite, results } = useWellSpacing();
  const [open, setOpen] = useState(false);
  const def = FIELDS.find((d) => d.key === k);
  return (
    <div className="text-[10px] text-pl-muted">
      <button type="button" className="underline decoration-dotted text-left" onClick={() => setOpen(!open)} data-testid={`ws-source-${k}`}>
        Source: {inputSource(inputs, k, results)}
      </button>
      {open && (
        <div className="mt-1">
          <InputSourceControl label={`${def.label}: source`} meta={inputs.inputMeta?.[k]} disabled={!canWrite} onChange={(field, value) => setInputMetaField(k, field, value)} />
        </div>
      )}
    </div>
  );
};

const Card = ({ title, note, children, delay = 0.1, testId }) => (
  <motion.div
    initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay }}
    className="bg-pl-surface border border-pl-border rounded-xl p-4 shadow-pl-sm space-y-3" data-testid={testId}
  >
    <div>
      <h3 className="text-lg font-bold text-pl-text">{title}</h3>
      {note && <p className="text-[11px] text-pl-muted">{note}</p>}
    </div>
    {children}
  </motion.div>
);

const InputPanel = () => {
  const { inputs, setFormField, setFormFields, loadSample, clearInputs, canWrite } = useWellSpacing();
  const form = inputs.form || {};
  return (
    <div className="space-y-4" data-testid="ws-inputs">
      <Card title="Field" delay={0.05}>
        {inputs.sampleNote && (
          <p className="rounded-md border border-pl-warning/40 bg-pl-warning-bg px-2 py-1.5 text-[11px] text-pl-warning-text" data-testid="ws-sample-note">
            {inputs.sampleNote}
          </p>
        )}
        <div className="space-y-1">
          <Label htmlFor="ws-fieldName" className="text-xs text-pl-muted">Field name *</Label>
          <Input id="ws-fieldName" data-testid="ws-fieldName" className="h-8 text-sm" value={form.fieldName || ''} disabled={!canWrite} placeholder="e.g. North Field Block A" onChange={(e) => setFormField('fieldName', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-pl-muted flex items-center gap-1"><MapPin className="w-3 h-3" /> Field location, WGS84 (for the record; enters no equation)</Label>
          <InteractiveMap latitude={form.latitude} longitude={form.longitude} onLocationSelect={(lat, lng) => canWrite && setFormFields({ latitude: lat, longitude: lng })} />
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Latitude" className="h-8 text-sm" inputMode="decimal" placeholder="Latitude" value={form.latitude || ''} disabled={!canWrite} onChange={(e) => setFormField('latitude', e.target.value)} />
            <Input aria-label="Longitude" className="h-8 text-sm" inputMode="decimal" placeholder="Longitude" value={form.longitude || ''} disabled={!canWrite} onChange={(e) => setFormField('longitude', e.target.value)} />
          </div>
          {form.latitude && form.longitude && <p className="text-[10px] text-pl-muted">{formatCoordinates(form.latitude, form.longitude)}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="w-full" disabled={!canWrite} onClick={loadSample} title="An illustrative example field (not a real field)">Load example field</Button>
          <Button variant="outline" size="sm" className="w-full" disabled={!canWrite} onClick={clearInputs} data-testid="ws-clear">Clear inputs</Button>
        </div>
      </Card>

      {GROUPS.map(([g, title, note], gi) => (
        <Card key={g} title={title} note={note} delay={0.1 + gi * 0.03} testId={`ws-group-${g}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
            {FIELDS.filter((d) => d.group === g).map((d) => (
              <div key={d.key} className="space-y-0.5 min-w-0">
                {d.select ? (
                  <div className="space-y-1">
                    <Label htmlFor="ws-wellLayout" className="text-xs text-pl-muted">{d.label}</Label>
                    <select
                      id="ws-wellLayout" data-testid="ws-wellLayout" value={form.wellLayout || 'square'} disabled={!canWrite}
                      onChange={(e) => setFormField('wellLayout', e.target.value)}
                      className="w-full h-8 px-2 border border-pl-border-strong bg-pl-surface rounded-md text-sm text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
                    >
                      {LAYOUT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                ) : (
                  <WsField id={`ws-${d.key}`} label={d.label} kind={d.kind} value={form[d.key]} required={d.required} disabled={!canWrite} onChange={(v) => setFormField(d.key, v)} />
                )}
                <SourceLine k={d.key} />
              </div>
            ))}
          </div>
        </Card>
      ))}
      <p className="text-[11px] text-pl-muted flex gap-1.5">
        <Info size={13} className="shrink-0 mt-0.5" />
        The cases recompute as you type. Each well gets the recovery factor over its own spacing, with no interference:
        read the drainage table before choosing a spacing.
      </p>
    </div>
  );
};

export default InputPanel;
