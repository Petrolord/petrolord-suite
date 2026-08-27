// Supabase-backed backend for the Well Integrity & P&A workstation:
// wp_wi CRUD + the shared wellbore spine. Same method surface as
// inMemoryBackend so the workstation cannot tell them apart.

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import {
  getDefinitiveTrajectory, listCtCases, listCdCases,
  listWiCases, saveWiCase, updateWiCase, deleteWiCase,
  listWiRuns, saveWiRun, deleteWiRun,
} from './wiApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites,
    listWellbores,
    getDefinitiveTrajectory,
    listCtCases,
    listCdCases,
    listCases: listWiCases,
    saveCase: (row) => saveWiCase(row, userId),
    updateCase: updateWiCase,
    deleteCase: deleteWiCase,
    listRuns: listWiRuns,
    saveRun: (run) => saveWiRun(run, userId),
    deleteRun: deleteWiRun,
  };
}
