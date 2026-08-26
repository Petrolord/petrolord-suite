// Registry curve preparation for the perforation & sand control
// workstation: published-curve pickers for the gm-1.0.0 stress/strength
// logs and the pp-1.0.0 pore-pressure/overburden logs, plus the combined
// profile assembly the sanding engine expects. This file may use
// aliases; psRun stays pure.

import { pickPublishedPpfg, logGrid, PP_PIPELINE } from '../../GeomechanicsStudio/services/prepGm';
import { GM_PIPELINE_VERSION } from '../../GeomechanicsStudio/services/publishGm';

export { pickPublishedPpfg, logGrid, PP_PIPELINE };
export const GM_PIPELINE = GM_PIPELINE_VERSION;

// Latest gm-1.0.0 curve per mnemonic (rows arrive created_at ascending).
export function pickPublishedGm(logs) {
  const out = {};
  for (const log of logs || []) {
    if (log.provenance?.pipeline_version !== GM_PIPELINE) continue;
    const m = (log.mnemonic || '').toUpperCase();
    if (['SHMIN', 'SHMAX', 'UCS'].includes(m)) out[m] = log;
  }
  return out;
}

// Published gm (SHMIN/SHMAX/UCS) + pp (PP/OBG) MPA curves → the profile
// arrays cdpAlongInterval expects (Pa). All five must share one grid —
// gm-1.0.0 publishes on the pp grid, so a mismatch means a stale publish.
export function publishedToCurves({ gm, ppfg, data }) {
  const need = [
    ['SHMIN', gm.SHMIN], ['SHMAX', gm.SHMAX], ['UCS', gm.UCS],
    ['PP', ppfg.PP], ['OBG', ppfg.OBG],
  ];
  for (const [name, log] of need) {
    if (!log) return { missing: name, curves: null };
  }
  const tvdM = logGrid(gm.SHMIN);
  for (const [name, log] of need) {
    const grid = logGrid(log);
    if (grid.length !== tvdM.length || Math.abs(grid[0] - tvdM[0]) > 1e-6) {
      throw new Error(`Published ${name} curve is on a different grid; republish from its studio.`);
    }
  }
  const toPa = (arr) => Array.from(arr, (v) => (Number.isFinite(v) ? v * 1e6 : null));
  return {
    missing: null,
    curves: {
      tvdM,
      shminPa: toPa(data.SHMIN),
      shmaxPa: toPa(data.SHMAX),
      ucsPa: toPa(data.UCS),
      ppPa: toPa(data.PP),
      svPa: toPa(data.OBG),
    },
  };
}
