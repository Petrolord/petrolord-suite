// Record builders for the four reasoning kinds plus narrative (spec
// section 33) and the depth and time rules every row obeys (sections 10
// to 12). Pure: the builders return plain rows shaped exactly like the
// ws_records table; commit.js writes them.

import { newId, deviceId } from './ids';
import { toCanonicalMd, validateDepth } from './depth';
import { assertUtc, nowStamp } from './time';
import { PLATFORM_BUILD } from '@/lib/platformBuild';

export const RECORD_KINDS = Object.freeze(['observation', 'interpretation', 'event', 'decision', 'narrative']);
export const CONFIDENCES = Object.freeze(['low', 'medium', 'high']);

export class RecordError extends Error {
  constructor(errors) {
    super(errors.join(' '));
    this.name = 'RecordError';
    this.errors = errors;
  }
}

/** Depth columns for a row from an entered depth and the well context; prefix '' or '2'. */
export function depthColumns(entry, ctx, { prefix = '', atUtc = null } = {}) {
  const r = toCanonicalMd(entry, ctx, { atUtc });
  if (!r.ok) throw new RecordError(r.errors);
  const p = prefix;
  const cols = {
    [`depth${p}_value`]: entry.value,
    [`depth${p}_unit`]: entry.unit,
    [`depth${p}_ref`]: entry.reference,
    [`depth${p}_datum`]: entry.datum,
    [`depth${p}_kind`]: entry.kind,
    [`md${p}_calc_m`]: r.mdM,
    [`tvd${p}_calc_m`]: r.calculated.tvdM,
    [`tvdss${p}_calc_m`]: r.calculated.tvdssM,
  };
  if (!p) {
    cols.survey_version = r.calculated.surveyVersion;
    cols.calc_method = r.calculated.method;
  }
  return { columns: cols, warnings: r.warnings, calculated: r.calculated };
}

/** The entered depth back out of a row (for display and recalculation). */
export function depthEntryOf(row, prefix = '') {
  const p = prefix;
  if (row[`md${p}_calc_m`] == null) return null;
  return {
    value: row[`depth${p}_value`], unit: row[`depth${p}_unit`], reference: row[`depth${p}_ref`],
    datum: row[`depth${p}_datum`], kind: row[`depth${p}_kind`],
  };
}

function stamp(row, { userId, offsetMin, nowMs }) {
  const t = nowStamp(offsetMin, nowMs);
  return {
    ...row,
    created_by: userId,
    client_created_at: t.occurred_at,
    device_id: deviceId(),
    schema_version: 1,
    app_build: PLATFORM_BUILD.sha,
    sync_state: 'pending',
  };
}

/**
 * Build a ws_records row.
 * @param {Object} p
 * @param {string} p.wellId
 * @param {'observation'|'interpretation'|'event'|'decision'|'narrative'} p.kind
 * @param {string} [p.subtype]
 * @param {Object} [p.depth] entered depth {value, unit, reference, datum, kind}
 * @param {Object} [p.depth2] entered base depth
 * @param {Object} p.ctx well depth context
 * @param {string} [p.occurredAt] ISO UTC, default now
 * @param {number} p.offsetMin rig offset
 * @param {string} p.userId
 * @param {Object} [p.payload]
 * @param {string} [p.chainId] version chain (defaults to the new id)
 * @param {string} [p.previousVersionId]
 * @param {string} [p.supersedesId] observation correction
 * @param {string[]} [p.resolvesIds]
 * @param {'low'|'medium'|'high'} [p.confidence]
 * @param {string[]} [p.evidenceIds]
 */
export function buildRecord(p) {
  const errors = [];
  if (!p.wellId) errors.push('A well is required.');
  if (!RECORD_KINDS.includes(p.kind)) errors.push(`Record kind must be one of ${RECORD_KINDS.join(', ')}.`);
  if (!p.userId) errors.push('A signed-in user is required.');
  if (!Number.isInteger(p.offsetMin)) errors.push('The rig offset is not set on this well.');
  if (p.kind === 'interpretation' && !CONFIDENCES.includes(p.confidence)) errors.push('An interpretation needs a confidence of low, medium or high.');
  if (p.kind === 'decision' && !(p.payload && p.payload.basis && p.payload.statement)) errors.push('A decision needs a basis and a statement.');
  if (p.kind === 'observation' && p.previousVersionId) errors.push('An observation is immutable, correct it with a new observation that supersedes the old one.');
  if (p.depth && !validateDepth(p.depth).ok) errors.push(...validateDepth(p.depth).errors);
  if (errors.length) throw new RecordError(errors);

  const nowMs = p.nowMs ?? Date.now();
  const id = p.id || newId();
  const occurredAt = p.occurredAt || new Date(nowMs).toISOString();
  const endedAt = p.endedAt || null;
  const base = {
    id,
    well_id: p.wellId,
    kind: p.kind,
    subtype: p.subtype || null,
    chain_id: p.chainId || id,
    version_no: p.versionNo || 1,
    previous_version_id: p.previousVersionId || null,
    supersedes_id: p.supersedesId || null,
    resolves_ids: p.resolvesIds && p.resolvesIds.length ? p.resolvesIds : null,
    confidence: p.confidence || null,
    evidence_ids: p.evidenceIds || [],
    sample_id: p.sampleId || null,
    photo_id: p.photoId || null,
    occurred_at: occurredAt,
    ended_at: endedAt,
    local_offset_min: p.offsetMin,
    payload: p.payload || {},
  };
  const timeErrors = assertUtc(base);
  if (timeErrors.length) throw new RecordError(timeErrors);
  if (endedAt && Date.parse(endedAt) < Date.parse(occurredAt)) throw new RecordError(['An event cannot end before it starts.']);
  const warnings = [];
  if (p.depth) {
    const d = depthColumns(p.depth, p.ctx, { atUtc: occurredAt });
    Object.assign(base, d.columns);
    warnings.push(...d.warnings);
  }
  if (p.depth2) {
    if (!p.depth) throw new RecordError(['A base depth needs a top depth.']);
    const d2 = depthColumns(p.depth2, p.ctx, { prefix: '2', atUtc: occurredAt });
    Object.assign(base, d2.columns);
    warnings.push(...d2.warnings);
  }
  return { row: stamp(base, { userId: p.userId, offsetMin: p.offsetMin, nowMs }), warnings };
}

/** A new version of a versioned record (interpretation, decision, narrative). */
export function nextVersion(prev, p) {
  if (prev.kind === 'observation') throw new RecordError(['An observation is immutable, correct it with a new observation that supersedes the old one.']);
  return buildRecord({
    ...p,
    wellId: prev.well_id,
    kind: prev.kind,
    subtype: p.subtype ?? prev.subtype,
    chainId: prev.chain_id,
    versionNo: (prev.version_no || 1) + 1,
    previousVersionId: prev.id,
  });
}

/** A correction of an observation: a new observation that supersedes the old one. */
export function correction(prev, p) {
  if (prev.kind !== 'observation') throw new RecordError(['Only observations are corrected this way, versioned kinds get a new version.']);
  return buildRecord({ ...p, wellId: prev.well_id, kind: 'observation', subtype: p.subtype ?? prev.subtype, supersedesId: prev.id });
}

/** Heads of a chain among a list of records (nothing names them as previous and no resolver cites them). */
export function chainHeads(records) {
  const prev = new Set();
  const resolved = new Set();
  for (const r of records) {
    if (r.previous_version_id) prev.add(r.previous_version_id);
    for (const id of r.resolves_ids || []) resolved.add(id);
  }
  return records.filter((r) => !prev.has(r.id) && !resolved.has(r.id));
}

/** Current observations: those not superseded by another. */
export function currentObservations(records) {
  const superseded = new Set(records.map((r) => r.supersedes_id).filter(Boolean));
  return records.filter((r) => r.kind === 'observation' && !superseded.has(r.id));
}
