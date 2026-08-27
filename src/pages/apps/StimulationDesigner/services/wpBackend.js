// Supabase-backed backend for the Stimulation Designer workstation:
// wp_st CRUD + the shared wellbore spine + geo_wells log reads for the
// published gm-1.0.0/pp-1.0.0 curves. Same method surface as
// inMemoryBackend so the workstation cannot tell them apart.

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import { listLogs, downloadCurve } from '@/lib/wellsRegistry';
import {
  getDefinitiveTrajectory, listPsCases,
  listStCases, saveStCase, updateStCase, deleteStCase,
  listStRuns, saveStRun, deleteStRun,
} from './stApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites,
    listWellbores,
    getDefinitiveTrajectory,
    listPsCases,
    listCases: listStCases,
    saveCase: (row) => saveStCase(row, userId),
    updateCase: updateStCase,
    deleteCase: deleteStCase,
    listRuns: listStRuns,
    saveRun: (run) => saveStRun(run, userId),
    deleteRun: deleteStRun,
    listGeoLogs: (geoWellId) => listLogs(geoWellId),
    downloadCurve,
  };
}
