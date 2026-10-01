// Gridding settings saved with the project (ReservoirCalc Pro upgrade
// U2-013, 2026-10-01; RCP-U1-023 stamped them on the result, this stores
// them). The grid resolution and the interpolation method change a
// structural volume, and they used to be a per-browser preference only,
// so one project could give two volumes on two machines. A project now
// carries the gridding it was saved with; the browser setting is the
// default for a new project and for projects saved before this release
// (said in Settings). Pure.

import { DEFAULT_SETTINGS } from '../hooks/useReservoirSettings';

const RES_OK = (v) => Number.isFinite(Number(v)) && Number(v) >= 20 && Number(v) <= 600;
const METHOD_OK = (m) => m === 'kriging' || m === 'idw';

/** A stored gridding record, or null when it is missing or malformed. */
export function cleanGridding(g) {
  if (!g || typeof g !== 'object') return null;
  if (!RES_OK(g.gridResolution) || !METHOD_OK(g.interpolationMethod)) return null;
  return { gridResolution: Math.round(Number(g.gridResolution)), interpolationMethod: g.interpolationMethod };
}

/**
 * The gridding a calculation uses: the project's, else the browser's.
 * @returns {{gridResolution: number, interpolationMethod: string, source: 'project'|'browser'}}
 */
export function effectiveGridding(projectGridding, browserSettings = DEFAULT_SETTINGS) {
  const p = cleanGridding(projectGridding);
  if (p) return { ...p, source: 'project' };
  const b = cleanGridding(browserSettings) || cleanGridding(DEFAULT_SETTINGS);
  return { ...b, source: 'browser' };
}
