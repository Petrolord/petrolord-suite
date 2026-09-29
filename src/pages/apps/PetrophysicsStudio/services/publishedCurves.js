// What the Studio's published curves say about themselves (AppUpgrade
// PETRO-U2-009, PETRO-U1-025; PETRO-U2-013, PETRO-U1-026). The zone card
// already says when its published numbers no longer match; published
// curves did not, so Well Correlation, Rock Physics or Data AI could read
// an interpretation the analyst has since changed without anyone knowing.
// Each Studio curve is compared with the interpretation now open: the same
// interpretation with the same parameters, overrides and pipeline is
// current; anything else is stale and says what moved.

import { PIPELINE_VERSION } from '../engine/pipeline';
import { isPrePt9aPhie } from '@/lib/petroProvenance';

/** Mnemonics the base publish writes (the ones a parameter change moves). */
export const BASE_PUBLISHED = Object.freeze(['VSH', 'PHIT', 'PHIE', 'SW', 'SWT', 'PAY', 'KPERM']);

const base = (m) => String(m || '').toUpperCase().split(':')[0];
const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${k}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
};

/** Keys whose values differ between two parameter sets. */
export function changedKeys(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].filter((k) => stable(a?.[k]) !== stable(b?.[k])).sort();
}

/**
 * @param {Object} log registry row
 * @param {{params: Object, zoneParams: Object, projectId: string}} ctx the interpretation now open
 * @returns {?{state: 'current'|'stale'|'other'|'old-phie', reasons: string[], interpretation: ?string}}
 *   null for curves the Studio's base publish did not write
 */
export function publishedCurveState(log, ctx) {
  const p = log?.provenance || {};
  if (!p.computed || p.engine !== 'petrophysics-studio' || p.operation) return null;
  if (!BASE_PUBLISHED.includes(base(log.mnemonic))) return null;
  const interpretation = p.interpretation_name || null;
  if (isPrePt9aPhie(log)) return { state: 'old-phie', reasons: ['published before 2026-09-07: this PHIE is total porosity'], interpretation };
  if (p.project_id && ctx.projectId && p.project_id !== ctx.projectId) {
    return { state: 'other', reasons: [`published by another interpretation${interpretation ? ` (${interpretation})` : ''}`], interpretation };
  }
  const reasons = [];
  if (Number(p.pipeline_version) !== PIPELINE_VERSION) reasons.push(`pipeline ${p.pipeline_version ?? 'unknown'} (now ${PIPELINE_VERSION})`);
  const params = changedKeys(p.params, ctx.params);
  if (params.length) reasons.push(`parameters changed: ${params.join(', ')}`);
  const zones = changedKeys(p.zone_params, ctx.zoneParams);
  if (zones.length) reasons.push(`zone overrides changed (${zones.length} zone${zones.length === 1 ? '' : 's'})`);
  return { state: reasons.length ? 'stale' : 'current', reasons, interpretation };
}

/** Every Studio curve on the well with its state; counts per state. */
export function publishedSummary(logs, ctx) {
  const rows = [];
  for (const log of logs || []) {
    const s = publishedCurveState(log, ctx);
    if (s) rows.push({ log, ...s });
  }
  const count = (st) => rows.filter((r) => r.state === st).length;
  return { rows, current: count('current'), stale: count('stale'), other: count('other'), oldPhie: count('old-phie') };
}

/**
 * Facies intervals the Studio published carry the key of the rules or
 * polygons that made them (properties.source_key); the same key now means
 * current. Intervals without a key predate this and read 'unknown'.
 */
export const faciesKey = (defs) => stable(defs || null);
export function faciesState(intervals, kind, defs) {
  const rows = (intervals || []).filter((r) => r.kind === kind);
  if (!rows.length) return null;
  const key = rows.find((r) => r.properties?.source_key)?.properties?.source_key;
  if (!key) return { state: 'unknown', n: rows.length };
  return { state: key === faciesKey(defs) ? 'current' : 'stale', n: rows.length };
}
