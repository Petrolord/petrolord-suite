// The water column a registry well's own datum states (2026-10-13). Before,
// a new project opened every well with Water depth 0 and Mudline MD 0, so
// an offshore well that the user did not set by hand was computed as a land
// well: the pore fluid column ran from the rotary table (Ekene-8: 60 m of
// seawater instead of 35 m) and "below mudline" meant below the rotary table.
// The datum is read through the Suite's one reader (src/lib/wellDatum.js).
import { readWellDatum, surfaceTvd } from '@/lib/wellDatum';

const unset = (v) => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) === 0;

/**
 * Water depth and mudline MD from a geo_wells row, or null when the datum
 * does not say (no environment, no reference elevation, offshore with no
 * water depth). Offshore: water depth as stated, mudline MD = reference
 * elevation (the air gap) + water depth. Onshore: water depth 0, mudline MD
 * = reference elevation - ground level (0 for a ground-level reference).
 * The mudline MD is taken as its TVD (the hole is vertical to the seabed).
 * @param {object} well geo_wells row
 * @param {{fmt?: (m:number)=>string}} [opts]
 * @returns {null|{waterDepthM:number, mudlineMdM:number, environment:string, text:string}}
 */
export function waterColumnFromDatum(well, { fmt = (m) => `${+m.toFixed(2)} m` } = {}) {
  const datum = readWellDatum(well);
  const s = surfaceTvd(datum);
  if (!Number.isFinite(s)) return null;
  if (datum.environment === 'offshore') {
    const wd = datum.waterDepthM;
    return { waterDepthM: wd, mudlineMdM: s, environment: 'offshore', text: `Water column from the well datum: ${fmt(wd)} of water, mudline ${fmt(s)} MD.` };
  }
  return { waterDepthM: 0, mudlineMdM: s, environment: 'onshore', text: `Water column from the well datum: onshore, ground ${fmt(s)} below the depth reference (mudline MD ${fmt(s)}).` };
}

/**
 * Params with the datum's water column when the user has not set one
 * (water depth and mudline MD both 0 or empty), or when the values in place
 * are the ones a previous well's datum put there (`previous`). Otherwise the
 * params are returned unchanged.
 * @param {object} params workstation params
 * @param {object} well geo_wells row
 * @param {{previous?: ?{waterDepthM:number, mudlineMdM:number}, fmt?: function}} [opts]
 * @returns {{params: object, applied: null|{waterDepthM:number, mudlineMdM:number, text:string}}}
 */
export function applyDatumWaterColumn(params, well, { previous = null, fmt } = {}) {
  const p = params || {};
  const userUnset = unset(p.waterDepthM) && unset(p.mudlineMdM);
  const fromPrevious = !!previous && Number(p.waterDepthM) === previous.waterDepthM && Number(p.mudlineMdM) === previous.mudlineMdM;
  if (!userUnset && !fromPrevious) return { params: p, applied: null };
  const wc = waterColumnFromDatum(well, { fmt });
  if (!wc) return { params: p, applied: null };
  return { params: { ...p, waterDepthM: wc.waterDepthM, mudlineMdM: wc.mudlineMdM }, applied: wc };
}

/**
 * Why a prognosis on this well cannot be published with these params, from
 * the well's datum, or null: an offshore well whose datum states water while
 * the Water depth in Parameters is 0.
 */
export function datumWaterBlocker(params, well, { fmt = (m) => `${+m.toFixed(2)} m` } = {}) {
  if (!well) return null;
  const datum = readWellDatum(well);
  const wd = datum.environment === 'offshore' ? datum.waterDepthM : null;
  if (!(Number(wd) > 0)) return null;
  if (!unset(params?.waterDepthM)) return null;
  return `${datum.wellName || 'This well'} is offshore in ${fmt(wd)} of water (its datum in the well registry), and the Water depth in Parameters is 0, so the prognosis would be a land well's. Set the water depth and the mudline MD in Parameters first.`;
}
