// Method selection + drive mechanism + correlation inputs for the
// Recovery Factor Estimator left rail. RF-U1: inputs in the display unit,
// flagged when outside the domain of the method, sample and intake values
// labelled; PVT taken by id from a Fluid Systems Studio project.
import React from 'react';
import { Label } from '@/components/ui/label';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { METHODS, CORR_FIELDS, fmtPct } from '@/components/rfestimator/rfFields';
import { rfPvtSourceText } from '@/utils/rfestimator/pvtIntake';
import RfField from './RfField';
import PvtPanel from './PvtPanel';

const MethodPanel = () => {
  const {
    inputs, drives, result, derived, u, pvtIntake, setMethod, setDriveCode, setCorrField,
  } = useRfEstimator();
  const corrFields = CORR_FIELDS[inputs.method] || [];
  const flagged = new Set(derived.flags.filter((f) => f.scope === 'input' || f.scope === 'consistency').map((f) => f.key));
  const note = (key) => {
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
      </div>

      {corrFields.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-pl-border">
          {corrFields.map(([k, lbl, kind]) => (
            <RfField key={k} id={`rf-corr-${k}`} label={lbl} kind={kind} u={u} value={inputs.corr[k] ?? ''}
              onChange={(v) => setCorrField(k, v)} flagged={flagged.has(k)} note={note(k)} />
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
