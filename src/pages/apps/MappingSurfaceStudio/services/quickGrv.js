// Quick gross rock volume of ONE closure above a contact (Mapping MS3,
// rebuilt for T1 findings MAP-T1-001/-002 and E1, 2026-09-26).
//
// The first version summed every node above the contact, so two domes
// counted twice and a contact below the mapped area returned the whole
// map as a volume with no warning. Now the volume belongs to one closure
// (the highest, or the one under a picked point), and the read-out says
// whether that closure is CLOSED on the map or runs off it (then the
// number is a minimum, not a trap volume), where the structure spills,
// whether it joins a neighbouring culmination on the way down, and how
// many other closures sit above the same contact. The closure engine
// (lib/gridding/closure.js) does the geometry; the byte-golden grvAcreFt
// convention (midpoint rule, |dx dy| per node) is kept, so the dome
// golden still reproduces its oracle. ReservoirCalc Pro stays the place
// for fluids and uncertainty.

import { closuresAtContact, spillAnalysis, closureCurve } from '@/lib/gridding/closure';
import { surfaceStats } from '../engine/surface';

export const M_PER_FT = 0.3048;
export const M3_PER_ACRE_FT = 1233.48183754752;
export const M2_PER_ACRE = 4046.8564224;

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

/**
 * Read a typed contact against the map (MAP-T1-004). The registry is
 * elevation (negative below datum); a user who types 4900 for 4,900 ft
 * TVDSS means a depth. When the typed value is above the whole map and
 * its negative falls inside the map's range, it is read as a depth.
 * @param {number} typedM the typed value converted to metres
 * @param {ArrayLike<number>} gridM elevation grid in metres
 * @returns {{contactM:number, readAsDepth:boolean}}
 */
export function interpretContact(typedM, gridM) {
  if (!Number.isFinite(typedM)) throw new Error('Type the contact.');
  const st = surfaceStats(gridM);
  if (typedM > st.max && -typedM <= st.max && -typedM >= st.min) return { contactM: -typedM, readAsDepth: true };
  return { contactM: typedM, readAsDepth: false };
}

/** Grid node nearest a world point (for a picked closure), or -1 off the grid. */
export function nodeAt(spec, x, y) {
  const c = Math.round((x - spec.x0) / spec.dx);
  const r = Math.round((y - spec.y0) / spec.dy);
  if (c < 0 || r < 0 || c >= spec.nx || r >= spec.ny) return -1;
  return r * spec.nx + c;
}

/**
 * @param {{spec, gridM:Float32Array, contactM:number, seedIndex?:number, levels?:number}} p
 *   contact as elevation in metres (negative below datum); seedIndex picks
 *   the closure containing that node (default: the highest closure)
 * @returns {{kind:'none'|'closure', crestZ:number, grvAcreFt:number, grvM3:number,
 *   areaM2:number, areaAcres:number, areaKm2:number, nodesAbove:number,
 *   open?:boolean, closure?:object, spill?:object, curve?:Array, others?:Array}}
 */
export function quickGrv({ spec, gridM, contactM, seedIndex = null, levels = 30 }) {
  if (!Number.isFinite(contactM)) throw new Error('Type the contact elevation.');
  const st = surfaceStats(gridM);
  const empty = { contactM, crestZ: st.max, grvAcreFt: 0, grvM3: 0, areaM2: 0, areaAcres: 0, areaKm2: 0, nodesAbove: 0 };
  const { closures, label } = closuresAtContact(gridM, spec, { contact: contactM });
  if (!closures.length) return { kind: 'none', ...empty };
  let target = closures[0];
  if (seedIndex != null && seedIndex >= 0) {
    if (isNull(gridM[seedIndex]) || label[seedIndex] < 0) {
      throw new Error('The picked point is not inside a closure above this contact.');
    }
    target = closures.find((k) => k.id === label[seedIndex]);
  }
  const relief = Number.isFinite(st.max - st.min) ? Math.max(0.5, 0.01 * (st.max - st.min)) : 0.5;
  const spill = spillAnalysis(gridM, spec, { seed: target.crest.index, minRelief: relief });
  const curve = closureCurve(spill, spec, { levels });
  return {
    kind: 'closure',
    contactM,
    crestZ: target.crest.z,
    grvM3: target.grvM3,
    grvAcreFt: target.grvM3 / M3_PER_ACRE_FT,
    areaM2: target.areaM2,
    areaAcres: target.areaM2 / M2_PER_ACRE,
    areaKm2: target.areaM2 / 1e6,
    nodesAbove: target.nodes,
    open: target.open,
    closure: target,
    spill: {
      z: spill.spillZ, x: spill.spill.x, y: spill.spill.y, limitedByEdge: spill.limitedByEdge,
      merges: spill.merges.map((m) => ({ saddleZ: m.saddleZ, x: m.saddle.x, y: m.saddle.y, culminationZ: m.culminationZ })),
    },
    curve,
    others: closures.filter((k) => k !== target).map((k) => ({ crestZ: k.crest.z, x: k.crest.x, y: k.crest.y, grvM3: k.grvM3, open: k.open })),
  };
}

const fmtN = (v, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

/**
 * The read-out, in plain sentences.
 * @param {object} r quickGrv result
 * @param {{contactLabel:string, fmtZ:(m:number)=>string}} o fmtZ formats an elevation in metres for display
 */
export function describeGrv(r, { contactLabel, fmtZ = (m) => `${m.toFixed(1)} m` }) {
  if (r.kind === 'none') return `No structure closes above ${contactLabel}: the shallowest mapped point is ${fmtZ(r.crestZ)}.`;
  const vol = `${fmtN(r.grvAcreFt)} acre-ft (${fmtN(r.grvM3 / 1e6, 2)} million m³)`;
  const area = `${fmtN(r.areaKm2, 2)} km² (${fmtN(r.areaAcres)} acres)`;
  const parts = [];
  if (r.open && r.spill.z >= r.crestZ) {
    // the highest point is itself on the edge of the mapped area
    parts.push(`Not a trap volume: the crest (${fmtZ(r.crestZ)}) sits on the edge of the mapped area, so the map shows no closed structure there; ${vol} over ${area} above ${contactLabel} is only a minimum.`);
    parts.push('Extend the map past the wells, or grid a larger area, to see whether it closes.');
  } else if (r.open) {
    parts.push(`Not a trap volume: the closure above ${contactLabel} runs off the mapped area, so ${vol} over ${area} is only a minimum.`);
    parts.push(`The structure is closed down to ${fmtZ(r.spill.z)}${r.spill.limitedByEdge ? ', where the map edge cuts it; a larger map may close deeper' : ''}.`);
  } else {
    parts.push(`GRV ${vol} above ${contactLabel}; area ${area}.`);
    parts.push(`Closed on the map, crest ${fmtZ(r.crestZ)}; it spills at ${fmtZ(r.spill.z)}${r.spill.limitedByEdge ? ' where the map edge cuts it' : ''}.`);
  }
  for (const m of r.spill.merges) {
    const contactM = r.contactM;
    parts.push(Number.isFinite(contactM) && m.saddleZ > contactM
      ? `It includes the neighbouring culmination cresting at ${fmtZ(m.culminationZ)}: the two join at ${fmtZ(m.saddleZ)}.`
      : `Below ${fmtZ(m.saddleZ)} it joins the culmination cresting at ${fmtZ(m.culminationZ)} (fill and spill).`);
  }
  if (r.others.length) {
    const big = r.others.reduce((a, b) => (b.grvM3 > a.grvM3 ? b : a));
    parts.push(`${r.others.length} other closure${r.others.length === 1 ? '' : 's'} above the contact ${r.others.length === 1 ? 'is' : 'are'} not counted (the largest ${fmtN(big.grvM3 / 1e6, 2)} million m³); pick one on the map to measure it.`);
  }
  return parts.join(' ');
}
