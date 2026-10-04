// Method selection + drive mechanism + correlation inputs for the
// Recovery Factor Estimator left rail. RF-U1: inputs in the display unit,
// flagged when outside the domain of the method, sample and intake values
// labelled; PVT taken by id from a Fluid Systems Studio project.
import React from 'react';
import { Label } from '@/components/ui/label';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { METHODS, corrFieldsFor, fmtPct } from '@/components/rfestimator/rfFields';
import { rfPvtSourceText } from '@/utils/rfestimator/pvtIntake';
import { driveSuggestion } from '@/utils/rfestimator/inPlaceIntake';
import RfField from './RfField';
import PvtPanel from './PvtPanel';
import GasZPanel from './GasZPanel';
import { Z_METHOD_DAK } from '@/utils/rfestimator/gasZ';

const MethodPanel = () => {
  const {
    inputs, drives, result, derived, u, pvtIntake, inPlaceIntake, setMethod, setDriveCode, setCorrField, canWrite,
  } = useRfEstimator();
  // RF-U2-008: the drive the Material Balance indices suggest (never applied silently)
  const suggestion = driveSuggestion(inPlaceIntake, inputs.phase, inputs.driveCode);
  const corrFields = corrFieldsFor(inputs);
  const flagged = new Set(derived.flags.filter((f) => f.scope === 'input' || f.scope === 'consistency').map((f) => f.key));
  // RF-U2-003: zi and za computed by Dranchuk-Abou-Kassem show the value used, not editable
  const zComputed = (k) => inputs.phase === 'gas' && inputs.zMethod === Z_METHOD_DAK && (k === 'zi' || k === 'za');
  const note = (key) => {
    if (zComputed(key)) return 'Dranchuk-Abou-Kassem, computed';
    const pvt = rfPvtSourceText(pvtIntake, 'corr', key, inputs.corr[key]);
    if (pvt) return pvt.startsWith('Edited') ? 'Edited after the Fluid intake' : 'From Fluid Systems Studio';
    if (derived.sampleKeys.has(`corr.${key}`)) return 'Sample value';
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {METHODS[inputs.phase].map((m) => (
          <button key={m.code} onClick={() => setMethod(m.code)}
            className={`px-3 py-1.5 rounded-md text-xs border ${inputs.method === m.code ? 'bg-pl-primary border-pl-primary text-pl-primary-fg' : 'border-pl-border text-pl-muted hover:text-pl-text'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <Label htmlFor="rf-drive" className="text-xs text-pl-muted">Primary drive mechanism (sets the analog range)</Label>
        <select id="rf-drive" data-testid="rf-drive" value={inputs.driveCode} onChange={(e) => setDriveCode(e.target.value)}
          className="w-full h-9 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-sm text-pl-text">
          {drives.map((d) => <option key={d.code} value={d.code}>{d.label} ({fmtPct(d.low)} to {fmtPct(d.high)})</option>)}
        </select>
        {result.analog?.notes && <p className="text-xs text-pl-muted">{result.analog.notes}</p>}
        {suggestion && (
          <div className="rounded-md border border-pl-border bg-pl-sunken px-2 py-1.5 text-[11px] text-pl-text space-y-1" data-testid="rf-drive-suggestion">
            <p>{suggestion.text}</p>
            {suggestion.code && (suggestion.agrees
              ? <p className="text-pl-muted">The drive named here is the suggested one.</p>
              : canWrite && (
                <button type="button" className="underline text-pl-primary-text" onClick={() => setDriveCode(suggestion.code)} data-testid="rf-drive-suggestion-use">
                  Use {suggestion.label} (a suggestion; the choice is yours)
                </button>
              ))}
          </div>
        )}
      </div>

      {inputs.method === 'gas_water_drive' && (
        <div className="space-y-1">
          <label htmlFor="rf-gwd-mode" className="text-xs text-pl-muted">The swept volume is abandoned at</label>
          <select id="rf-gwd-mode" data-testid="rf-gwd-mode" value={inputs.corr.gwdMode === 'abandonment' ? 'abandonment' : 'maintained'} onChange={(e) => setCorrField('gwdMode', e.target.value)}
            className="w-full h-9 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
            <option value="maintained">The initial pressure (pressure fully maintained, Bga = Bgi)</option>
            <option value="abandonment">An abandonment pressure pa (Bga at pa; partial pressure maintenance)</option>
          </select>
        </div>
      )}
      <GasZPanel />
      {corrFields.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-pl-border">
          {corrFields.map(([k, lbl, kind]) => (
            <RfField key={`${k}-${zComputed(k)}`} id={`rf-corr-${k}`} label={lbl} kind={kind} u={u}
              value={zComputed(k) ? String(parseFloat(Number(derived.inputsUsed?.corr?.[k]).toPrecision(5)) || '') : (inputs.corr[k] ?? '')}
              disabled={zComputed(k)} onChange={(v) => setCorrField(k, v)} flagged={flagged.has(k)} note={note(k)} />
          ))}
        </div>
      )}
      {inputs.method === 'api_solution_gas' || inputs.method === 'api_water_drive' ? (
        <p className="text-[11px] text-pl-muted">Type k in {u.label('permeability')}. The API (1967) equations are written for darcies; the estimator divides by 1,000 before using it.</p>
      ) : null}
      <PvtPanel />
    </div>
  );
};

export default MethodPanel;
