// Registry-backed backend for the geomechanics workstation: wp spine +
// geo_wells log reads + gm-1.0.0 publish (overwrite-own). The harness swaps
// this for inMemoryBackend — same interface.

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import {
  listWells, listLogs, downloadCurve, saveLogs, deleteLog,
} from '@/lib/wellsRegistry';
import {
  getDefinitiveTrajectory,
  listGmCases, saveGmCase, updateGmCase, deleteGmCase,
  listGmRuns, saveGmRun, deleteGmRun,
} from './gmApi';
import { staleOwnCurves } from './publishGm';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites: () => listSites(),
    listWellbores: (siteId) => listWellbores(siteId),
    getDefinitiveTrajectory: (wellboreId) => getDefinitiveTrajectory(wellboreId),
    listCases: (wellboreId) => listGmCases(wellboreId),
    saveCase: (row) => saveGmCase(row, userId),
    updateCase: (id, patch) => updateGmCase(id, patch),
    deleteCase: (id) => deleteGmCase(id),
    listRuns: (caseId) => listGmRuns(caseId),
    saveRun: (run) => saveGmRun(run, userId),
    deleteRun: (id) => deleteGmRun(id),
    // Registry side.
    listGeoWells: () => listWells(),
    listGeoLogs: (geoWellId) => listLogs(geoWellId),
    downloadCurve: (log) => downloadCurve(log),
    publishCurves: async (geoWellId, preparedLogs, caseId) => {
      const existing = await listLogs(geoWellId);
      for (const stale of staleOwnCurves(existing, preparedLogs, caseId)) {
        await deleteLog(stale);
      }
      return saveLogs(geoWellId, preparedLogs);
    },
  };
}
