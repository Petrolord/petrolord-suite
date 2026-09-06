// Seismolord 3D math: the generic half (matrices, orbit camera, cube
// edges, picking, ticks) lives in the shared src/components/viewer3d
// module since Earth Modeling EM6 (2026-09-06); the survey-specific
// extents and slice-plane quads stay here. Re-exported by identity so
// every consumer and test keeps its import.

import { surveySpacing } from './annotations';

export {
  mat4Multiply, mat4Perspective, mat4LookAt, transformPoint, cubeEdges,
  OrbitCamera, intersectQuad, niceTicks,
} from '@/components/viewer3d/math3d';

// ---- survey cube geometry (Seismolord-specific) -------------------------

/**
 * Normalized cube extents. Ground aspect from manifest corners when
 * available (else index-count aspect); D = 0.6 * vexag so the cube reads
 * like a survey box at vexag 1.
 * @returns {{X:number, D:number, Z:number}}
 */
export function cubeExtents(manifest, geom, vexag = 1) {
  const sp = manifest ? surveySpacing(manifest) : null;
  const wx = geom.nXl * (sp ? sp.xlSpacing : 1);
  const wz = geom.nIl * (sp ? sp.ilSpacing : 1);
  const m = Math.max(wx, wz) || 1;
  return { X: wx / m, D: 0.6 * Math.max(vexag, 1e-3), Z: wz / m };
}

/**
 * A slice plane as a parametric quad: point(u, v) = origin + u*du + v*dv,
 * with (u, v) EXACTLY the assembled slice's normalized texture coords
 * (u = data width axis: samples on sections, crosslines on time slices;
 * v = trace axis: crosslines / inlines). Sections hang downward from the
 * top face; time slices lie flat at their sample depth.
 * @param {'inline'|'xline'|'time'} orientation
 */
export function planeQuad(orientation, index, geom, ext) {
  const { X, D, Z } = ext;
  if (orientation === 'inline') {
    const z0 = ((index + 0.5) / geom.nIl) * Z;
    return { origin: [0, 0, z0], du: [0, -D, 0], dv: [X, 0, 0] };
  }
  if (orientation === 'xline') {
    const x0 = ((index + 0.5) / geom.nXl) * X;
    return { origin: [x0, 0, 0], du: [0, -D, 0], dv: [0, 0, Z] };
  }
  const y0 = -((index + 0.5) / geom.ns) * D;
  return { origin: [0, y0, 0], du: [X, 0, 0], dv: [0, 0, Z] };
}

