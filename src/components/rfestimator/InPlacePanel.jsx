// Phase toggle + in-place volume (direct or volumetric) for the
// Recovery Factor Estimator left rail.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { VOL_FIELDS_OIL, VOL_FIELDS_GAS } from '@/components/rfestimator/rfFields';

const Field = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="h-9 bg-slate-800 border-slate-700" />
  </div>
);

const InPlacePanel = () => {
  const { inputs, switchPhase, setInPlaceMode, setOoipDirect, setVolField } = useRfEstimator();
  const volFields = inputs.phase === 'gas' ? VOL_FIELDS_GAS : VOL_FIELDS_OIL;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
        {['oil', 'gas'].map((p) => (
          <button
            key={p}
            onClick={() => switchPhase(p)}
            className={`px-4 py-1.5 text-xs font-medium capitalize transition-colors ${inputs.phase === p ? 'bg-lime-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="inline-flex rounded-md border border-slate-700 overflow-hidden text-xs">
        {[['volumetric', 'From volumetrics'], ['direct', 'Enter directly']].map(([m, lbl]) => (
          <button key={m} onClick={() => setInPlaceMode(m)}
            className={`px-3 py-1.5 ${inputs.inPlaceMode === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {inputs.inPlaceMode === 'direct' ? (
        <Field
          label={inputs.phase === 'gas' ? 'OGIP (scf)' : 'OOIP (STB)'}
          value={inputs.ooipDirect}
          onChange={setOoipDirect}
          placeholder={inputs.phase === 'gas' ? 'scf' : 'STB'}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {volFields.map(([k, lbl, unit]) => (
            <Field key={k} label={`${lbl} (${unit})`} value={inputs.vol[k] ?? ''} onChange={(v) => setVolField(k, v)} />
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        OOIP = 7758·A·h·φ·(1−Sw)·NTG / Boi — the same relation the volumetrics apps use, so numbers carry across cleanly.
      </p>
    </div>
  );
};

export default InPlacePanel;
