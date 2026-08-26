// Registry-backed backend for the well-control workstation (D1/D2 pattern).
// loadMudWindow: prefills the shoe fracture EMW from the published PP/FP
// window when the wellbore is bridged to geo_wells (manual value stays
// authoritative in the UI).

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import { loadPpfgCurves, buildMudWindow } from '../../well-planning/services/ppfg';
import {
  getDefinitiveTrajectory, getGeometry, saveGeometry,
  listWcCases, saveWcCase, updateWcCase, deleteWcCase,
  listWcRuns, saveWcRun, deleteWcRun, listTdCases,
} from './wcApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites: () => listSites(),
    listWellbores: (siteId) => listWellbores(siteId),
    getDefinitiveTrajectory: (wellboreId) => getDefinitiveTrajectory(wellboreId),
    getGeometry: (wellboreId) => getGeometry(wellboreId),
    saveGeometry: (wellboreId, holeSections) => saveGeometry(wellboreId, holeSections, userId),
    listCases: (wellboreId) => listWcCases(wellboreId),
    saveCase: (row) => saveWcCase(row, userId),
    updateCase: (id, patch) => updateWcCase(id, patch),
    deleteCase: (id) => deleteWcCase(id),
    listRuns: (caseId) => listWcRuns(caseId),
    saveRun: (run) => saveWcRun(run, userId),
    deleteRun: (id) => deleteWcRun(id),
    listTdCases: (wellboreId) => listTdCases(wellboreId),
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
