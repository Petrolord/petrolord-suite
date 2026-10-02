/**
 * Input provenance: where each input of an analysis came from, and what a
 * reviewer should know about its quality. Taken from the Well Test Analysis
 * Studio (tester round 2, 2026-10-02), where the reviewer asked for the
 * source and the sample quality beside every reservoir and fluid input.
 *
 * One record per input, keyed by the input's key in the app:
 *
 *   { source: '' | 'lab' | 'correlation' | 'offset' | 'assumed',
 *     correlation: 'Standing',          // only with source 'correlation'
 *     note: 'Bottomhole sample 2, OBM contamination 4 percent' }
 *
 * '' is an entered value whose source was not stated. Every field is
 * optional and a missing record is the same as an empty one, so a project
 * saved before an app adopted the model opens unchanged.
 *
 * In a project's saved JSON the records sit under one key, `inputMeta`
 * (the name the Well Test projects already use):
 *
 *   { ..., "inputMeta": { "mu": { "source": "lab", "note": "..." }, "B": { "source": "correlation", "correlation": "Standing" } } }
 *
 * Pure: no React, no I/O.
 */

/** The key the records are saved under in a project payload. */
export const PROVENANCE_KEY = 'inputMeta';

/** Source kinds and the words the selector shows for each. */
export const INPUT_SOURCES = Object.freeze({
  '': 'Not stated',
  lab: 'Measured (lab)',
  correlation: 'Correlation',
  offset: 'Offset well',
  assumed: 'Assumed',
});

export const SOURCE_KINDS = Object.freeze(Object.keys(INPUT_SOURCES));
export const PROVENANCE_FIELDS = Object.freeze(['source', 'correlation', 'note']);

export const isSourceKind = (kind) => typeof kind === 'string' && Object.prototype.hasOwnProperty.call(INPUT_SOURCES, kind);

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v == null ? '' : String(v));

/** One record with every field present as a string. */
export function normalizeMeta(meta) {
  const m = isRecord(meta) ? meta : {};
  return { source: str(m.source), correlation: str(m.correlation), note: str(m.note) };
}

/** True when the record says anything: a source, a correlation name or a note. */
export function isStated(meta) {
  const m = normalizeMeta(meta);
  return !!(m.source || m.note.trim() || m.correlation.trim());
}

/** How many of the listed input keys carry a source or a note (the "3 of 9 stated" count). */
export const countStated = (map, keys) => (keys || []).filter((k) => map?.[k]?.source || map?.[k]?.note).length;

/** A new map with one field of one input set; the map passed in is not changed. */
export function setProvenanceField(map, key, field, value) {
  const base = isRecord(map) ? map : {};
  return { ...base, [key]: { ...(base[key] || {}), [field]: value } };
}

/**
 * The map as it goes into a project's saved JSON: only inputs that state
 * something, only the fields that are set, a correlation name only beside
 * source 'correlation'. Deterministic key order (the order of `map`).
 */
export function serializeProvenance(map) {
  const out = {};
  if (!isRecord(map)) return out;
  for (const [key, meta] of Object.entries(map)) {
    if (!isStated(meta)) continue;
    const m = normalizeMeta(meta);
    const rec = {};
    if (m.source) rec.source = m.source;
    if (m.source === 'correlation' && m.correlation.trim()) rec.correlation = m.correlation.trim();
    if (m.note.trim()) rec.note = m.note.trim();
    if (Object.keys(rec).length) out[key] = rec;
  }
  return out;
}

/**
 * Read the map back from a saved payload value. Anything that is not a
 * plain object reads as no provenance; inside a record only the three known
 * fields are kept, as strings, and only where the saved record has them, so
 * what an app saved comes back as it was. A source kind this version does
 * not know is kept as saved (the wording falls back to "source not stated").
 */
export function deserializeProvenance(raw) {
  const out = {};
  if (!isRecord(raw)) return out;
  for (const [key, meta] of Object.entries(raw)) {
    if (!isRecord(meta)) continue;
    const rec = {};
    for (const f of PROVENANCE_FIELDS) if (meta[f] != null) rec[f] = String(meta[f]);
    out[key] = rec;
  }
  return out;
}

/** Read the provenance of a whole project payload ({ ..., inputMeta }). */
export const provenanceFromPayload = (payload) => deserializeProvenance(payload?.[PROVENANCE_KEY]);
