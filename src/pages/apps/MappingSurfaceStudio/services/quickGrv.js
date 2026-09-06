// Quick gross rock volume above a contact (Mapping MS3, 2026-09-05) on
// an elevation grid held in metres: the byte-golden grvAcreFt (feet,
// negative down) does the sum, so the map's number is the same one
// ReservoirCalc Pro's handoff test pins. A read-out, not a volumetrics
// home: ReservoirCalc Pro stays the place for fluids and uncertainty.

import { grvAcreFt } from '@/lib/gridding/surfaceExport';
import { convertZUnit } from '@/lib/gridding/gridmath';
import { gridObject } from '../engine/surface';

export const M_PER_FT = 0.3048;
export const M3_PER_ACRE_FT = 1233.48183754752;
export const M2_PER_ACRE = 4046.8564224;

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

/**
 * @param {{spec, gridM:Float32Array, contactM:number}} p contact as
 *   elevation in metres (negative below datum)
 * @returns {{grvAcreFt:number, grvM3:number, areaM2:number, areaAcres:number, areaKm2:number, nodesAbove:number}}
 */
export function quickGrv({ spec, gridM, contactM }) {
  if (!Number.isFinite(contactM)) throw new Error('Type the contact elevation.');
  const zFt = convertZUnit(gridM, 'm', 'ft');
  const g = gridObject(spec, zFt);
  const acreFt = grvAcreFt(g, spec.dx, spec.dy, contactM / M_PER_FT);
  let nodesAbove = 0;
  for (const v of gridM) if (!isNull(v) && v > contactM) nodesAbove += 1;
  const areaM2 = nodesAbove * spec.dx * spec.dy;
  return {
    grvAcreFt: acreFt,
    grvM3: acreFt * M3_PER_ACRE_FT,
    areaM2,
    areaAcres: areaM2 / M2_PER_ACRE,
    areaKm2: areaM2 / 1e6,
    nodesAbove,
  };
}

/** One line for the dock. */
export function describeGrv(r, { contactLabel }) {
  const fmt = (v, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d });
  return `GRV ${fmt(r.grvAcreFt)} acre-ft (${fmt(r.grvM3 / 1e6, 2)} million m³) above ${contactLabel}; `
    + `area ${fmt(r.areaKm2, 2)} km² (${fmt(r.areaAcres)} acres, ${r.nodesAbove} nodes).`;
}
