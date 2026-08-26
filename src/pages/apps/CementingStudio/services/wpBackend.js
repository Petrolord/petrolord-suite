// Registry-backed backend for the cementing workstation (D1-D3 pattern).
// loadMudWindow prefills the previous-shoe fracture EMW when the wellbore
// is bridged to geo_wells (manual value stays authoritative).

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import { loadPpfgCurves, buildMudWindow } from '../../well-planning/services/ppfg';
import {
  getDefinitiveTrajectory, getGeometry, saveGeometry,
  listCmtCases, saveCmtCase, updateCmtCase, deleteCmtCase,
  listCmtRuns, saveCmtRun, deleteCmtRun,
} from './cmtApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites: () => listSites(),
    listWellbores: (siteId) => listWellbores(siteId),
    getDefinitiveTrajectory: (wellboreId) => getDefinitiveTrajectory(wellboreId),
    getGeometry: (wellboreId) => getGeometry(wellboreId),
    saveGeometry: (wellboreId, holeSections) => saveGeometry(wellboreId, holeSections, userId),
    listCases: (wellboreId) => listCmtCases(wellboreId),
    saveCase: (row) => saveCmtCase(row, userId),
    updateCase: (id, patch) => updateCmtCase(id, patch),
    deleteCase: (id) => deleteCmtCase(id),
    listRuns: (caseId) => listCmtRuns(caseId),
    saveRun: (run) => saveCmtRun(run, userId),
    deleteRun: (id) => deleteCmtRun(id),
    loadMudWindow: async (wellbore, stations) => {
      if (!wellbore?.geo_well_id) return null;
      try {
        const curves = await loadPpfgCurves(wellbore.geo_well_id);
        if (!curves || (!curves.PP && !curves.FP)) return null;
        return buildMudWindow(curves, stations, { kbElevM: wellbore.kb_elev_m || 0 });
      } catch {
        return null;
      }
    },
  };
}
