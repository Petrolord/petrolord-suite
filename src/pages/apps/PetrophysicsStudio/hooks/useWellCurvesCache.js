// Cross-well curve cache (Petrophysics Studio PS7, reused by the PS9
// field view): download-once storage of mapped input curves per well,
// keyed by well id, with a small LRU cap. Deliberately outside React
// state — callers await getCurves and set their own state; the cache
// only saves repeat downloads.

import { useMemo } from 'react';
import { mapLogs } from '../services/curveMap';

const CAP = 16;

export function useWellCurvesCache(backend) {
  return useMemo(() => {
    const cache = new Map(); // wellId -> Promise<{curves, inventory}>

    const fetchWell = async (wellId) => {
      const logs = await backend.listLogs(wellId);
      const mapped = mapLogs(logs);
      const curves = {};
      for (const [key, log] of Object.entries(mapped)) {
         
        if (log) curves[key] = await backend.downloadCurve(log);
      }
      return {
        curves,
        inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })),
      };
    };

    return {
      /** @returns {Promise<{curves: Object, inventory: Array}>} */
      getCurves(wellId) {
        if (cache.has(wellId)) {
          const hit = cache.get(wellId);
          cache.delete(wellId);   // refresh LRU position
          cache.set(wellId, hit);
          return hit;
        }
        const p = fetchWell(wellId).catch((e) => {
          cache.delete(wellId);   // failed loads retry next time
          throw e;
        });
        cache.set(wellId, p);
        while (cache.size > CAP) cache.delete(cache.keys().next().value);
        return p;
      },
      invalidate(wellId) {
        if (wellId) cache.delete(wellId);
        else cache.clear();
      },
    };
  }, [backend]);
}
