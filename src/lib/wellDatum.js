// Well datum model (WDM U2-007, serving Well Correlation U2-018 and Wellsite
// U2-019). docs/scope/WellDatum-DESIGN-AND-STATUS.md.
//
// THE ONE PLACE in the Suite that turns measured depth, TVD below the depth
// reference, TVDSS, elevation and depth below mudline or ground into one
// another. Every app reads a registry well's vertical reference through
// here; nothing else subtracts a KB.
//
// What a well states (geo_wells, all nullable, elevations in metres above
// the vertical datum):
//   depth_ref_kind    KB | RT | DF | GL | MSL | OTHER   where MD is zero
//   depth_ref_elev_m  elevation of that point; NULL is "not entered",
//                     0 is a real value
//   well_environment  onshore | offshore
//   ground_elev_m     onshore ground level
//   water_depth_m     offshore, datum to mudline, positive down
//   vertical_datum    MSL, LAT or a named national datum
//   elev_unit         m | ft, the unit the elevations were entered in
//   datum_changes     who corrected the datum, when, and what moved
//
// Textbook meanings held here:
//   TVD    vertical depth below the depth reference
//   TVDSS  TVD - reference elevation: depth below the vertical datum,
//          positive down; elevation is its negative
//   offshore: air gap = reference elevation; mudline at
//          TVD = reference elevation + water depth
//   onshore: the reference stands (reference elevation - ground level)
//          above ground
//
// The registry gained these columns with migration
// 20261002090000_geo_wells_datum_model.sql. Staging shares the production
// database, so a row may not carry them yet: readWellDatum says which case
// it met (`state`) and never invents a zero once "not entered" can be said.
//
// The minimum-curvature path stays in the vendored welldata engine
// (makeDepthFrame); this module hands it the elevation and applies the
// datum itself. Pure functions, worker-safe, no I/O.

import { makeDepthFrame } from '../../packages/engines/engines/welldata/checkshots.js';
import { convert } from './units/registry.js';

export const DEPTH_REF_KINDS = Object.freeze(['KB', 'RT', 'DF', 'GL', 'MSL', 'OTHER']);
export const DEPTH_REF_LABELS = Object.freeze({
  KB: 'Kelly bushing (KB)',
  RT: 'Rotary table (RT)',
  DF: 'Drill floor (DF)',
  GL: 'Ground level (GL)',
  MSL: 'Mean sea level (MSL)',
  OTHER: 'Other',
});
export const WELL_ENVIRONMENTS = Object.freeze(['onshore', 'offshore']);
export const ELEV_UNITS = Object.freeze(['m', 'ft']);
export const COMMON_VERTICAL_DATUMS = Object.freeze(['MSL', 'LAT']);

/** The geo_wells columns of the datum model, in one list (portability, backends, tests). */
export const DATUM_COLUMNS = Object.freeze([
  'depth_ref_kind', 'depth_ref_label', 'depth_ref_elev_m', 'well_environment',
  'ground_elev_m', 'water_depth_m', 'vertical_datum', 'elev_unit', 'datum_changes',
]);

export const WDM_DATUM_PLACE = 'Well Data Manager (Header, Depth reference)';

const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const numOrNull = (v) => (fin(v) ? Number(v) : null);
const textOrNull = (v) => { const s = v === null || v === undefined ? '' : String(v).trim(); return s === '' ? null : s; };

/** True when the registry row carries the datum columns (the migration is applied). */
export function datumColumnsPresent(row) {
  return !!row && typeof row === 'object' && 'depth_ref_elev_m' in row;
}

/**
 * The well's vertical reference as the apps read it.
 *
 * state:
 *   'set'          the datum columns state the reference elevation
 *   'legacy-kb'    no stated value; kb_m is not 0 and is read as a kelly
 *                  bushing elevation
 *   'unset'        the columns exist, nothing stated, kb_m is 0: TVDSS is
 *                  refused, with the reason
 *   'legacy-zero'  the columns do not exist yet and kb_m is 0: the earlier
 *                  behaviour holds (TVDSS equals TVD) with an honest note
 *
 * @param {Object} well a geo_wells row (or any object with kb_m)
 */
export function readWellDatum(well) {
  const w = well || {};
  const columns = datumColumnsPresent(w);
  const kb = numOrNull(w.kb_m);
  const stated = columns ? numOrNull(w.depth_ref_elev_m) : null;
  const kindRaw = columns ? textOrNull(w.depth_ref_kind) : null;
  const refKind = DEPTH_REF_KINDS.includes(kindRaw) ? kindRaw : null;

  let state;
  let refElevM;
  if (stated !== null) { state = 'set'; refElevM = stated; }
  else if (kb !== null && kb !== 0) { state = 'legacy-kb'; refElevM = kb; }
  else if (columns) { state = 'unset'; refElevM = null; }
  else { state = 'legacy-zero'; refElevM = 0; }

  const kind = state === 'unset' ? refKind : (refKind || 'KB');
  const environment = columns && WELL_ENVIRONMENTS.includes(w.well_environment) ? w.well_environment : null;
  const datum = {
    state,
    columns,
    refKind: kind,
    refLabel: kind === 'OTHER' ? (textOrNull(w.depth_ref_label) || 'Other reference') : kind,
    refElevM,
    environment,
    groundElevM: columns ? numOrNull(w.ground_elev_m) : null,
    waterDepthM: columns ? numOrNull(w.water_depth_m) : null,
    verticalDatum: columns ? textOrNull(w.vertical_datum) : null,
    elevUnit: columns && ELEV_UNITS.includes(w.elev_unit) ? w.elev_unit : null,
    changes: columns && Array.isArray(w.datum_changes) ? w.datum_changes : [],
    wellName: textOrNull(w.name),
  };
  datum.tvdssOk = state !== 'unset';
  datum.tvdssReason = datum.tvdssOk ? null
    : `${datum.wellName || 'This well'} has no depth reference elevation, so TVDSS and elevations cannot be given. Set it in ${WDM_DATUM_PLACE}.`;
  datum.note = state === 'legacy-zero'
    ? 'KB is 0 in the registry, which cannot yet tell 0 from not entered. TVDSS is shown equal to TVD until the reference elevation is entered.'
    : state === 'legacy-kb' && columns
      ? `The reference elevation comes from the earlier KB field. Confirm the depth reference in ${WDM_DATUM_PLACE}.`
      : null;
  const st = surfaceTvd(datum);
  datum.surfaceOk = Number.isFinite(st);
  datum.surfaceName = environment === 'offshore' ? 'mudline' : environment === 'onshore' ? 'ground level' : null;
  datum.surfaceReason = datum.surfaceOk ? null : surfaceRefusal(datum);
  return datum;
}

function surfaceRefusal(d) {
  if (!d.tvdssOk && d.refKind !== 'GL') return d.tvdssReason;
  if (!d.environment) return `${d.wellName || 'This well'} does not say whether it is onshore or offshore, so depth below ground or mudline cannot be given. Set it in ${WDM_DATUM_PLACE}.`;
  if (d.environment === 'offshore') return `${d.wellName || 'This well'} has no water depth, so depth below mudline cannot be given. Set it in ${WDM_DATUM_PLACE}.`;
  return `${d.wellName || 'This well'} has no ground level elevation, so depth below ground cannot be given. Set it in ${WDM_DATUM_PLACE}.`;
}

// ---- the conversions -------------------------------------------------------

/** TVD below the depth reference to TVDSS (positive down). NaN when the datum cannot say. */
export function tvdssFromTvd(tvdM, datum) {
  if (!datum || !datum.tvdssOk || !Number.isFinite(tvdM)) return NaN;
  return tvdM - datum.refElevM;
}

/** TVDSS to TVD below the depth reference. NaN when the datum cannot say. */
export function tvdFromTvdss(tvdssM, datum) {
  if (!datum || !datum.tvdssOk || !Number.isFinite(tvdssM)) return NaN;
  return tvdssM + datum.refElevM;
}

/** TVDSS (positive down) to elevation (positive up), and back. */
export const elevationFromTvdss = (tvdssM) => (Number.isFinite(tvdssM) ? -tvdssM : NaN);
export const tvdssFromElevation = (elevM) => (Number.isFinite(elevM) ? -elevM : NaN);

/**
 * TVD, below the depth reference, of the mudline (offshore) or the ground
 * (onshore). NaN when the well does not state enough.
 *   offshore: reference elevation (the air gap) + water depth
 *   onshore:  reference elevation - ground level; 0 for a GL reference
 */
export function surfaceTvd(datum) {
  if (!datum) return NaN;
  if (datum.environment === 'offshore') {
    if (!datum.tvdssOk || !Number.isFinite(datum.waterDepthM)) return NaN;
    return datum.refElevM + datum.waterDepthM;
  }
  if (datum.environment === 'onshore') {
    if (datum.refKind === 'GL') return 0;
    if (!datum.tvdssOk || !Number.isFinite(datum.groundElevM)) return NaN;
    return datum.refElevM - datum.groundElevM;
  }
  return NaN;
}

/** TVD below the depth reference to depth below mudline (offshore) or below ground (onshore). */
export function belowSurfaceFromTvd(tvdM, datum) {
  const s = surfaceTvd(datum);
  return Number.isFinite(s) && Number.isFinite(tvdM) ? tvdM - s : NaN;
}

/** Depth below mudline or ground to TVD below the depth reference. */
export function tvdFromBelowSurface(depthM, datum) {
  const s = surfaceTvd(datum);
  return Number.isFinite(s) && Number.isFinite(depthM) ? depthM + s : NaN;
}

/** Offshore air gap: the depth reference above the vertical datum. NaN onshore or unset. */
export function airGapM(datum) {
  return datum && datum.environment === 'offshore' && datum.tvdssOk ? datum.refElevM : NaN;
}

/**
 * The reference elevation to hand a path builder that takes a KB
 * (computeWellPath, minCurvature). NaN when the well does not state one, so
 * every subsea depth it derives is NaN and nothing lands at an invented
 * depth. Callers check `readWellDatum(well).tvdssOk` first and say why.
 */
export function refElevForPath(well) {
  const d = readWellDatum(well);
  return d.tvdssOk ? d.refElevM : NaN;
}

/**
 * Depth frame of one well: MD, TVD, TVDSS, elevation and depth below
 * mudline or ground through the survey (vertical when there is none).
 * Shape-compatible with the engine's makeDepthFrame, so the checkshot
 * doors take it as is. Where the datum cannot give a value the number is
 * NaN (inverse lookups return null) and `frame.datum` carries the reason.
 *
 * @param {Object} well geo_wells row
 * @param {{deviation?: Array, tdMdM?: ?number, datum?: Object}} [over]
 *   `deviation` / `tdMdM` replace the row's (an editor previewing a new
 *   survey); `datum` replaces the row's datum (previewing a correction)
 */
export function makeWellFrame(well, over = {}) {
  const w = well || {};
  const datum = over.datum || readWellDatum(w);
  const ok = !!datum.tvdssOk;
  const engineKb = ok ? datum.refElevM : 0;
  const engine = makeDepthFrame({
    deviation: over.deviation !== undefined ? over.deviation : w.deviation,
    kbM: engineKb,
    tdMdM: over.tdMdM !== undefined ? over.tdMdM : w.td_md_m,
  });

  const mdToPosition = (md) => {
    const p = engine.mdToPosition(md);
    const tvdss = tvdssFromTvd(p.tvd, datum);
    return {
      x: p.x, y: p.y, tvd: p.tvd, tvdss,
      elevation: elevationFromTvdss(tvdss),
      belowSurface: belowSurfaceFromTvd(p.tvd, datum),
      extrapolated: p.extrapolated,
    };
  };
  const mdToTvdss = (md) => {
    const p = mdToPosition(md);
    return { tvd: p.tvd, tvdss: p.tvdss, extrapolated: p.extrapolated };
  };
  /** TVD below the depth reference to MD (needs no datum). */
  const tvdToMd = (tvd) => (Number.isFinite(tvd) ? engine.tvdssToMd(tvd - engineKb) : null);
  const tvdssToMd = (tvdss) => (ok && Number.isFinite(tvdss) ? engine.tvdssToMd(tvdss) : null);
  const belowSurfaceToMd = (depth) => {
    const tvd = tvdFromBelowSurface(depth, datum);
    return Number.isFinite(tvd) ? tvdToMd(tvd) : null;
  };

  return {
    datum,
    kbM: ok ? datum.refElevM : NaN,
    tdMdM: engine.tdMdM,
    stations: engine.stations,
    path: engine.path ? engine.path.map((p) => ({ ...p, tvdss: tvdssFromTvd(p.tvd, datum) })) : engine.path,
    isVertical: engine.isVertical,
    assumedVerticalToFirstStation: engine.assumedVerticalToFirstStation,
    mdRange: engine.mdRange,
    mdToPosition,
    mdToTvdss,
    mdToTvd: (md) => engine.mdToPosition(md).tvd,
    tvdToMd,
    tvdssToMd,
    belowSurfaceToMd,
    tvdToTvdss: (tvd) => tvdssFromTvd(tvd, datum),
    tvdssToTvd: (tvdss) => tvdFromTvdss(tvdss, datum),
  };
}

// ---- words ----------------------------------------------------------------

const fmt = (m, unit, digits) => {
  const v = convert('depth', m, 'm', unit === 'ft' ? 'ft' : 'm');
  return `${v.toFixed(digits)} ${unit === 'ft' ? 'ft' : 'm'}`;
};

/** "MSL", "LAT", a named datum, or the honest fallback. */
export function verticalDatumText(datum) {
  return datum && datum.verticalDatum ? datum.verticalDatum : 'the vertical datum (not named; taken as mean sea level)';
}

/**
 * One line a report or a status bar can carry:
 * "KB 25.0 m above MSL", "Depth reference not set".
 */
export function datumLine(datum, unit = 'm', digits = 1) {
  if (!datum || !datum.tvdssOk) return 'Depth reference not set';
  const where = datum.verticalDatum ? datum.verticalDatum : 'datum (not named, taken as mean sea level)';
  const parts = [`${datum.refLabel} ${fmt(datum.refElevM, unit, digits)} above ${where}`];
  if (datum.environment === 'offshore' && Number.isFinite(datum.waterDepthM)) parts.push(`water depth ${fmt(datum.waterDepthM, unit, digits)}`);
  if (datum.environment === 'onshore' && Number.isFinite(datum.groundElevM)) parts.push(`ground level ${fmt(datum.groundElevM, unit, digits)}`);
  if (datum.state === 'legacy-zero') parts.push('0 may mean not entered');
  return parts.join(', ');
}

/** Short tag for a TVDSS column note: "TVDSS below MSL from KB 25.00 m". */
export function tvdssBasisText(datum, unit = 'm', digits = 2) {
  if (!datum || !datum.tvdssOk) return datum ? datum.tvdssReason : 'No depth reference.';
  const where = datum.verticalDatum || 'the datum (taken as mean sea level)';
  return `TVDSS is below ${where}, from ${datum.refLabel} ${fmt(datum.refElevM, unit, digits)}${datum.state === 'legacy-zero' ? ' (0 may mean not entered)' : ''}`;
}

// ---- validation and entry ---------------------------------------------------

const LIMITS = { elev: 9000, water: 12000 };

/**
 * Normalise and check a datum as entered.
 * @param {{refKind?: ?string, refLabel?: ?string, refElevM?: ?number, environment?: ?string,
 *   groundElevM?: ?number, waterDepthM?: ?number, verticalDatum?: ?string, elevUnit?: ?string}} input
 *   numbers already in metres; null or undefined means not set
 * @returns {{datum: Object, errors: string[], warnings: string[]}}
 */
export function validateDatum(input) {
  const i = input || {};
  const errors = [];
  const warnings = [];
  const bad = (name, v) => v !== null && v !== undefined && v !== '' && !Number.isFinite(Number(v));
  for (const [name, v] of [['Reference elevation', i.refElevM], ['Ground level', i.groundElevM], ['Water depth', i.waterDepthM]]) {
    if (bad(name, v)) errors.push(`${name} must be a number.`);
  }
  const d = {
    refKind: textOrNull(i.refKind),
    refLabel: textOrNull(i.refLabel),
    refElevM: numOrNull(i.refElevM),
    environment: textOrNull(i.environment),
    groundElevM: numOrNull(i.groundElevM),
    waterDepthM: numOrNull(i.waterDepthM),
    verticalDatum: textOrNull(i.verticalDatum),
    elevUnit: textOrNull(i.elevUnit),
  };
  if (d.refKind && !DEPTH_REF_KINDS.includes(d.refKind)) errors.push(`Unknown depth reference "${d.refKind}" (expected ${DEPTH_REF_KINDS.join(', ')}).`);
  if (d.environment && !WELL_ENVIRONMENTS.includes(d.environment)) errors.push(`Unknown environment "${d.environment}" (expected onshore or offshore).`);
  if (d.elevUnit && !ELEV_UNITS.includes(d.elevUnit)) errors.push(`Unknown elevation unit "${d.elevUnit}" (expected m or ft).`);
  if (d.verticalDatum && d.verticalDatum.length > 80) errors.push('The vertical datum name is longer than 80 characters.');
  if (d.refLabel && d.refLabel.length > 80) errors.push('The reference name is longer than 80 characters.');
  if (d.refKind === 'OTHER' && !d.refLabel) errors.push('Name the depth reference when it is "Other".');
  if (d.refKind !== 'OTHER') d.refLabel = null;
  if (d.refElevM !== null && !d.refKind) errors.push('Say what the reference elevation belongs to (KB, RT, DF, GL, MSL or other).');

  if (d.waterDepthM !== null && d.waterDepthM < 0) errors.push('Water depth cannot be negative: it is measured downward from the vertical datum.');
  if (d.waterDepthM !== null && d.waterDepthM > LIMITS.water) errors.push(`Water depth ${d.waterDepthM} m is deeper than any ocean.`);
  for (const [name, v] of [['Reference elevation', d.refElevM], ['Ground level', d.groundElevM]]) {
    if (v !== null && Math.abs(v) > LIMITS.elev) errors.push(`${name} ${v} m is outside any land or rig elevation. Check the unit.`);
  }
  if (d.waterDepthM !== null && d.environment === 'onshore') errors.push('Water depth belongs to an offshore well. This well is onshore: clear the water depth or change the environment.');
  if (d.waterDepthM !== null && !d.environment) errors.push('A water depth needs the environment set to offshore.');
  if (d.groundElevM !== null && d.environment === 'offshore') errors.push('Ground level belongs to an onshore well. This well is offshore: clear the ground level or change the environment.');
  if (d.refKind === 'GL' && d.environment === 'offshore') errors.push('Ground level is an onshore reference. Offshore depths are measured from the rig (KB, RT or DF) or from sea level.');

  if (d.refKind === 'GL') {
    if (d.refElevM !== null && d.groundElevM !== null && Math.abs(d.refElevM - d.groundElevM) > 1e-6) {
      errors.push(`The depth reference is ground level, yet its elevation (${d.refElevM} m) and the ground level (${d.groundElevM} m) differ.`);
    } else if (d.refElevM !== null && d.groundElevM === null && d.environment !== 'offshore') d.groundElevM = d.refElevM;
    else if (d.refElevM === null && d.groundElevM !== null) d.refElevM = d.groundElevM;
  }
  const mslNamed = !d.verticalDatum || /^(msl|mean sea level)$/i.test(d.verticalDatum);
  if (d.refKind === 'MSL' && mslNamed) {
    if (d.refElevM === null) d.refElevM = 0;
    else if (Math.abs(d.refElevM) > 1e-9) errors.push('A well measured from mean sea level has a reference elevation of 0 above mean sea level.');
  }
  const rig = d.refKind === 'KB' || d.refKind === 'RT' || d.refKind === 'DF';
  if (rig && d.refElevM !== null) {
    if (d.environment === 'offshore' && d.refElevM < 0) errors.push(`An offshore ${d.refKind} cannot be below the vertical datum (${d.refElevM} m). Check the sign.`);
    else if (d.refElevM < 0) warnings.push(`The reference elevation is negative (${d.refElevM} m): the ${d.refKind} is below the vertical datum. That is rare on land and wrong at sea; check the sign.`);
    else if (d.refElevM === 0) warnings.push(`A ${d.refKind} exactly at the vertical datum (0) is unusual. Leave the elevation blank if it is not known.`);
    if (d.environment === 'onshore' && d.groundElevM !== null && d.refElevM < d.groundElevM - 1e-9) {
      errors.push(`The ${d.refKind} (${d.refElevM} m) is below ground level (${d.groundElevM} m).`);
    }
  }
  if (d.refElevM === null && (d.groundElevM !== null || d.waterDepthM !== null) && d.refKind !== 'GL') {
    warnings.push('Without a reference elevation TVDSS stays unavailable.');
  }
  return { datum: d, errors, warnings };
}

/**
 * Typed fields (strings, in `unit`) to a datum in metres. Blank means not
 * set. Feet and metres go through the unit registry.
 * @param {{refKind, refLabel, refElev, environment, groundElev, waterDepth, verticalDatum}} fields
 * @param {'m'|'ft'} unit
 */
export function datumFromEntry(fields, unit = 'm') {
  const f = fields || {};
  const u = unit === 'ft' ? 'ft' : 'm';
  const read = (raw) => {
    const s = raw === null || raw === undefined ? '' : String(raw).trim().replace(',', '.');
    if (s === '') return null;
    const v = Number(s);
    return Number.isFinite(v) ? convert('depth', v, u, 'm') : NaN;
  };
  return validateDatum({
    refKind: f.refKind || null,
    refLabel: f.refLabel,
    refElevM: read(f.refElev),
    environment: f.environment || null,
    groundElevM: read(f.groundElev),
    waterDepthM: read(f.waterDepth),
    verticalDatum: f.verticalDatum,
    elevUnit: u,
  });
}

/** A datum to typed fields in `unit` (the editor's starting values). */
export function datumToEntry(datum, unit = 'm', digits = 3) {
  const d = datum || {};
  const u = unit === 'ft' ? 'ft' : 'm';
  const show = (m) => (Number.isFinite(m) ? String(Number(convert('depth', m, 'm', u).toFixed(digits))) : '');
  const hasElev = d.state ? d.state !== 'unset' && d.state !== 'legacy-zero' : Number.isFinite(d.refElevM);
  return {
    refKind: d.refKind || (hasElev ? 'KB' : ''),
    refLabel: d.refKind === 'OTHER' ? (d.refLabel || '') : '',
    refElev: hasElev ? show(d.refElevM) : '',
    environment: d.environment || '',
    groundElev: show(d.groundElevM),
    waterDepth: show(d.waterDepthM),
    verticalDatum: d.verticalDatum || '',
  };
}

// ---- LAS header proposals ---------------------------------------------------

const LAS_UNIT = (u) => {
  const s = String(u || '').trim().toUpperCase().replace(/\.$/, '');
  if (['M', 'METER', 'METERS', 'METRE', 'METRES', 'MTR'].includes(s)) return 'm';
  if (['F', 'FT', 'FEET', 'FOOT', 'FTUS'].includes(s)) return 'ft';
  return s === '' ? '' : null;
};

const kindFromText = (raw) => {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return null;
  if (/\bR?K\.?B\b|KELLY/.test(s)) return 'KB';
  if (/\bR\.?T\b|ROTARY/.test(s)) return 'RT';
  if (/\bD\.?F\b|DRILL|DERRICK/.test(s)) return 'DF';
  if (/\bG\.?L\b|GROUND/.test(s)) return 'GL';
  if (/\bM\.?S\.?L\b|SEA/.test(s)) return 'MSL';
  return null;
};

/**
 * Datum fields a LAS header suggests (EKB, EGL, EDF, APD, EPD, LMF, DMF,
 * PDAT). A PROPOSAL: it fills the editor and the user confirms; nothing is
 * saved from it directly.
 *
 * @param {{well: Object, params: Object, depthUnit?: string, nullValue?: ?number}} parsed
 *   parseLas output: items are {unit, value, descr}
 * @returns {{fields: {refKind, refElevM, groundElevM, verticalDatum, environment, elevUnit},
 *   found: Array<{mnemonic, text, metres: ?number}>, notes: string[], conflicts: string[], empty: boolean}}
 */
export function proposeDatumFromLas(parsed) {
  const p = parsed || {};
  const item = (mn) => (p.params && p.params[mn]) || (p.well && p.well[mn]) || null;
  const fileUnit = LAS_UNIT(p.depthUnit);
  const found = [];
  const notes = [];
  const conflicts = [];
  let unitSeen = null;

  const elev = (mn) => {
    const it = item(mn);
    if (!it || it.value === '' || it.value === null || it.value === undefined) return null;
    const v = typeof it.value === 'number' ? it.value : Number(String(it.value).trim());
    if (!Number.isFinite(v)) { found.push({ mnemonic: mn, text: String(it.value), metres: null }); notes.push(`${mn} "${it.value}" is not a number and was left out.`); return null; }
    if ((Number.isFinite(p.nullValue) && v === p.nullValue) || v <= -999) { found.push({ mnemonic: mn, text: String(v), metres: null }); notes.push(`${mn} holds the file's null value and was left out.`); return null; }
    let u = LAS_UNIT(it.unit);
    if (u === null) { found.push({ mnemonic: mn, text: `${v} ${it.unit}`, metres: null }); notes.push(`${mn} is in "${it.unit}", a unit this door does not read; it was left out.`); return null; }
    if (u === '') {
      if (!fileUnit) { found.push({ mnemonic: mn, text: String(v), metres: null }); notes.push(`${mn} has no unit and the file's depth unit is not known; it was left out.`); return null; }
      u = fileUnit;
      notes.push(`${mn} has no unit; read in the file's depth unit (${u}).`);
    }
    const metres = convert('depth', v, u, 'm');
    found.push({ mnemonic: mn, text: `${v} ${u}`, metres });
    unitSeen = unitSeen || u;
    return { metres, unit: u, raw: v };
  };
  const text = (mn) => {
    const it = item(mn);
    const s = it ? textOrNull(it.value) : null;
    if (s) found.push({ mnemonic: mn, text: s, metres: null });
    return s;
  };

  const ekb = elev('EKB') || elev('KB');
  const edf = elev('EDF');
  const egl = elev('EGL');
  const apd = elev('APD');
  const epd = elev('EPD');
  const lmf = text('LMF');
  const dmf = text('DMF');
  const pdat = text('PDAT');

  const kLmf = kindFromText(lmf);
  const kDmf = kindFromText(dmf);
  if (lmf && !kLmf) notes.push(`LMF "${lmf}" is not a reference this door knows; choose the depth reference yourself.`);
  if (kLmf && kDmf && kLmf !== kDmf) conflicts.push(`The logs are measured from ${kLmf} (LMF) and drilling from ${kDmf} (DMF). The log reference is proposed, since the curves are stored against it.`);
  let refKind = kLmf || kDmf || null;

  const pdKind = kindFromText(pdat);
  let verticalDatum = null;
  let groundElevM = egl ? egl.metres : null;
  if (pdat) {
    if (pdKind === 'MSL') verticalDatum = 'MSL';
    else if (/\bLAT\b|LOWEST ASTRONOMICAL/i.test(pdat)) verticalDatum = 'LAT';
    else if (pdKind === 'GL') {
      // permanent datum is the ground: EPD is the ground elevation above sea level
      verticalDatum = 'MSL';
      if (epd && groundElevM === null) { groundElevM = epd.metres; notes.push('The permanent datum is ground level, so EPD is taken as the ground level elevation.'); }
    } else if (!pdKind) verticalDatum = pdat.slice(0, 80);
  }

  const direct = refKind === 'KB' ? ekb : refKind === 'DF' ? edf : refKind === 'RT' ? (edf || ekb) : refKind === 'GL' ? egl : null;
  let viaApd = null;
  if (apd) {
    if (epd) viaApd = apd.metres + epd.metres;
    else if (pdKind === 'MSL' || /\bLAT\b/i.test(pdat || '')) viaApd = apd.metres;
    else if (pdKind === 'GL' && groundElevM !== null) viaApd = apd.metres + groundElevM;
    else notes.push('APD is given without the elevation of its permanent datum (EPD), so it could not be turned into an elevation.');
  }
  if (!refKind) {
    if (ekb) refKind = 'KB';
    else if (edf) refKind = 'DF';
    else if (viaApd !== null) notes.push('The file gives a reference elevation (APD) but does not say what the depths are measured from (LMF); choose the depth reference.');
  }
  let refElevM = null;
  const chosen = direct || (refKind === 'KB' ? ekb : refKind === 'DF' ? edf : null);
  if (refKind === 'MSL') refElevM = 0;
  else if (chosen) {
    refElevM = chosen.metres;
    if (viaApd !== null && Math.abs(viaApd - chosen.metres) > 0.05) {
      conflicts.push(`The ${refKind} elevation in the file (${chosen.metres.toFixed(2)} m) and APD plus EPD (${viaApd.toFixed(2)} m) disagree. The ${refKind} elevation is proposed; check it.`);
    }
  } else if (viaApd !== null) refElevM = viaApd;

  if (refElevM === 0 && refKind !== 'MSL') {
    notes.push(`The file gives a ${refKind || 'reference'} elevation of 0. That is usually a blank header: the elevation is left for you to enter.`);
    refElevM = null;
  }
  const environment = groundElevM !== null ? 'onshore' : null;
  if (environment) notes.push('A ground level is given, so the well is proposed as onshore.');

  const fields = { refKind, refElevM, groundElevM, verticalDatum, environment, elevUnit: unitSeen };
  const empty = refKind === null && refElevM === null && groundElevM === null && verticalDatum === null;
  return { fields, found, notes, conflicts, empty };
}

// ---- corrections ------------------------------------------------------------

const same = (a, b) => (a === null || a === undefined ? (b === null || b === undefined) : (b !== null && b !== undefined && Math.abs(Number(a) - Number(b)) < 1e-9));

/** The stored-shape snapshot a change record keeps. */
export function datumSnapshot(d) {
  const x = d || {};
  // a datum read from a row says whether its elevation was stated; a
  // validated entry (no state) is taken as typed
  const stated = !x.state || x.state === 'set' || x.state === 'legacy-kb';
  return {
    depth_ref_kind: stated ? (x.refKind ?? null) : null,
    depth_ref_label: stated && x.refKind === 'OTHER' ? (x.refLabel ?? null) : null,
    depth_ref_elev_m: stated ? numOrNull(x.refElevM) : null,
    well_environment: x.environment ?? null,
    ground_elev_m: numOrNull(x.groundElevM),
    water_depth_m: numOrNull(x.waterDepthM),
    vertical_datum: x.verticalDatum ?? null,
  };
}

/**
 * What a datum correction moves, in words, before it is saved.
 *
 * @param {Object} well the registry row as it is
 * @param {Object} next validated datum (validateDatum().datum)
 * @param {{tops?: number, curves?: number, zones?: number, unit?: 'm'|'ft',
 *   wellsiteWells?: number}} [counts]
 * @returns {{kind: 'none'|'first'|'correction'|'cleared'|'details', shiftM: ?number,
 *   hasData: boolean, needsConfirm: boolean, lines: string[]}}
 */
export function datumChangeImpact(well, next, counts = {}) {
  const prev = readWellDatum(well);
  const unit = counts.unit === 'ft' ? 'ft' : 'm';
  const n = next || {};
  const nextElev = numOrNull(n.refElevM);
  const prevStated = prev.state === 'set' || prev.state === 'legacy-kb';
  const prevElev = prevStated ? prev.refElevM : null;
  const tops = Number(counts.tops) || 0;
  const curves = Number(counts.curves) || 0;
  const zones = Number(counts.zones) || 0;
  const cs = Array.isArray(well?.checkshots) ? well.checkshots.length : 0;
  const hasData = tops + curves + zones + cs > 0;
  const lines = [];
  const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;

  let kind = 'none';
  let shiftM = null;
  if (same(prevElev, nextElev)) {
    const moved = !same(prev.waterDepthM, n.waterDepthM) || !same(prev.groundElevM, n.groundElevM) || (prev.environment || null) !== (n.environment || null);
    const named = (prev.verticalDatum || null) !== (n.verticalDatum || null) || (prevStated && (prev.refKind || null) !== (n.refKind || null));
    if (moved || named) kind = 'details';
    if (moved) lines.push('Depths below mudline or ground change with the water depth, ground level or environment. MD, TVD and TVDSS stay as they are.');
    else if (named) lines.push('Only the names change (reference kind or vertical datum). No depth moves.');
  } else if (nextElev === null) {
    kind = 'cleared';
    lines.push(`The reference elevation (${fmt(prevElev, unit, 2)}) is cleared. TVDSS and elevations of this well will be refused everywhere until it is entered again.`);
  } else if (prevElev === null) {
    kind = 'first';
    lines.push(prev.state === 'legacy-zero'
      ? `The reference elevation becomes ${fmt(nextElev, unit, 2)}. Until now TVDSS was shown equal to TVD (elevation taken as 0), so every TVDSS of this well becomes ${fmt(Math.abs(nextElev), unit, 2)} ${nextElev >= 0 ? 'shallower' : 'deeper'}.`
      : `The reference elevation becomes ${fmt(nextElev, unit, 2)}. TVDSS and elevations of this well become available.`);
    shiftM = prev.state === 'legacy-zero' ? -nextElev : null;
  } else {
    kind = 'correction';
    shiftM = -(nextElev - prevElev);
    lines.push(`The reference elevation changes from ${fmt(prevElev, unit, 2)} to ${fmt(nextElev, unit, 2)}. Every TVDSS of this well becomes ${fmt(Math.abs(shiftM), unit, 2)} ${shiftM < 0 ? 'shallower' : 'deeper'}; elevations move the other way. MD and TVD below the reference do not change.`);
  }

  if (kind === 'correction' || kind === 'first' || kind === 'cleared') {
    if (tops) lines.push(`${plural(tops, 'top')}: MD kept, TVDSS and elevation ${kind === 'cleared' ? 'no longer available' : 'move'}.`);
    if (curves) lines.push(`${plural(curves, 'curve')} (including curves published by Petrophysics, Rock Physics and Pore Pressure): stored against MD and kept; every TVDSS readout and export ${kind === 'cleared' ? 'is refused' : 'moves'}.`);
    if (zones) lines.push(`${plural(zones, 'zone')}: MD kept; TVDSS thickness tables and saturation height read from the new elevation.`);
    if (cs) {
      const ref = well?.checkshots_provenance?.units_in?.depth_ref;
      if (kind === 'cleared') lines.push(`${plural(cs, 'checkshot row')}: kept as stored; time and depth conversion is refused while the elevation is not set.`);
      else if (well?.checkshots_provenance) lines.push(`${plural(cs, 'checkshot row')}: re-derived through the new elevation (entered as ${String(ref || 'tvdss').toUpperCase()}, that reference is kept).`);
      else lines.push(`${plural(cs, 'checkshot row')}: an earlier table with no entry record; left as stored (assumed TVDSS). Re-enter it if it was measured from the old reference.`);
    }
    if (hasData) {
      lines.push('Seismolord synthetics and well ties made on this well used the old elevation: re-run them.');
      lines.push('Top maps and surfaces gridded from this well\'s tops, correlation sections flattened in TVDSS and Earth Modeling horizons tied to it keep the old depths until they are rebuilt.');
    }
    if (Number(counts.wellsiteWells) > 0) lines.push(`${plural(Number(counts.wellsiteWells), 'Wellsite well')} linked to it: the KB copy follows this change; subsea depths of its calls and tops are recomputed.`);
  }
  return { kind, shiftM, hasData, needsConfirm: kind !== 'none' && hasData && kind !== 'details', lines };
}

/**
 * The record of a datum change (datum_changes entry).
 * @param {Object} well row before the change
 * @param {Object} next validated datum
 * @param {{userId?: ?string, userName?: ?string, at?: Date|string, reason?: ?string, app?: ?string, impact?: Object, counts?: Object}} who
 */
export function datumChangeRecord(well, next, who = {}) {
  const prev = readWellDatum(well);
  const at = who.at instanceof Date ? who.at.toISOString() : (who.at || new Date().toISOString());
  const impact = who.impact || datumChangeImpact(well, next, who.counts || {});
  return {
    at,
    by: who.userId || null,
    by_name: who.userName || null,
    app: who.app || null,
    reason: textOrNull(who.reason),
    kind: impact.kind,
    shift_tvdss_m: Number.isFinite(impact.shiftM) ? impact.shiftM : null,
    from: datumSnapshot(prev),
    to: datumSnapshot({ ...next, state: null }),
    affected: {
      tops: Number(who.counts?.tops) || 0,
      curves: Number(who.counts?.curves) || 0,
      zones: Number(who.counts?.zones) || 0,
      checkshots: Array.isArray(well?.checkshots) ? well.checkshots.length : 0,
    },
  };
}

/** A change record as one plain line (history lists, the pre-migration note). */
export function datumChangeLine(rec, unit = 'm') {
  if (!rec) return '';
  const e = (v) => (Number.isFinite(v) ? fmt(v, unit, 2) : 'not set');
  const who = rec.by_name || rec.by || 'someone';
  const day = String(rec.at || '').slice(0, 10);
  const from = rec.from || {};
  const to = rec.to || {};
  return `${day}: ${who} changed the depth reference from ${from.depth_ref_kind || 'not set'} ${e(from.depth_ref_elev_m)} to ${to.depth_ref_kind || 'not set'} ${e(to.depth_ref_elev_m)}${rec.reason ? ` (${rec.reason})` : ''}`;
}

/**
 * The geo_wells patch that saves a datum.
 *
 * With the datum columns: every field, kb_m kept equal to the reference
 * elevation (0 while unset) for builds that predate the model, and the
 * change record appended. Without them (migration not applied): kb_m only,
 * a dated line appended to units_note, and `dropped` lists what could not
 * be kept.
 *
 * @param {Object} well row before the change
 * @param {Object} next validated datum
 * @param {{record?: Object, columns?: boolean}} [opts]
 * @returns {{patch: Object, dropped: string[], columns: boolean}}
 */
export function datumPatch(well, next, { record = null, columns = datumColumnsPresent(well) } = {}) {
  const n = next || {};
  const elev = numOrNull(n.refElevM);
  if (columns) {
    const prior = Array.isArray(well?.datum_changes) ? well.datum_changes : [];
    return {
      columns: true,
      dropped: [],
      patch: {
        depth_ref_kind: n.refKind || null,
        depth_ref_label: n.refKind === 'OTHER' ? (n.refLabel || null) : null,
        depth_ref_elev_m: elev,
        well_environment: n.environment || null,
        ground_elev_m: numOrNull(n.groundElevM),
        water_depth_m: numOrNull(n.waterDepthM),
        vertical_datum: n.verticalDatum || null,
        elev_unit: n.elevUnit || null,
        kb_m: elev ?? 0,
        ...(record ? { datum_changes: [...prior, record].slice(-50) } : {}),
      },
    };
  }
  const dropped = [];
  if (n.refKind && n.refKind !== 'KB') dropped.push('reference kind');
  if (n.environment) dropped.push('environment');
  if (numOrNull(n.groundElevM) !== null) dropped.push('ground level');
  if (numOrNull(n.waterDepthM) !== null) dropped.push('water depth');
  if (n.verticalDatum) dropped.push('vertical datum name');
  const patch = { kb_m: elev ?? 0 };
  if (record) {
    const line = `Datum ${datumChangeLine(record)}`;
    const prior = textOrNull(well?.units_note);
    patch.units_note = [prior, line].filter(Boolean).join(' | ').slice(-1000);
  }
  return { columns: false, dropped, patch };
}

/** The datum fields of a new well row (saveWell), from a validated datum or a bare KB. */
export function datumInsertFields(next) {
  const n = next || {};
  const elev = numOrNull(n.refElevM);
  return {
    depth_ref_kind: elev !== null || n.refKind ? (n.refKind || 'KB') : null,
    depth_ref_label: n.refKind === 'OTHER' ? (n.refLabel || null) : null,
    depth_ref_elev_m: elev,
    well_environment: n.environment || null,
    ground_elev_m: numOrNull(n.groundElevM),
    water_depth_m: numOrNull(n.waterDepthM),
    vertical_datum: n.verticalDatum || null,
    elev_unit: n.elevUnit || null,
  };
}
