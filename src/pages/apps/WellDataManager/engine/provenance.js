// Where a stored curve came from, in words (AppUpgrade WDM-U2-008). A
// curve Petrophysics Studio computed (provenance.computed) used to look
// exactly like a measured log in the Logs table; a digitized curve too.
// The badge says which app made it, how, and from which interpretation.
// Pure, no I/O.

// PETRO-U2-013: pre-PT9a PHIE rows hold total porosity; flagged, never rewritten
import { isPrePt9aPhie, PRE_PT9A_PHIE_NOTE } from '@/lib/petroProvenance';

const OPERATION_WORDS = {
  'mineral-model': 'mineral model',
  'depth-shift': 'depth shift',
  probabilistic: 'probabilistic run',
  scenario: 'scenario',
  conditioning: 'conditioning',
  splice: 'splice',
  edit: 'log edit',
  'drift-correction': 'sonic drift correction',
};
const ENGINE_NAMES = {
  'petrophysics-studio': 'Petrophysics Studio',
  'well-data-manager': 'Well Data Manager',
  'pore-pressure-studio': 'Pore Pressure Studio',
  'rock-physics-studio': 'Rock Physics Studio',
  'geomechanics-studio': 'Geomechanics',
};
// what a computed curve is, by the app that made it, when it records no operation
const DEFAULT_WORK = { 'pore-pressure-studio': 'pressure prognosis' };

/**
 * @param {Object} log registry row
 * @returns {?{kind: 'computed'|'digitized'|'text', label: string, title: string}}
 */
export function curveOrigin(log) {
  const p = log?.provenance || {};
  if (p.computed) {
    const app = ENGINE_NAMES[p.engine] || p.engine || 'another app';
    const how = OPERATION_WORDS[p.operation] || (p.operation ? String(p.operation).replace(/[-_]/g, ' ') : (DEFAULT_WORK[p.engine] || 'interpretation'));
    const parts = [`Computed by ${app} (${how})`];
    if (p.interpretation_name) parts.push(`interpretation "${p.interpretation_name}"`);
    if (p.pipeline_version) parts.push(`pipeline ${p.pipeline_version}`);
    if (Array.isArray(p.input_log_ids) && p.input_log_ids.length) parts.push(`from ${p.input_log_ids.length} input curve${p.input_log_ids.length === 1 ? '' : 's'}`);
    if (isPrePt9aPhie(log)) return { kind: 'computed', label: 'computed, total porosity', stale: true, title: `${parts.join(', ')}. ${PRE_PT9A_PHIE_NOTE}` };
    return { kind: 'computed', label: 'computed', title: `${parts.join(', ')}. Recomputing in ${app} replaces it; imported logs are never overwritten.` };
  }
  if (p.digitized) {
    return { kind: 'digitized', label: 'digitized', title: 'Traced from a scanned log image in Petrophysics Studio: utility grade, check before quantitative use.' };
  }
  if (p.text_channel) {
    return { kind: 'text', label: p.text_channel === 'datetime' ? 'time channel' : 'coded text', title: p.text_channel === 'datetime'
      ? `LAS 3.0 date-time channel, stored as seconds after ${p.time_origin || 'the first sample'}.`
      : `LAS 3.0 text channel, stored as codes: ${Object.entries(p.codes || {}).map(([k, v]) => `${k} = ${v}`).join(', ')}.` };
  }
  return null;
}

/**
 * The Source cell of the Logs table (2026-10-14): a loaded log names its file;
 * a computed curve, which has no file, names the app, its pipeline and when it
 * was written, so a reader sees which prognosis or interpretation is on the
 * well without opening a tooltip.
 * @param {Object} log registry row
 * @returns {?string} null when there is nothing to say (the caller shows its empty mark)
 */
export function curveSource(log) {
  if (log?.source_file) return log.source_file;
  const p = log?.provenance || {};
  if (!p.computed) return null;
  const app = ENGINE_NAMES[p.engine] || p.engine || 'another app';
  const when = log.created_at && !Number.isNaN(Date.parse(log.created_at)) ? new Date(log.created_at).toISOString().slice(0, 10) : null;
  return [app, p.pipeline_version || null, when].filter(Boolean).join(', ');
}

/**
 * crs_provenance after a CRS is assigned by hand. The assignment MERGES:
 * other apps keep their own keys in this object (Wellsite Studio's
 * `deviation` survey source, Well Design's `datum_transform`, the
 * reprojection chain), and declaring what the stored coordinates already
 * are must not erase them.
 * @param {?Object} prev the row's crs_provenance
 * @param {string} tag the CRS tag picked ('EPSG:<code>', 'LOCAL', 'UNKNOWN', ...)
 * @param {Date} [now]
 */
export function assignedCrsProvenance(prev, tag, now = new Date()) {
  const base = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  return { ...base, assigned_manually: true, declared_crs: tag, date: now.toISOString() };
}
