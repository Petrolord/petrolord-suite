// Page side of U2-002: read the chosen SCAL Studio project and build its
// saturation-height function through Petrophysics Studio's
// shmFromScalProject (SCAL Studio's own buildJSpec and buildReservoirProps),
// so the build worker receives plain data. The typed FWL keeps its unit.

import { shmFromScalProject } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';

const FT = 0.3048;

/**
 * @param {{projectId?: string, fwl?: string, fwlUnit?: 'm'|'ft'}} shmDef the definition's shm block
 * @param {{loadScalProject?: Function}} backend
 * @returns {Promise<{ok: boolean, errors?: string[], name?: string, jSpec?, reservoir?, fluids?, fwlTvdssM?: ?number, fwlM?: ?number}>}
 */
export async function resolveShm(shmDef, backend) {
  if (!shmDef?.projectId) return { ok: false, errors: ['Sw from saturation-height needs a SCAL Studio project. Pick one in the dock.'] };
  if (!backend.loadScalProject) return { ok: false, errors: ['This backend cannot read SCAL Studio projects.'] };
  const payload = await backend.loadScalProject(shmDef.projectId);
  if (!payload) return { ok: false, errors: ['The SCAL Studio project is no longer saved. Pick another in the dock.'] };
  const shm = shmFromScalProject(payload);
  if (!shm.ok) return shm;
  let fwlM = null;
  const typed = String(shmDef.fwl ?? '').trim();
  if (typed) {
    const v = Number(typed);
    if (!Number.isFinite(v)) return { ok: false, errors: ['The free-water level must be a number.'] };
    fwlM = Math.abs(v) * (shmDef.fwlUnit === 'ft' ? FT : 1);
  }
  return { ...shm, fwlM };
}
