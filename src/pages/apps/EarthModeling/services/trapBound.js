// A hydrocarbon leg bounded by its closure and spill (Earth Modeling upgrade
// U2-006, 2026-10-01; finding EM-U1-008). Without it every node above the
// OWC counts, so a contact below the spill point books the whole flank to
// the frame edge as a trap volume.
//
// The closure engine is Mapping & Surface Studio's (packages/engines
// lib/gridding/closure.js: closuresAtContact, spillAnalysis, closureAt),
// run on the zone top as elevation. For each contact the zone uses (one per
// fault block when U2-005 contacts differ):
//   - a closure above the contact that stays inside the mapped area keeps
//     the contact (the trap is closed above it);
//   - a closure that runs to the edge of the mapped area is filled only to
//     its spill point: the nodes of the flood from its crest above the
//     spill keep the spill depth as their contact, every other node of that
//     closure holds no hydrocarbon;
//   - when the spill is itself on the edge of the mapped area
//     (limitedByEdge) the trap may continue past the frame: the leg stops
//     there and the zone is flagged open.
// The result is a contact per node, which the volume engine takes
// (zoneVolumesWithContacts, engines PR #291). Pure, no I/O.

import { closuresAtContact, spillAnalysis, closureAt } from '@/lib/gridding/closure';
import { isNull } from '@/lib/gridding/gridmath';
import { NULL_VALUE } from '@/lib/gridding/numeric';

/** A contact shallower than any node: no hydrocarbon at that node. */
export const NO_LEG = -1e12;

/**
 * @param {{x0,y0,dx,dy,nx,ny}} spec the model frame (metres)
 * @param {ArrayLike<number>} top zone top, depth in metres positive down (null nodes allowed)
 * @param {Float64Array} owc the OWC per node in metres (NaN = none there)
 * @returns {{owc: Float64Array, traps: Array<{contactM:number, crestM:number, closed:boolean,
 *   spillM:?number, spillXY:?{x:number,y:number}, limitedByEdge:boolean, nodes:number, bounded:boolean}>,
 *   cutNodes:number, openEdge:boolean}}
 */
export function boundLegByClosure(spec, top, owc) {
  const n = spec.nx * spec.ny;
  if (top.length !== n || owc.length !== n) throw new Error('The zone top and its contacts must share the model frame.');
  const elev = new Float64Array(n);
  for (let j = 0; j < n; j++) elev[j] = isNull(top[j]) ? NULL_VALUE : -top[j];
  const out = Float64Array.from(owc);
  const traps = [];
  let cutNodes = 0;
  let openEdge = false;
  const contacts = [...new Set(Array.from(owc).filter(Number.isFinite))].sort((a, b) => a - b);
  for (const c of contacts) {
    const { closures, label } = closuresAtContact(elev, spec, { contact: -c });
    for (const k of closures) {
      const members = [];
      for (let j = 0; j < n; j++) if (label[j] === k.id && owc[j] === c) members.push(j);
      if (!members.length) continue;
      if (!k.open) {
        traps.push({ contactM: c, crestM: -k.crest.z, closed: true, spillM: null, spillXY: null, limitedByEdge: false, nodes: members.length, bounded: false });
        continue;
      }
      // open above this contact: fill the trap to its spill point only
      const sa = spillAnalysis(elev, spec, { seed: k.crest.index });
      const keep = closureAt(sa, spec, sa.spillZ).nodes;
      const inTrap = new Uint8Array(n);
      for (let q = 0; q < keep; q++) inTrap[sa.order[q]] = 1;
      const spillM = -sa.spillZ;
      let kept = 0;
      for (const j of members) {
        if (inTrap[j] && spillM < c) { out[j] = spillM; kept += 1; } else if (inTrap[j]) { kept += 1; } else { out[j] = NO_LEG; cutNodes += 1; }
      }
      if (sa.limitedByEdge) openEdge = true;
      traps.push({
        contactM: c, crestM: -k.crest.z, closed: false, spillM, spillXY: { x: sa.spill.x, y: sa.spill.y },
        limitedByEdge: sa.limitedByEdge, nodes: kept, bounded: true,
      });
    }
  }
  return { owc: out, traps, cutNodes, openEdge };
}

/** One sentence per zone for QC and the reports (depths through fmt). */
export function describeTraps(res, fmt = (m) => `${m.toFixed(1)} m`) {
  if (!res) return '';
  const bits = [];
  for (const t of res.traps) {
    if (t.closed) bits.push(`closed above the contact at ${fmt(t.contactM)} (crest ${fmt(t.crestM)})`);
    else if (t.limitedByEdge) bits.push(`the trap with crest ${fmt(t.crestM)} spills at the model edge at ${fmt(t.spillM)}, so the leg stops there and may continue past the frame`);
    else bits.push(`the trap with crest ${fmt(t.crestM)} spills at ${fmt(t.spillM)} (x ${t.spillXY.x.toFixed(0)}, y ${t.spillXY.y.toFixed(0)}), above the contact at ${fmt(t.contactM)}: filled to spill`);
  }
  if (res.cutNodes) bits.push(`${res.cutNodes} node${res.cutNodes === 1 ? '' : 's'} above the contact but outside the trap hold no hydrocarbon`);
  return bits.join('; ');
}
