// Supabase-backed backend for the Perforation & Sand Control workstation:
// wp_ps CRUD + the shared wellbore spine + geo_wells log reads for the
// published gm-1.0.0/pp-1.0.0 curves. Same method surface as
// inMemoryBackend so the workstation cannot tell them apart.

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import { listLogs, downloadCurve } from '@/lib/wellsRegistry';
import {
  getDefinitiveTrajectory, listCtCases, listCdCases,
  listPsCases, savePsCase, updatePsCase, deletePsCase,
  listPsRuns, savePsRun, deletePsRun,
} from './psApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites,
    listWellbores,
    getDefinitiveTrajectory,
    listCtCases,
    listCdCases,
    listCases: listPsCases,
    saveCase: (row) => savePsCase(row, userId),
    updateCase: updatePsCase,
    deleteCase: deletePsCase,
    listRuns: listPsRuns,
    saveRun: (run) => savePsRun(run, userId),
    deleteRun: deletePsRun,
    listGeoLogs: (geoWellId) => listLogs(geoWellId),
    downloadCurve,
  };
}
