// Method selection + drive mechanism + correlation inputs for the
// Recovery Factor Estimator left rail.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { METHODS, CORR_FIELDS, fmtPct } from '@/components/rfestimator/rfFields';

const MethodPanel = () => {
  const { inputs, drives, result, setMethod, setDriveCode, setCorrField } = useRfEstimator();
  const corrFields = CORR_FIELDS[inputs.method] || [];

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
        <Label className="text-xs text-pl-muted">Primary drive mechanism (sets analog band)</Label>
        <select value={inputs.driveCode} onChange={(e) => setDriveCode(e.target.value)}
          className="w-full h-9 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-sm text-pl-text">
          {drives.map((d) => <option key={d.code} value={d.code}>{d.label} ({fmtPct(d.low)}–{fmtPct(d.high)})</option>)}
        </select>
        {result.analog?.notes && <p className="text-xs text-pl-muted">{result.analog.notes}</p>}
      </div>

      {corrFields.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-pl-border">
          {corrFields.map(([k, lbl, unit]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`rf-corr-${k}`} className="text-xs text-pl-muted">{`${lbl}${unit ? ` (${unit})` : ''}`}</Label>
              <Input id={`rf-corr-${k}`} value={inputs.corr[k] ?? ''} onChange={(e) => setCorrField(k, e.target.value)}
                className="h-9" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MethodPanel;
