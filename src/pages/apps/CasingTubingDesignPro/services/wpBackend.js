// Registry-backed backend for the casing & tubing workstation (the D1
// pattern). loadMudWindow: optional PP/FP overlay for wellbores bridged to
// geo_wells (Pore Pressure Studio pp-1.0.0 curves); returns null when
// unbridged — the environment tab falls back to manual EMW inputs.

import { listSites, listWellbores } from '../../well-planning/services/wpApi';
import { loadPpfgCurves, buildMudWindow } from '../../well-planning/services/ppfg';
import {
  getDefinitiveTrajectory,
  listCtCases, saveCtCase, updateCtCase, deleteCtCase,
  listCtRuns, saveCtRun, deleteCtRun,
} from './ctApi';

export function makeWpBackend({ userId }) {
  return {
    kind: 'wp',
    listSites: () => listSites(),
    listWellbores: (siteId) => listWellbores(siteId),
    getDefinitiveTrajectory: (wellboreId) => getDefinitiveTrajectory(wellboreId),
    listCases: (wellboreId) => listCtCases(wellboreId),
    saveCase: (row) => saveCtCase(row, userId),
    updateCase: (id, patch) => updateCtCase(id, patch),
    deleteCase: (id) => deleteCtCase(id),
    listRuns: (caseId) => listCtRuns(caseId),
    saveRun: (run) => saveCtRun(run, userId),
    deleteRun: (id) => deleteCtRun(id),
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
