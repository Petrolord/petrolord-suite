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
            className={`px-3 py-1.5 rounded-md text-xs border ${inputs.method === m.code ? 'bg-lime-600 border-lime-500 text-white' : 'border-slate-700 text-slate-400 hover:text-white'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Primary drive mechanism (sets analog band)</Label>
        <select value={inputs.driveCode} onChange={(e) => setDriveCode(e.target.value)}
          className="w-full h-9 rounded-md bg-slate-800 border border-slate-700 px-2 text-sm">
          {drives.map((d) => <option key={d.code} value={d.code}>{d.label} ({fmtPct(d.low)}–{fmtPct(d.high)})</option>)}
        </select>
        {result.analog?.notes && <p className="text-xs text-slate-500">{result.analog.notes}</p>}
      </div>

      {corrFields.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
          {corrFields.map(([k, lbl, unit]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs text-slate-400">{`${lbl} (${unit})`}</Label>
              <Input value={inputs.corr[k] ?? ''} onChange={(e) => setCorrField(k, e.target.value)}
                className="h-9 bg-slate-800 border-slate-700" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MethodPanel;
