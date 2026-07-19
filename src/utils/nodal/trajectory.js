/**
 * Well trajectory for the Nodal Analysis Studio (NA1).
 *
 * Builds the MD -> (TVD, local angle-from-vertical) description the
 * pressure traverse marches over. Deviated wells use the minimum curvature
 * method (same formulation as src/lib/wellpath-kernel.js, kept pure and
 * side-effect free here; the NA6 gate cross-checks TVD between the two).
 *
 * Station shape in: { md (ft), inc (deg from vertical), azi (deg) }.
 * Point shape out: { md, tvd, angle } with angle in degrees from vertical
 * for the segment ENDING at that point (angle of the first point is the
 * angle of the first segment for convenience).
 */

import { num } from './numerics.js';

const toRad = (d) => (d * Math.PI) / 180;

/**
 * buildTrajectory({ mode: 'vertical', depthFt })
 * buildTrajectory({ mode: 'deviated', survey: [{md, inc, azi}] })
 * Returns { points: [{md, tvd, angle}], tvdMax, mdMax, warnings }.
 */
export const buildTrajectory = (input = {}) => {
  const warnings = [];
  if (input.mode !== 'deviated') {
    const depth = Math.max(0, num(input.depthFt, 0));
    return {
      points: [
        { md: 0, tvd: 0, angle: 0 },
        { md: depth, tvd: depth, angle: 0 },
      ],
      tvdMax: depth,
      mdMax: depth,
      warnings,
    };
  }

  const survey = (input.survey || [])
    .map((s) => ({ md: num(s.md, NaN), inc: num(s.inc, NaN), azi: num(s.azi, 0) }))
    .filter((s) => Number.isFinite(s.md) && Number.isFinite(s.inc));

  if (survey.length === 0) {
    warnings.push('Deviated mode with an empty survey; treated as a zero-depth well.');
    return { points: [{ md: 0, tvd: 0, angle: 0 }], tvdMax: 0, mdMax: 0, warnings };
  }

  // Anchor at surface if the survey does not start at md 0.
  const stations = survey[0].md > 0
    ? [{ md: 0, inc: 0, azi: survey[0].azi }, ...survey]
    : survey;

  const points = [{ md: stations[0].md, tvd: 0, angle: stations[0].inc }];
  let tvd = 0;

  for (let i = 1; i < stations.length; i += 1) {
    const a = stations[i - 1];
    const b = stations[i];
    const dMd = b.md - a.md;
    if (dMd <= 0) {
      warnings.push(`Survey station at md ${b.md} is not MD-ascending and was skipped.`);
      continue;
    }
    const inc1 = toRad(a.inc);
    const inc2 = toRad(b.inc);
    const azi1 = toRad(a.azi);
    const azi2 = toRad(b.azi);

    const cosDl = Math.cos(inc2 - inc1) - Math.sin(inc1) * Math.sin(inc2) * (1 - Math.cos(azi2 - azi1));
    const dogleg = Math.acos(Math.min(Math.max(cosDl, -1), 1));
    const rf = dogleg > 1e-4 ? (2 / dogleg) * Math.tan(dogleg / 2) : 1;

    const dTvd = (dMd / 2) * (Math.cos(inc1) + Math.cos(inc2)) * rf;
    tvd += dTvd;
    points.push({ md: b.md, tvd, angle: b.inc });
  }

  const last = points[points.length - 1];
  return { points, tvdMax: last.tvd, mdMax: last.md, warnings };
};

/**
 * TVD at an arbitrary MD by linear interpolation between trajectory points
 * (exact for straight segments; adequate between minimum-curvature nodes).
 */
export const tvdAtMd = (trajectory, md) => {
  const pts = trajectory.points;
  if (pts.length === 0) return 0;
  if (md <= pts[0].md) return pts[0].tvd;
  for (let i = 1; i < pts.length; i += 1) {
    if (md <= pts[i].md) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = b.md === a.md ? 0 : (md - a.md) / (b.md - a.md);
      return a.tvd + t * (b.tvd - a.tvd);
    }
  }
  return pts[pts.length - 1].tvd;
};

/** Local angle from vertical (deg) of the segment containing md. */
export const angleAtMd = (trajectory, md) => {
  const pts = trajectory.points;
  if (pts.length < 2) return 0;
  for (let i = 1; i < pts.length; i += 1) {
    if (md <= pts[i].md) return pts[i].angle;
  }
  return pts[pts.length - 1].angle;
};
