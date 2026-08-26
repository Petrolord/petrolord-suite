// Registry-backed backend for the T&D workstation: thin wrapper over tdApi +
// the wp site/wellbore pickers. The harness swaps this for inMemoryBackend —
// same interface, no Supabase (the PorePressureStudio pattern).

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import {
  getGeometry, saveGeometry, listCases, saveCase, updateCase, deleteCase,
  listRuns, saveRun, deleteRun, getDefinitiveTrajectory,
} from './tdApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites: () => listSites(),
    listWellbores: (siteId) => listWellbores(siteId),
    getDefinitiveTrajectory: (wellboreId) => getDefinitiveTrajectory(wellboreId),
    getGeometry: (wellboreId) => getGeometry(wellboreId),
    saveGeometry: (wellboreId, holeSections) => saveGeometry(wellboreId, holeSections, userId),
    listCases: (wellboreId) => listCases(wellboreId),
    saveCase: (row) => saveCase(row, userId),
    updateCase: (id, patch) => updateCase(id, patch),
    deleteCase: (id) => deleteCase(id),
    listRuns: (caseId) => listRuns(caseId),
    saveRun: (run) => saveRun(run, userId),
    deleteRun: (id) => deleteRun(id),
  };
}
