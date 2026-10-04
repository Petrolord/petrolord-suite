// Gas z factor of a gas case (RF-U2-003): Dranchuk-Abou-Kassem from the
// canonical engines (zi, za and Bgi from gas gravity, temperature, pi and pa)
// or typed. A saved project keeps the method it was saved with.
import React from 'react';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { CORR_FIELDS } from './rfFields';
import { Z_METHOD_DAK, Z_METHOD_TYPED, zMethodLabel } from '@/utils/rfestimator/gasZ';
import RfField from './RfField';

const g = (v, s = 4) => (Number.isFinite(v) ? String(parseFloat(v.toPrecision(s))) : 'n/a');

const GasZPanel = () => {
  const { inputs, derived, u, setZMethod, setCorrField } = useRfEstimator();
  if (inputs.phase !== 'gas') return null;
  const dak = inputs.zMethod === Z_METHOD_DAK;
  const gz = derived.gasZ;
  const hasPi = (CORR_FIELDS[inputs.method] || []).some(([k]) => k === 'pi');
  const sample = (k) => (derived.sampleKeys.has(`corr.${k}`) ? 'Sample value' : null);
  return (
    <div className="space-y-2 rounded-md border border-pl-border p-3" data-testid="rf-gas-z">
      <label htmlFor="rf-z-method" className="text-[11px] font-medium text-pl-text">Gas z factor and Bgi</label>
      <select id="rf-z-method" data-testid="rf-z-method" value={dak ? Z_METHOD_DAK : Z_METHOD_TYPED} onChange={(e) => setZMethod(e.target.value)}
        className="w-full h-9 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
        <option value={Z_METHOD_DAK}>{zMethodLabel(Z_METHOD_DAK)}</option>
        <option value={Z_METHOD_TYPED}>{zMethodLabel(Z_METHOD_TYPED)}</option>
      </select>
      {dak && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <RfField id="rf-corr-gasGravity" label="Gas gravity (air = 1)" kind="dimensionless" u={u} value={inputs.corr.gasGravity ?? ''} onChange={(v) => setCorrField('gasGravity', v)} note={sample('gasGravity')} />
            <RfField id="rf-corr-tempF" label="Reservoir temperature" kind="temperature" u={u} value={inputs.corr.tempF ?? ''} onChange={(v) => setCorrField('tempF', v)} note={sample('tempF')} />
            {!hasPi && <RfField id="rf-z-pi" label="Initial pi" kind="pressure" u={u} value={inputs.corr.pi ?? ''} onChange={(v) => setCorrField('pi', v)} note={sample('pi')} />}
          </div>
          {gz?.ok ? (
            <p className="text-[11px] text-pl-muted" data-testid="rf-gas-z-values">
              zi {g(gz.zi.z)} at pi (Ppr {g(gz.zi.ppr, 3)}, Tpr {g(gz.zi.tpr, 3)}){gz.za ? `; za ${g(gz.za.z)} at pa (Ppr ${g(gz.za.ppr, 3)})` : '; za needs pa'}; Bgi {g(u.show('fvfGasCf', gz.bgi), 5)} {u.label('fvfGasCf')} at pi. Dranchuk-Abou-Kassem (1975) on Sutton (1985) pseudo-criticals, canonical engines.
            </p>
          ) : (
            <p className="text-[11px] text-pl-warning-text">{gz?.errors?.join(' ')}</p>
          )}
        </>
      )}
      {!dak && <p className="text-[11px] text-pl-muted">zi, za and Bgi are read as typed in the fields (or as taken from Fluid Systems Studio).</p>}
    </div>
  );
};

export default GasZPanel;
