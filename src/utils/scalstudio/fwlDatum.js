/**
 * The free water level and its datum (SCAL-U1-014, PL3 and RL7), through the
 * Suite's one datum module (src/lib/wellDatum.js).
 *
 * The FWL is stored as TVDSS in ft (`height.fwl_tvdss`), the key four other
 * apps read. It can be entered two ways:
 *   'tvdss'  typed as TVDSS (the SC5 field), positive down below the
 *            vertical datum
 *   'tvd'    typed as TVD below the depth reference of a well picked from
 *            the wells registry; the registry's datum turns it into TVDSS,
 *            or refuses with its reason (an unset reference elevation)
 *
 * The well is kept as a snapshot of its datum columns (`height.fwlWell`), so
 * a saved project prints the datum it was converted with even if the
 * registry is corrected later.
 *
 * Pure.
 */
import { readWellDatum, datumSnapshot, tvdssFromTvd, datumLine, tvdssBasisText } from '@/lib/wellDatum';
import { M_PER_FT } from '@/lib/units/registry';

export const FWL_ENTRIES = Object.freeze({ tvdss: 'TVDSS', tvd: 'TVD below a registry well\'s depth reference' });

/** The snapshot kept with the project from a geo_wells row. */
export function wellSnapshot(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, kb_m: row.kb_m ?? null, ...datumSnapshot(readWellDatum(row)) };
}

const num = (v) => (v === '' || v == null ? NaN : Number(v));

/**
 * @param {object} height the studio's height state
 * @returns {{fwlFt: ?number, entry: string, datum: ?object, text: string, basis: string, error: ?string}}
 */
export function resolveFwl(height) {
  const entry = height?.fwlEntry === 'tvd' ? 'tvd' : 'tvdss';
  if (entry === 'tvdss') {
    const v = num(height?.fwl_tvdss);
    return {
      fwlFt: Number.isFinite(v) ? v : null,
      entry,
      datum: null,
      text: Number.isFinite(v) ? 'Entered as TVDSS' : 'Not provided',
      basis: 'TVDSS as entered: depth below the vertical datum of the field (taken as mean sea level unless stated), positive down',
      error: null,
    };
  }
  const well = height?.fwlWell || null;
  if (!well) return { fwlFt: null, entry, datum: null, text: 'Not provided', basis: 'No registry well is chosen for the TVD entry.', error: 'Choose the registry well whose depth reference the TVD is measured from.' };
  const datum = readWellDatum(well);
  const tvdFt = num(height?.fwl_tvd);
  if (!datum.tvdssOk) return { fwlFt: null, entry, datum, text: 'Not provided', basis: datum.tvdssReason, error: datum.tvdssReason };
  if (!Number.isFinite(tvdFt)) return { fwlFt: null, entry, datum, text: 'Not provided', basis: tvdssBasisText(datum, 'ft'), error: null };
  const tvdssM = tvdssFromTvd(tvdFt * M_PER_FT, datum);
  const fwlFt = tvdssM / M_PER_FT;
  return {
    fwlFt,
    entry,
    datum,
    text: `Converted from ${tvdFt.toLocaleString('en-US', { maximumFractionDigits: 1 })} ft TVD below the ${datum.refLabel} of ${well.name} (${datumLine(datum, 'm')}), from the wells registry`,
    basis: tvdssBasisText(datum, 'ft'),
    error: null,
  };
}

/** The height patch when the TVD entry or its well changes: the TVDSS the consumers read follows. */
export function fwlPatch(height, change) {
  const next = { ...height, ...change };
  const r = resolveFwl(next);
  if (next.fwlEntry === 'tvd') next.fwl_tvdss = r.fwlFt == null ? '' : String(Number(r.fwlFt.toPrecision(10)));
  return next;
}
