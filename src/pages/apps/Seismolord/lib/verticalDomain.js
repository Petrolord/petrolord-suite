// The vertical axis of a seismic volume (QI upgrade P1.6, 2026-10-15).
// Seismolord was built for two-way time. A depth-migrated stack or a depth
// velocity volume can now be imported: the import records a depth
// declaration ({domain: 'depth', unit, dz, values}) in survey_meta.ingest,
// the manifest geometry (geometry.vertical, inherited by every derived
// volume) and the row's survey_meta. For a depth volume geometry.dt_us holds
// the declared depth interval x 1000, so the generic sample axis reads in the
// depth unit; every consumer that needs time asks timeOnlyReason first.
//
// Pure, no React or Supabase: the browser, the seismic worker and the tests
// import it.

export const DEPTH_UNITS = Object.freeze(['m', 'ft']);
export const VELOCITY_TYPES = Object.freeze({
  interval: 'Interval velocity',
  rms: 'RMS velocity',
  average: 'Average velocity',
});

const TIME = Object.freeze({ domain: 'time', unit: 'ms', dz: null, values: null });

/**
 * A checked depth declaration.
 * @param {{unit: string, dz: number|string, velocity?: ?{type: string}}} d
 * @returns {{domain: 'depth', unit: 'm'|'ft', dz: number, values: ?{kind: 'velocity', type: string, unit: string}}}
 */
export function depthDeclaration({ unit, dz, velocity = null }) {
  if (!DEPTH_UNITS.includes(unit)) throw new Error('Choose the depth unit, metres or feet.');
  const step = typeof dz === 'string' ? (dz.trim() === '' ? NaN : Number(dz)) : Number(dz);
  if (!(step > 0) || !Number.isFinite(step)) throw new Error('Give the depth sample interval, a positive number.');
  if (step > 1000) throw new Error('The depth sample interval looks too large (over 1000).');
  const dzRounded = Math.round(step * 1000) / 1000;
  let values = null;
  if (velocity) {
    if (!VELOCITY_TYPES[velocity.type]) throw new Error('Say which velocity the volume holds: interval, RMS or average.');
    values = { kind: 'velocity', type: velocity.type, unit: unit === 'ft' ? 'ft/s' : 'm/s' };
  }
  return { domain: 'depth', unit, dz: dzRounded, values };
}

/** The sample interval a depth declaration gives the manifest (dt_us), in thousandths of the unit. */
export const depthDtUs = (decl) => Math.round(decl.dz * 1000);

/**
 * The vertical axis of a volume row, a manifest, a scan or a bare
 * declaration. Time when nothing says otherwise (every volume before
 * 2026-10-15).
 */
export function verticalOf(x) {
  if (!x || typeof x !== 'object') return TIME;
  const v = (x.domain ? x : null)
    || x.geometry?.vertical
    || x.survey_meta?.vertical
    || x.survey_meta?.ingest?.vertical
    || x.vertical
    || null;
  if (!v || v.domain !== 'depth') return TIME;
  return { domain: 'depth', unit: v.unit === 'ft' ? 'ft' : 'm', dz: Number(v.dz) || null, values: v.values || null };
}

export const isDepthVolume = (x) => verticalOf(x).domain === 'depth';

/** The unit the sample axis reads in: ms, m or ft. */
export const axisUnit = (x) => verticalOf(x).unit;

/** "depth (m)" or "two-way time (ms)": the axis in words. */
export function axisWords(x) {
  const v = verticalOf(x);
  return v.domain === 'depth' ? `depth (${v.unit})` : 'two-way time (ms)';
}

/** What the volume holds, in words, for a depth volume with declared velocities. */
export function valuesWords(x) {
  const v = verticalOf(x);
  if (!v.values) return null;
  return `${VELOCITY_TYPES[v.values.type] || 'Velocity'} in ${v.values.unit}`;
}

/**
 * Why a tool that works in two-way time cannot use this volume, or null
 * when the volume is in time.
 * @param {Object} x volume row or manifest
 * @param {string} what the tool, as the start of a sentence ("Well ties")
 * @param {string} [name] the volume's name
 */
export function timeOnlyReason(x, what, name = null) {
  const v = verticalOf(x);
  if (v.domain !== 'depth') return null;
  const vol = name || x?.name || 'This volume';
  return `${vol} is a depth volume (samples every ${v.dz ?? '?'} ${v.unit}). ${what} works in two-way time, so it needs a time volume.`;
}

/** Throw the time-only reason as an Error (worker handlers wrap it as a refusal). */
export function assertTimeDomain(x, what, name = null) {
  const why = timeOnlyReason(x, what, name);
  if (why) throw new Error(why);
}

/**
 * Put a depth declaration on a manifest built by the import (all three
 * conversion paths call this): geometry.vertical, inherited by every derived
 * volume. A time import (no declaration) leaves the manifest untouched.
 */
export function applyVerticalToManifest(manifest, decl) {
  if (!decl || decl.domain !== 'depth') return manifest;
  manifest.geometry.vertical = { domain: 'depth', unit: decl.unit, dz: decl.dz, ...(decl.values ? { values: decl.values } : {}) };
  manifest.geometry.dt_us = depthDtUs(decl);
  return manifest;
}

/** The survey_meta fields a depth volume adds (spread into survey_meta builders). */
export const verticalMeta = (geometry) => (geometry?.vertical ? { vertical: geometry.vertical } : {});

/** A scan whose sample interval is the declared depth interval (the import's conversions run on it). */
export function scanWithVertical(scan, decl) {
  if (!scan || !decl || decl.domain !== 'depth') return scan;
  return { ...scan, dtUs: depthDtUs(decl) };
}

/**
 * The depth declaration the import dialog prefills from a scan: the unit
 * from the binary header's measurement system (byte 3255: 1 metres, 2 feet;
 * metres when unstated) and the interval from the header's sample interval
 * read as thousandths of the unit (4000 is 4 m), or as the unit itself when
 * that gives under 0.1 (a header holding 4 for 4 m).
 */
export function depthPrefill(scan) {
  const unit = scan?.measurementSystem === 2 ? 'ft' : 'm';
  const raw = Number(scan?.dtUs) || 0;
  let dz = raw / 1000;
  if (raw > 0 && dz < 0.1) dz = raw;
  return { unit, dz: dz > 0 ? String(Math.round(dz * 1000) / 1000) : '' };
}
