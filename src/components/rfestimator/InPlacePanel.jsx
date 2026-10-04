// Phase toggle + in-place volume (direct or volumetric) for the
// Recovery Factor Estimator left rail. RF-U1: every field in the display
// unit, sample values and intake values labelled, the volume by its parts.
import React from 'react';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { VOL_FIELDS_OIL, VOL_FIELDS_GAS, fmtRes } from '@/components/rfestimator/rfFields';
import { rfPvtSourceText } from '@/utils/rfestimator/pvtIntake';
import { inPlaceSourceText } from '@/utils/rfestimator/inPlaceIntake';
import RfField from './RfField';
import InPlaceIntakePanel from './InPlaceIntakePanel';

const InPlacePanel = () => {
  const {
    inputs, derived, u, pvtIntake, inPlaceIntake, switchPhase, setInPlaceMode, setOoipDirect, setVolField,
  } = useRfEstimator();
  const volFields = inputs.phase === 'gas' ? VOL_FIELDS_GAS : VOL_FIELDS_OIL;
  const flagged = new Set(derived.flags.filter((f) => f.scope === 'volumetric').map((f) => f.key));
  const note = (key) => {
    const pvt = rfPvtSourceText(pvtIntake, 'vol', key, inputs.vol[key]);
    if (pvt) return pvt.startsWith('Edited') ? 'Edited after the Fluid intake' : 'From Fluid Systems Studio';
    if (derived.sampleKeys.has(`vol.${key}`)) return 'Sample value';
    return null;
  };
  const directKind = inputs.phase === 'gas' ? 'gasVolume' : 'oilVolume';

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-pl-border overflow-hidden">
        {['oil', 'gas'].map((p) => (
          <button
            key={p}
            onClick={() => switchPhase(p)}
            className={`px-4 py-1.5 text-xs font-medium capitalize transition-colors ${inputs.phase === p ? 'bg-pl-primary text-pl-primary-fg' : 'bg-pl-surface text-pl-muted hover:text-pl-text'}`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="inline-flex rounded-md border border-pl-border overflow-hidden text-xs">
        {[['volumetric', 'From volumetrics'], ['direct', 'Enter directly']].map(([m, lbl]) => (
          <button key={m} onClick={() => setInPlaceMode(m)}
            className={`px-3 py-1.5 ${inputs.inPlaceMode === m ? 'bg-pl-primary text-pl-primary-fg' : 'text-pl-muted hover:text-pl-text'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {inputs.inPlaceMode === 'direct' ? (
        <>
          <RfField
            id="rf-ooip-direct"
            label={inputs.phase === 'gas' ? 'OGIP' : 'OOIP'}
            kind={directKind}
            u={u}
            value={inputs.ooipDirect}
            onChange={setOoipDirect}
            flagged={flagged.has('ooipDirect')}
            note={inPlaceIntake ? inPlaceSourceText(inPlaceIntake, inputs.ooipDirect) : 'Entered, source not stated (state it on the Report tab)'}
          />
          <p className="text-[11px] text-pl-muted">
            In display: {fmtRes(derived.inPlace, inputs.phase, u.system)}
          </p>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {volFields.map(([k, lbl, kind]) => (
            <RfField key={k} id={`rf-vol-${k}`} label={lbl} kind={kind} u={u} value={inputs.vol[k] ?? ''}
              onChange={(v) => setVolField(k, v)} flagged={flagged.has(k)} note={note(k)} />
          ))}
        </div>
      )}
      <p className="text-[11px] text-pl-muted leading-relaxed">
        {inputs.phase === 'gas'
          ? 'OGIP = 43,560 A h NTG phi (1 - Sw) / Bgi, with Bgi in reservoir ft3 per scf (rm3/sm3 is the same ratio).'
          : 'OOIP = 7,758 A h NTG phi (1 - Sw) / Boi, with 7,758 bbl per acre-ft. The same relation the volumetrics apps use.'}
      </p>
      <InPlaceIntakePanel />
    </div>
  );
};

export default InPlacePanel;
