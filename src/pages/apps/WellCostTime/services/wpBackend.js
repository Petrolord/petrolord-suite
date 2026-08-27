// Supabase-backed backend for the Well Cost & Time workstation:
// wp_wct CRUD + the shared wellbore spine. Same method surface as
// inMemoryBackend so the workstation cannot tell them apart.

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import {
  getDefinitiveTrajectory, getGeometry, listCtCases,
  listWctCases, saveWctCase, updateWctCase, deleteWctCase,
  listWctRuns, saveWctRun, deleteWctRun,
} from './wctApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites,
    listWellbores,
    getDefinitiveTrajectory,
    getGeometry,
    listCtCases,
    listCases: listWctCases,
    saveCase: (row) => saveWctCase(row, userId),
    updateCase: updateWctCase,
    deleteCase: deleteWctCase,
    listRuns: listWctRuns,
    saveRun: (run) => saveWctRun(run, userId),
    deleteRun: deleteWctRun,
  };
}
