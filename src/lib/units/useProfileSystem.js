// The unit system a Suite unit profile leans to, in an app's own words
// ('oilfield' / 'si' for Well Test and Nodal, 'field' / 'metric' for
// ReservoirCalc Pro). Project apps use it for NEW projects only: a saved
// project keeps the system it was saved with. Null without a provider,
// so the app keeps its own default.
import { useMemo } from 'react';
import { useUnitProfile } from './UnitProfileContext';
import { appSystemFor } from './vocabulary';

export function useProfileSystem(app, families) {
  const p = useUnitProfile();
  const key = families.join('|');
  return useMemo(
    () => (p.available ? appSystemFor(app, p.units, families) : null),
    [p.available, p.units, app, key], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/** Plain words for a project app's note. */
export const SYSTEM_WORDS = Object.freeze({ oilfield: 'oilfield', si: 'SI', field: 'field', metric: 'metric' });
