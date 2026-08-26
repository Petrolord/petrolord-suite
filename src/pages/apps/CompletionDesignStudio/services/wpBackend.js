// Registry-backed backend for the completion workstation (the D1/D5
// pattern). listCtCases feeds the casing-program picker (a linked D6 case
// is SNAPSHOTTED into the cd case; later ct edits do not silently move the
// completion's clearance basis).

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import {
  getDefinitiveTrajectory, listCtCases,
  listCdCases, saveCdCase, updateCdCase, deleteCdCase,
  listCdRuns, saveCdRun, deleteCdRun,
} from './cdApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites: () => listSites(),
    listWellbores: (siteId) => listWellbores(siteId),
    getDefinitiveTrajectory: (wellboreId) => getDefinitiveTrajectory(wellboreId),
    listCases: (wellboreId) => listCdCases(wellboreId),
    saveCase: (row) => saveCdCase(row, userId),
    updateCase: (id, patch) => updateCdCase(id, patch),
    deleteCase: (id) => deleteCdCase(id),
    listRuns: (caseId) => listCdRuns(caseId),
    saveRun: (run) => saveCdRun(run, userId),
    deleteRun: (id) => deleteCdRun(id),
    listCtCases: (wellboreId) => listCtCases(wellboreId),
  };
}
