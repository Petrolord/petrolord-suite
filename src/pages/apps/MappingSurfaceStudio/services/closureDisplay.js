// The measured closure drawn on the map (Geoscience video Part B,
// 2026-10-17). Quick GRV already knows the trap: the closure engine's
// spill flood (lib/gridding/closure.js spillAnalysis) pops nodes from the
// crest down, and closureAt reads how many of them stay above a level. The
// first N nodes of that flood ARE the closed area at that level, so the
// masks here are read straight off the engine's output (no new geometry):
//   closed  the nodes above the spill level (the whole trap)
//   hc      the nodes above the contact (the hydrocarbon area)
//   gas     the nodes above the gas-oil contact, when one is typed
// Each level's outline is the contour of the grid at that level traced
// round its own mask only, so a neighbouring high at the same depth does
// not draw a second ring.

import { closureAt } from '@/lib/gridding/closure';
import { contourPolylines } from '@/lib/gridding/mapContours';
import { gridXY } from '@/lib/gridding/gridmath';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

export const CLOSURE_STYLE = Object.freeze({
  closedFill: [250, 204, 21, 0.30],   // gold, the whole trap down to the spill
  hcFill: [22, 163, 74, 0.50],        // green, above the contact
  gasFill: [239, 68, 68, 0.50],       // red, above the gas-oil contact
  spillLine: '#fde047',
  contactLine: '#2563eb',
  gocLine: '#dc2626',
  crest: '#fde047',
});

const rgba = ([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a})`;

/** Nodes of the spill flood above a level (the trap's closure at that level), as a 0/1 mask. */
export function floodMask(spill, spec, level) {
  const mask = new Uint8Array(spec.nx * spec.ny);
  const { nodes } = closureAt(spill, spec, level);
  for (let k = 0; k < nodes; k++) mask[spill.order[k]] = 1;
  return { mask, nodes };
}

/**
 * World polylines of the contour at `level` traced round `mask` only:
 * live nodes outside the mask are held just below the level.
 * @returns {Float64Array[]} flat [x0, y0, x1, y1, ...] in map units
 */
export function maskContour(gridM, spec, mask, level) {
  const eps = 1e-6 * Math.max(1, Math.abs(level));
  const g = new Float32Array(gridM.length);
  for (let i = 0; i < gridM.length; i++) {
    const v = gridM[i];
    g[i] = isNull(v) || mask[i] ? v : Math.min(v, level - eps);
  }
  return contourPolylines(g, spec.ny, spec.nx, level).map((poly) => {
    const out = new Float64Array(poly.length);
    for (let k = 0; k < poly.length; k += 2) {
      const w = gridXY(spec, poly[k + 1], poly[k]);
      out[k] = w.x; out[k + 1] = w.y;
    }
    return out;
  });
}

/**
 * Everything the map draws for a measured closure.
 * @param {object} p
 * @param {object} p.grv quickGrv result (kind 'closure', with spillFlood)
 * @param {Float32Array} p.gridM elevation grid in metres
 * @param {object} p.spec frame
 * @param {(m:number)=>string} p.fmtDepth an elevation in metres as a display depth ("5,105 ft")
 * @param {?number} [p.gocM] gas-oil contact elevation in metres
 * @returns {null|{fills:Array, lines:Array, markers:Array, legend:Array}}
 */
export function closureLayers({ grv, gridM, spec, fmtDepth, gocM = null }) {
  if (!grv || grv.kind !== 'closure' || !grv.spillFlood || !gridM || !spec) return null;
  const spill = grv.spillFlood;
  const S = CLOSURE_STYLE;
  const fills = []; const lines = []; const legend = [];
  const closed = floodMask(spill, spec, spill.spillZ);
  if (closed.nodes > 0) {
    fills.push({ mask: closed.mask, color: S.closedFill });
    for (const pts of maskContour(gridM, spec, closed.mask, spill.spillZ)) lines.push({ points: pts, color: S.spillLine, width: 3, halo: true, fill: S.closedFill });
    legend.push({ kind: 'fill', color: rgba(S.closedFill), label: `Closure to spill ${fmtDepth(spill.spillZ)}` });
    legend.push({ kind: 'line', color: S.spillLine, label: 'Spill contour' });
  }
  const contactM = grv.contactM;
  // a contact below the spill fills the trap to the spill: the green area is the whole closure and no contact line is drawn
  if (Number.isFinite(contactM) && contactM < spill.crest.z) {
    const level = Math.max(contactM, spill.spillZ);
    const hc = floodMask(spill, spec, level);
    if (hc.nodes > 0) {
      fills.push({ mask: hc.mask, color: S.hcFill });
      if (contactM > spill.spillZ) {
        for (const pts of maskContour(gridM, spec, hc.mask, contactM)) lines.push({ points: pts, color: S.contactLine, width: 2.5, dash: [8, 5], halo: true, fill: S.hcFill });
        legend.push({ kind: 'fill', color: rgba(S.hcFill), label: 'Above the contact' });
        legend.push({ kind: 'line', color: S.contactLine, dash: [8, 5], label: `Contact ${fmtDepth(contactM)}` });
      } else {
        legend.push({ kind: 'fill', color: rgba(S.hcFill), label: `Filled to spill (contact ${fmtDepth(contactM)})` });
      }
    }
  }
  if (Number.isFinite(gocM) && gocM > spill.spillZ && gocM < spill.crest.z && (!Number.isFinite(contactM) || gocM > contactM)) {
    const gas = floodMask(spill, spec, gocM);
    if (gas.nodes > 0) {
      fills.push({ mask: gas.mask, color: S.gasFill });
      for (const pts of maskContour(gridM, spec, gas.mask, gocM)) lines.push({ points: pts, color: S.gocLine, width: 2.5, dash: [8, 5], halo: true, fill: S.gasFill });
      legend.push({ kind: 'fill', color: rgba(S.gasFill), label: 'Gas cap' });
      legend.push({ kind: 'line', color: S.gocLine, dash: [8, 5], label: `GOC ${fmtDepth(gocM)}` });
    }
  }
  const markers = [{ x: spill.crest.x, y: spill.crest.y, label: `crest ${fmtDepth(spill.crest.z)}`, color: S.crest, shape: 'cross' }];
  return { fills, lines, markers, legend };
}
