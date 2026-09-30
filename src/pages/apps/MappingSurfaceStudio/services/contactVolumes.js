// Gas cap, oil leg and fault-block volumes of one closure (Mapping &
// Surface Studio upgrade U2-005, 2026-09-30; finding MAP-U1-024).
//
// quickGrv measures one closure above one contact. A reserves engineer
// with a gas cap has two contacts: the gas-oil contact (GOC) and the
// oil-water contact (OWC), and wants each fault block's share. Within
// the closure that the OWC defines (the closure engine's own label), every
// node of cell area A contributes
//
//   total  (z - OWC) A
//   gas    max(0, z - GOC) A                      (the gas cap)
//   oil    (min(z, GOC) - OWC) A                  (the oil leg)
//
// so gas + oil = total node by node, and the total is the closure
// engine's GRV (the same midpoint rule and the same node set). A fault
// block's volumes are the same sums over the closure's nodes in that
// block (the block labels are the gridding's nodeBlocks). One GOC and one
// OWC apply to every block; contacts per block are not modelled here.
// Pure, no I/O.

import { closuresAtContact } from '@/lib/gridding/closure';
import { gridXY } from '@/lib/gridding/gridmath';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

/**
 * @param {Object} p
 * @param {{x0,y0,dx,dy,nx,ny}} p.spec
 * @param {ArrayLike<number>} p.gridM elevation in metres
 * @param {number} p.owcM oil-water contact (or the only contact), elevation in metres
 * @param {?number} [p.gocM] gas-oil contact, elevation in metres; must be above the OWC
 * @param {?number} [p.closureId] the closure (id in closuresAtContact at the OWC); default the highest
 * @param {?number} [p.seedIndex] a node inside the wanted closure (overrides closureId)
 * @param {number} [p.xyToM] metres per map unit
 * @param {?ArrayLike<number>} [p.nodeBlocks] a block id per node (0 = outside every fault polygon)
 * @param {Object<number,string>} [p.blockNames]
 */
export function contactVolumes({ spec, gridM, owcM, gocM = null, seedIndex = null, xyToM = 1, nodeBlocks = null, blockNames = {} }) {
  if (!Number.isFinite(owcM)) throw new Error('Type the oil-water contact.');
  if (gocM != null && !Number.isFinite(gocM)) throw new Error('The gas-oil contact is not a number.');
  if (gocM != null && !(gocM > owcM)) throw new Error('The gas-oil contact must be above (shallower than) the oil-water contact.');
  if (!(xyToM > 0)) throw new Error('This surface is in a geographic CRS (degrees), so it has no area in square metres.');
  if (nodeBlocks && nodeBlocks.length !== gridM.length) throw new Error('The fault blocks do not match the grid frame.');
  const A = Math.abs(spec.dx * spec.dy) * xyToM * xyToM;
  const { closures, label } = closuresAtContact(gridM, spec, { contact: owcM });
  if (!closures.length) return { kind: 'none', totalM3: 0, gasM3: 0, oilM3: 0, blocks: [] };
  let target = closures[0];
  if (seedIndex != null && seedIndex >= 0) {
    if (label[seedIndex] < 0) throw new Error('The picked point is not inside a closure above this contact.');
    target = closures.find((k) => k.id === label[seedIndex]);
  }
  const blocks = new Map();
  const blockOf = (b) => {
    let e = blocks.get(b);
    if (!e) { e = { block: b, name: blockNames[b] ?? (b === 0 ? 'Outside the fault polygons' : `Block ${b}`), totalM3: 0, gasM3: 0, oilM3: 0, areaM2: 0, gasAreaM2: 0, nodes: 0 }; blocks.set(b, e); }
    return e;
  };
  let totalM3 = 0; let gasM3 = 0; let oilM3 = 0; let areaM2 = 0; let gasAreaM2 = 0; let gasNodes = 0;
  for (let i = 0; i < gridM.length; i++) {
    if (label[i] !== target.id || isNull(gridM[i])) continue;
    const z = gridM[i];
    const t = (z - owcM) * A;
    const g = gocM != null && z > gocM ? (z - gocM) * A : 0;
    const o = t - g;
    totalM3 += t; gasM3 += g; oilM3 += o; areaM2 += A;
    if (g > 0) { gasAreaM2 += A; gasNodes += 1; }
    if (nodeBlocks) {
      const e = blockOf(nodeBlocks[i]);
      e.totalM3 += t; e.gasM3 += g; e.oilM3 += o; e.areaM2 += A; e.nodes += 1;
      if (g > 0) e.gasAreaM2 += A;
    }
  }
  const crest = gridXY(spec, Math.floor(target.crest.index / spec.nx), target.crest.index % spec.nx);
  return {
    kind: 'closure',
    closureId: target.id,
    crestZ: target.crest.z,
    crest,
    open: target.open,
    owcM,
    gocM,
    totalM3, gasM3, oilM3, areaM2, gasAreaM2,
    gasCapAboveCrest: gocM != null && gasNodes === 0,
    blocks: [...blocks.values()].sort((a, b) => a.block - b.block),
  };
}

/** One sentence for the read-out. */
export function describeContactVolumes(v, { fmtZ = (m) => `${m.toFixed(1)} m` } = {}) {
  if (v.kind !== 'closure') return '';
  const mm3 = (x) => `${(x / 1e6).toFixed(2)} million m³`;
  const parts = [];
  if (v.gocM != null) {
    parts.push(v.gasCapAboveCrest
      ? `The gas-oil contact at ${fmtZ(v.gocM)} is above the crest: no gas cap; oil leg ${mm3(v.oilM3)}.`
      : `Gas cap ${mm3(v.gasM3)} above ${fmtZ(v.gocM)}; oil leg ${mm3(v.oilM3)} from ${fmtZ(v.gocM)} to ${fmtZ(v.owcM)}.`);
  }
  if (v.blocks.length > 1) {
    parts.push(`By fault block: ${v.blocks.map((b) => `${b.name} ${mm3(b.totalM3)}${v.gocM != null && b.gasM3 > 0 ? ` (gas ${mm3(b.gasM3)})` : ''}`).join('; ')}.`);
  }
  if (v.open && parts.length) parts.push('The closure runs off the map, so each volume is a minimum.');
  return parts.join(' ');
}
