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
};
const ENGINE_NAMES = { 'petrophysics-studio': 'Petrophysics Studio' };

/**
 * @param {Object} log registry row
 * @returns {?{kind: 'computed'|'digitized'|'text', label: string, title: string}}
 */
export function curveOrigin(log) {
  const p = log?.provenance || {};
  if (p.computed) {
    const app = ENGINE_NAMES[p.engine] || p.engine || 'another app';
    const how = OPERATION_WORDS[p.operation] || (p.operation ? String(p.operation).replace(/[-_]/g, ' ') : 'interpretation');
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
