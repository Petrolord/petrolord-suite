// The constant FVF set of the VRR Monitor left rail, in the display units,
// with where each value came from (VRR-U1: RL1, PL3, PL11). A blank or
// non-numeric value withholds the VRR with the reason (VRR-U1-008); the set
// can be filled from a Fluid Systems Studio project (FluidPvtIntake).
import React from 'react';
import UnitInput from './UnitInput';
import { Label } from '@/components/ui/label';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import { THEMED_TONE } from '@/components/studio/studioTheme';
import FluidPvtIntake from './FluidPvtIntake';

const FIELDS = [
  { key: 'Bo', label: 'Bo', kind: 'bo', what: 'Oil FVF' },
  { key: 'Bw', label: 'Bw', kind: 'bw', what: 'Water FVF' },
  { key: 'Bg', label: 'Bg', kind: 'bg', what: 'Gas FVF' },
  { key: 'Rs', label: 'Rs', kind: 'rs', what: 'Solution GOR' },
];

const FvfPanel = () => {
  const { inputs, setFvfField, setInputMetaField, fvfCheck, u, pvt } = useVrrMonitor();
  const [showSources, setShowSources] = React.useState(false);
  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, label, kind, what }) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={`vrr-fvf-${key}`} className="text-xs text-pl-muted">{label} ({u.label(kind)}) <span className="opacity-70">{what}</span></Label>
          <UnitInput
            id={`vrr-fvf-${key}`}
            data-testid={`vrr-fvf-${key}`}
            kind={kind}
            value={inputs.fvf[key]}
            onChange={(v) => setFvfField(key, v)}
            className="h-9 font-pl-mono tabular-nums"
          />
        </div>
      ))}
      {!fvfCheck.ok && (
        <div className={`text-xs border rounded px-2 py-1.5 ${THEMED_TONE.danger}`} role="alert" data-testid="vrr-fvf-errors">
          {fvfCheck.errors.join(' ')} No VRR is shown until the set is complete.
        </div>
      )}
      {pvt.active && (
        <p className="text-xs text-pl-info-text" data-testid="vrr-fvf-track-note">
          {pvt.mode === 'table' ? 'The PVT table of a Fluid project' : 'The pressure track'} sets the FVFs of each period with a pressure; this constant set covers the rest.
        </p>
      )}
      <button type="button" className="text-xs underline text-pl-muted" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}>
        {showSources ? 'Hide' : 'State'} where these values came from
      </button>
      {showSources && FIELDS.map(({ key, label }) => (
        <InputSourceControl
          key={key}
          label={`${label} source`}
          meta={inputs.inputMeta?.[key]}
          onChange={(field, value) => setInputMetaField(key, field, value)}
          testId={`vrr-source-${key}`}
        />
      ))}
      <FluidPvtIntake />
      <p className="text-xs text-pl-muted leading-relaxed">
        All volumes convert to reservoir volume before the ratio is taken. Solution gas (Rs x oil) is already carried in Bo,
        so only free produced gas adds voidage. Bo and Rs are per stock-tank barrel; state whether they are flash or
        differential values in the source note.
      </p>
    </div>
  );
};

export default FvfPanel;
