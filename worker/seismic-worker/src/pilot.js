// QI pilot sub-volume (crop before upload programme, 2026-10-14): an
// inversion, simultaneous inversion, AVO or property run limited to an
// inline and crossline range and a time window, so a QI study can be tried
// on a small area before the whole survey. The output is a derived volume on
// the parent's lattice (so it co-renders with the parent) holding only the
// bricks the window touches; every other brick reads as null
// (engines pilotBrickFetcher). The manifest and the row say it is a pilot.
//
// params.pilot: { il: {from, to}, xl: {from, to}, t_ms: {from, to},
//                 crop_name?, definition_id? } in the volume's own inline,
//                 crossline and millisecond numbers.
import { pilotWindow, pilotBricks } from '../../../packages/engines/engines/seismolord/volumeJob.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Why the pilot settings cannot run, or null. */
export function pilotProblem(pilot) {
  if (pilot == null) return null;
  if (typeof pilot !== 'object') return 'pilot must be an object.';
  for (const k of ['il', 'xl', 't_ms']) {
    const r = pilot[k];
    if (r == null) continue;
    if (typeof r !== 'object' || !isNum(r.from) || !isNum(r.to) || r.from > r.to) return `The pilot ${k === 't_ms' ? 'time window' : k === 'il' ? 'inline range' : 'crossline range'} needs a from no greater than its to.`;
  }
  if (pilot.crop_name != null && (typeof pilot.crop_name !== 'string' || pilot.crop_name.length > 120)) return 'The pilot crop name is too long.';
  return null;
}

/**
 * The pilot on a volume: grid window, brick ranges and the record kept on
 * the output. Null when there is no pilot.
 * @param {?Object} pilot params.pilot
 * @param {Object} manifest the parent manifest
 */
export function pilotOn(pilot, manifest) {
  if (!pilot) return null;
  const g = manifest.geometry;
  const geom = { nIl: g.il.count, nXl: g.xl.count, ns: g.ns };
  const dtMs = g.dt_us / 1000;
  const idx = (axis, v, up) => {
    const step = axis.step || 1;
    const x = (v - axis.min) / step;
    return up ? Math.ceil(x - 1e-9) : Math.floor(x + 1e-9);
  };
  const raw = {
    i0: pilot.il ? idx(g.il, pilot.il.from, true) : 0,
    i1: pilot.il ? idx(g.il, pilot.il.to, false) : geom.nIl - 1,
    j0: pilot.xl ? idx(g.xl, pilot.xl.from, true) : 0,
    j1: pilot.xl ? idx(g.xl, pilot.xl.to, false) : geom.nXl - 1,
    k0: pilot.t_ms ? Math.floor(pilot.t_ms.from / dtMs + 1e-9) : 0,
    k1: pilot.t_ms ? Math.ceil(pilot.t_ms.to / dtMs - 1e-9) : geom.ns - 1,
  };
  if (raw.i1 < 0 || raw.i0 >= geom.nIl || raw.j1 < 0 || raw.j0 >= geom.nXl || raw.k1 < 0 || raw.k0 >= geom.ns) {
    throw new Error('The pilot area is outside this volume.');
  }
  const window = pilotWindow(raw, geom);
  const step = (a) => a.step || 1;
  const record = {
    il: { from: g.il.min + window.i0 * step(g.il), to: g.il.min + window.i1 * step(g.il) },
    xl: { from: g.xl.min + window.j0 * step(g.xl), to: g.xl.min + window.j1 * step(g.xl) },
    t_ms: { from: window.k0 * dtMs, to: window.k1 * dtMs },
    grid: window,
    bricks: pilotBricks(window, manifest.brick.size),
    ...(pilot.crop_name ? { crop_name: pilot.crop_name } : {}),
    ...(pilot.definition_id ? { definition_id: String(pilot.definition_id).slice(0, 64) } : {}),
  };
  return { window, record };
}

/** Bricks one output of a pilot run writes, in bytes (float32). */
export function pilotBytes(record, manifest) {
  const w = record.bricks;
  return (w.i1 - w.i0 + 1) * (w.j1 - w.j0 + 1) * (w.k1 - w.k0 + 1) * manifest.brick.size ** 3 * 4;
}
