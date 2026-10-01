// The hypsometric (rock volume against depth) model the Monte Carlo
// samples, as plain data (ReservoirCalc Pro upgrade U2-006, 2026-10-01).
//
// buildHypsometry used to return closures (rockToContact, zoneVolumes),
// which cannot cross into a Web Worker. The model is now a table (depth
// levels and cumulative rock volume), and `hypsometryFromTable` gives the
// same functions back on either side of the worker boundary, so the
// worker and the page compute the same numbers from the same table.
// Pure, no imports.

const isNum = (v) => v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v));

/**
 * @typedef {Object} HypsometryTable
 * @property {number} zLo shallowest depth (target units, positive down)
 * @property {number} zHi deepest depth
 * @property {Float64Array|number[]} volume cumulative rock volume at N evenly spaced levels from zLo to zHi
 * @property {?number} edgeElevation contacts (TVDSS elevation) deeper than this are open
 * @property {?number} spillElevation U2-008: the trap fills to this elevation and no deeper
 */

/** The plain-data part of a hypsometry (what crosses into a worker). */
export function hypsometryTable(h) {
  if (!h) return null;
  return {
    kind: 'hypsometry-table',
    zLo: h.zLo,
    zHi: h.zHi,
    volume: h.volume,
    vTotal: h.vTotal,
    totalArea: h.totalArea,
    edgeElevation: Number.isFinite(h.edgeElevation) ? h.edgeElevation : null,
    spillElevation: Number.isFinite(h.spillElevation) ? h.spillElevation : null,
    isField: !!h.isField,
    volUnit: h.volUnit,
    areaUnit: h.areaUnit,
    source: h.source || 'grid',
  };
}

/**
 * The model's functions from its table.
 *   rockToContact(userZ): rock volume between the top and a contact
 *     (TVDSS elevation in workspace units), capped at the base.
 *   zoneVolumes(fluidType, owc, goc): { grvOil, grvGas }.
 * With a spill elevation (U2-008) a contact below the spill point is
 * taken at the spill point: the trap cannot hold a column below it.
 */
export function hypsometryFromTable(t) {
  const { zLo, zHi } = t;
  const volume = t.volume;
  const N = volume.length;
  const vTotal = volume[N - 1];
  const span = Math.max(zHi - zLo, 1e-9);
  const spill = Number.isFinite(t.spillElevation) ? t.spillElevation : null;
  // a contact deeper (more negative) than the spill fills only to the spill
  const atSpill = (userZ) => (spill !== null && userZ < spill ? spill : userZ);
  const rockToContact = (userZ) => {
    if (!isNum(userZ)) return spill !== null ? rockToContact(spill) : vTotal;
    const z = -atSpill(parseFloat(userZ));
    if (z <= zLo) return 0;
    if (z >= zHi) return vTotal;
    const s = ((z - zLo) / span) * (N - 1);
    const i = Math.floor(s);
    const frac = s - i;
    return volume[i] + (volume[Math.min(i + 1, N - 1)] - volume[i]) * frac;
  };
  const zoneVolumes = (fluidType, owc, goc) => {
    if (fluidType === 'gas') {
      const gwc = isNum(goc) ? goc : owc;
      return { grvOil: 0, grvGas: rockToContact(gwc) };
    }
    if (fluidType === 'oil_gas' && isNum(goc)) {
      // RCP-U1-007: a GOC below the OWC stops at the OWC
      const g = isNum(owc) ? Math.max(parseFloat(goc), parseFloat(owc)) : parseFloat(goc);
      const vGoc = rockToContact(g);
      const vOwc = rockToContact(owc);
      return { grvGas: vGoc, grvOil: Math.max(0, vOwc - vGoc) };
    }
    return { grvOil: rockToContact(owc), grvGas: 0 };
  };
  /** True when this contact is below the spill point (filled to spill). */
  const belowSpill = (userZ) => spill !== null && isNum(userZ) && parseFloat(userZ) < spill;
  return {
    ...t,
    vTotal,
    rockToContact,
    zoneVolumes,
    belowSpill,
  };
}

/** A hypsometry ready to sample, from either form. */
export function asHypsometry(h) {
  if (!h) return null;
  if (typeof h.zoneVolumes === 'function') return h;
  if (h.kind === 'hypsometry-table' || (h.volume && Number.isFinite(h.zLo))) return hypsometryFromTable(h);
  return null;
}
