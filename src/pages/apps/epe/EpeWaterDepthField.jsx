// Water depth for the PIA asset profile, in the user's depth unit.
//
// The PIA sorts terrain by water depth in metres, so the config keeps
// metres (pia_water_depth_m) and the engine is unchanged. On the Oilfield
// preset (depth in feet, the Nigerian default) the field takes and shows
// feet and says what it stores: 114.8 ft is stored as 34.99 m. The text
// typed is kept as typed while the field has focus, so a value such as
// "114." is not reformatted under the cursor.
import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUnitProfile } from '@/lib/units/UnitProfileContext';

export const M_PER_FT = 0.3048;
const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Metres as shown in the unit ('' stays ''). */
export function depthToView(m, unit) {
  if (m === '' || m == null || !Number.isFinite(Number(m))) return '';
  return unit === 'ft' ? String(round(Number(m) / M_PER_FT, 1)) : String(Number(m));
}
/** A typed value in the unit as metres ('' stays ''). */
export function depthFromView(text, unit) {
  if (text === '' || text == null) return '';
  const v = Number(text);
  if (!Number.isFinite(v)) return '';
  return unit === 'ft' ? round(v * M_PER_FT, 4) : v;
}

export default function EpeWaterDepthField({ valueM, onChangeM, error }) {
  const profile = useUnitProfile();
  const unit = profile?.units?.depth === 'ft' ? 'ft' : 'm';
  const [text, setText] = useState(depthToView(valueM, unit));
  const [focused, setFocused] = useState(false);
  // follow the stored value when it changes from outside (a loaded config)
  useEffect(() => { if (!focused) setText(depthToView(valueM, unit)); }, [valueM, unit, focused]);
  const m = depthFromView(text, unit);
  return (
    <div>
      <Label htmlFor="pia_water_depth_m" className="text-pl-text text-sm">
        Water depth <span className="text-pl-muted">({unit})</span>
      </Label>
      <Input
        id="pia_water_depth_m"
        type="number"
        step="any"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => { setText(e.target.value); onChangeM(depthFromView(e.target.value, unit)); }}
        className={error ? 'border-pl-danger' : undefined}
      />
      {unit === 'ft' && m !== '' && (
        <p className="text-xs text-pl-muted mt-1" data-testid="epe-water-depth-stored">
          Stored as {Number(m).toFixed(2)} m: the PIA sorts terrain by water depth in metres.
        </p>
      )}
      {error && <p className="text-pl-danger-text text-xs mt-1">{error}</p>}
    </div>
  );
}
