// Registry-backed backend for the hydraulics workstation (the D1 pattern).
// loadMudWindow: optional PP/FP overlay for wellbores bridged to geo_wells
// (Pore Pressure Studio pp-1.0.0 curves); returns null when unbridged.

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import { loadPpfgCurves, buildMudWindow } from '../../well-planning/services/ppfg';
import {
  getDefinitiveTrajectory, getGeometry, saveGeometry,
  listHydCases, saveHydCase, updateHydCase, deleteHydCase,
  listHydRuns, saveHydRun, deleteHydRun, listTdCases,
} from './hydApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites: () => listSites(),
    listWellbores: (siteId) => listWellbores(siteId),
    getDefinitiveTrajectory: (wellboreId) => getDefinitiveTrajectory(wellboreId),
    getGeometry: (wellboreId) => getGeometry(wellboreId),
    saveGeometry: (wellboreId, holeSections) => saveGeometry(wellboreId, holeSections, userId),
    listCases: (wellboreId) => listHydCases(wellboreId),
    saveCase: (row) => saveHydCase(row, userId),
    updateCase: (id, patch) => updateHydCase(id, patch),
    deleteCase: (id) => deleteHydCase(id),
    listRuns: (caseId) => listHydRuns(caseId),
    saveRun: (run) => saveHydRun(run, userId),
    deleteRun: (id) => deleteHydRun(id),
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
