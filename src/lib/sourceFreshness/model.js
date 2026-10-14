/**
 * Source freshness: has a shared input changed since an app used it?
 *
 * Owner-approved 2026-10-12 (NAPE data governance paper: "changes to
 * decision objects must tell you which downstream outputs need
 * refreshing"). An app that pulls an input from a typed registry (a
 * published petrophysics zone, a registry surface, a culture polygon, a
 * well top) keeps a source reference with its project. On open, and on
 * demand, the reference is compared with the registry's record as it is
 * now. A changed source is shown beside the inputs with "Refresh from
 * source" (the app's own pull, run again) and "Keep current values" (a
 * decision recorded for that version of the source).
 *
 * A source reference, as an app saves it:
 *
 *   { key: 'zone:<id>',            unique in the project
 *     kind: 'geo_wells_zones',     one of SOURCE_KINDS (or any string; the label is then the kind)
 *     id: '<row id>',
 *     name: 'Keta Sand in KETA-1', what the person reads
 *     used_at: ISO,                when the app pulled it
 *     updated_at: ISO | null,      the row's updated_at at the pull
 *     version: int | null,         the row's version at the pull (record-sharing tables)
 *     fingerprint: 'f:1a2b3c4d',   hash of the kind's snapshot of the row at the pull
 *     snapshot: { ... },           that snapshot (small), so a change can be described
 *     affects_results: boolean }   results computed with it are marked stale while it is changed
 *
 * How a reference is compared (compareSource), first rule that applies:
 *   1. the row could not be read (undefined)        -> 'unknown' (no notice)
 *   2. the row is gone (null)                       -> 'deleted'
 *   3. both have a fingerprint                      -> 'changed' when they differ. Content only:
 *      a share, a rename or a re-save of the same values moves updated_at and is not a change.
 *   4. both have an integer version                 -> 'changed' when they differ
 *   5. the reference has updated_at                 -> 'changed' when the row's is later
 *   6. the reference has only used_at (projects saved before this feature recorded a stamp)
 *                                                   -> 'changed' when the row's updated_at is later
 *   7. nothing to compare                           -> 'unknown' (no notice)
 * A 'changed' or 'deleted' result whose current stamp the person kept
 * (kept[key] === keepToken) reads 'kept' and shows no notice.
 *
 * Pure: no React, no I/O.
 */

/** What each registry kind is called, and the snapshot that stands for its content. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toPrecision(10) : (v == null ? null : v));
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function sortedNumbers(o) {
  const out = {};
  if (!isRecord(o)) return out;
  for (const k of Object.keys(o).sort()) {
    const v = o[k];
    if (v == null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = num(v);
  }
  return out;
}

export const SOURCE_KINDS = Object.freeze({
  geo_wells_zones: {
    label: 'published petrophysics zone',
    snapshot: (row) => ({ top_md_m: num(row.top_md_m), base_md_m: num(row.base_md_m), properties: sortedNumbers(row.properties) }),
  },
  geo_surfaces: {
    label: 'registry surface',
    snapshot: (row) => {
      const h = Array.isArray(row.provenance?.history) ? row.provenance.history : [];
      return {
        frame: [num(row.origin_x), num(row.origin_y), num(row.nx), num(row.ny), num(row.dx), num(row.dy), num(row.rotation_deg || 0)],
        z: [row.z_domain || null, row.z_unit || null, row.xy_unit || null, row.crs || null],
        regrids: h.length,
        last_regrid: h.length ? (h[h.length - 1]?.at || h[h.length - 1]?.when || null) : null,
      };
    },
  },
  geo_culture: {
    label: 'culture polygon layer',
    snapshot: (row) => ({
      kind: row.kind || null, geometry_type: row.geometry_type || null, feature_count: num(row.feature_count),
      bbox: isRecord(row.bbox) ? sortedNumbers(row.bbox) : null, crs: row.crs || null,
    }),
  },
  geo_wells_tops: {
    label: 'well top',
    snapshot: (row) => ({ md_m: num(row.md_m) }),
  },
  // 2026-10-14 (Well Design Studio): the PP/FP/OBG curves Pore Pressure
  // Studio published on a registry well, as a design's mud window read them.
  // Content = which curve rows (a republish writes new rows) and their
  // pipeline; what the design saw (casing seats, window) rides in the
  // reference's `seen`, outside the fingerprint, so a trajectory edit is not
  // a change at the source.
  ppfg_prognosis: {
    label: 'published pore pressure prognosis',
    snapshot: (row) => ({
      well_id: row.id || null,
      curves: Array.isArray(row.curves)
        ? [...row.curves].sort((a, b) => String(a.mnemonic).localeCompare(String(b.mnemonic)))
          .map((c) => [c.mnemonic || null, c.log_id || null, c.pipeline_version || null, c.published_at || null])
        : null,
    }),
  },
  geo_wells: {
    label: 'registry well',
    snapshot: (row) => ({
      surface_x: num(row.surface_x), surface_y: num(row.surface_y),
      kb_m: num(row.kb_m), depth_ref_elev_m: num(row.depth_ref_elev_m), depth_ref_kind: row.depth_ref_kind || null,
      deviation: Array.isArray(row.deviation) ? row.deviation.map((s) => [num(s.md), num(s.inc), num(s.azi)]) : null,
    }),
  },
});

export const kindLabel = (kind) => SOURCE_KINDS[kind]?.label || String(kind || 'source');

/** Stable JSON: keys sorted at every level. */
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (isRecord(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

/** FNV-1a 32-bit over stable JSON, as 'f:xxxxxxxx'. */
export function fingerprintOf(snapshot) {
  if (snapshot == null) return null;
  const s = stableJson(snapshot);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `f:${h.toString(16).padStart(8, '0')}`;
}

/** The kind's snapshot of a row, or null when the kind has none. */
export function snapshotOf(kind, row) {
  const k = SOURCE_KINDS[kind];
  return k && row ? k.snapshot(row) : null;
}

const validTime = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? iso : null);
const isInt = (v) => Number.isInteger(v);

/**
 * A source reference for a row the app has just pulled.
 * @param {{key: string, kind: string, row: object, name?: string, usedAt?: string, affectsResults?: boolean, extra?: object}} a
 */
export function sourceRef({ key, kind, row, name = null, usedAt = new Date().toISOString(), affectsResults = true, extra = {} }) {
  const snapshot = snapshotOf(kind, row);
  return {
    key,
    kind,
    id: row?.id ?? null,
    name: name || row?.name || null,
    used_at: usedAt,
    updated_at: validTime(row?.updated_at) || null,
    version: isInt(row?.version) ? row.version : null,
    fingerprint: snapshot ? fingerprintOf(snapshot) : null,
    snapshot,
    affects_results: affectsResults !== false,
    ...extra,
  };
}

/** The token "Keep current values" records for the row as it is now. */
export function keepToken(ref, row) {
  if (row === null) return 'deleted';
  if (!row) return null;
  if (ref?.fingerprint) {
    const snap = snapshotOf(ref.kind, row);
    if (snap) return fingerprintOf(snap);
  }
  if (isInt(row.version)) return `v${row.version}`;
  return validTime(row.updated_at) ? `t${row.updated_at}` : null;
}

const later = (a, b) => validTime(a) && validTime(b) && Date.parse(a) > Date.parse(b);

/** Words for the snapshot fields a person reads in "What moved". */
const FIELD_WORDS = Object.freeze({
  'properties.phi_avg': 'porosity', 'properties.phie_avg': 'effective porosity', 'properties.phit_avg': 'total porosity',
  'properties.sw_avg': 'Sw', 'properties.ntg': 'net-to-gross', 'properties.net_m': 'net pay (m)', 'properties.gross_m': 'gross thickness (m)',
  'properties.hcpv_m': 'HCPV (m)', top_md_m: 'top MD (m)', base_md_m: 'base MD (m)', md_m: 'MD (m)',
  frame: 'grid frame', z: 'depth domain or unit', regrids: 're-grids', last_regrid: 'last re-grid',
  feature_count: 'feature count', bbox: 'extent', geometry_type: 'geometry', surface_x: 'surface X', surface_y: 'surface Y',
  kb_m: 'KB elevation (m)', depth_ref_elev_m: 'depth reference elevation (m)', depth_ref_kind: 'depth reference', deviation: 'deviation survey',
});
const fieldWords = (path) => FIELD_WORDS[path] || (path.startsWith('bbox.') ? 'extent' : path.replace(/^properties\./, '').replace(/_/g, ' '));

/** Words for what moved between the snapshot at the pull and the row now. */
export function describeChange(ref, row) {
  if (!ref?.snapshot || !row) return [];
  const now = snapshotOf(ref.kind, row);
  if (!now) return [];
  const was = ref.snapshot;
  const out = [];
  const show = (v) => (v == null ? 'none' : typeof v === 'number' ? String(+v.toPrecision(4)) : String(v));
  const walk = (a, b, path) => {
    if (isRecord(a) || isRecord(b)) {
      for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) walk(a?.[k], b?.[k], path ? `${path}.${k}` : k);
      return;
    }
    if (stableJson(a) === stableJson(b)) return;
    if (Array.isArray(a) || Array.isArray(b)) { out.push(`${fieldWords(path)} changed`); return; }
    out.push(`${fieldWords(path)} ${show(a)} to ${show(b)}`);
  };
  walk(was, now, '');
  return [...new Set(out)].slice(0, 6);
}

/**
 * Compare one reference with the registry row as it is now.
 * @param {object} ref a sourceRef
 * @param {object|null|undefined} row the row now; null when it no longer exists, undefined when it could not be read
 * @param {Object<string,string>} kept tokens recorded by "Keep current values", by ref key
 * @returns {{key: string, ref: object, status: 'unchanged'|'changed'|'deleted'|'kept'|'unknown',
 *   basis: ?string, changedAt: ?string, changedById: ?string, token: ?string, differences: string[]}}
 */
export function compareSource(ref, row, kept = {}) {
  const base = { key: ref?.key, ref, basis: null, changedAt: null, changedById: null, token: null, differences: [] };
  if (!ref || row === undefined) return { ...base, status: 'unknown' };
  if (row === null) {
    const status = kept?.[ref.key] === 'deleted' ? 'kept' : 'deleted';
    return { ...base, status, basis: 'deleted', token: 'deleted' };
  }
  let changed = null;
  let basis = null;
  const snap = ref.fingerprint ? snapshotOf(ref.kind, row) : null;
  if (ref.fingerprint && snap) { changed = fingerprintOf(snap) !== ref.fingerprint; basis = 'content'; }
  else if (isInt(ref.version) && isInt(row.version)) { changed = row.version !== ref.version; basis = 'version'; }
  else if (validTime(ref.updated_at) && validTime(row.updated_at)) { changed = later(row.updated_at, ref.updated_at); basis = 'updated_at'; }
  else if (validTime(ref.used_at) && validTime(row.updated_at)) { changed = later(row.updated_at, ref.used_at); basis = 'used_at'; }
  if (changed === null) return { ...base, status: 'unknown' };
  if (!changed) return { ...base, status: 'unchanged', basis };
  const token = keepToken(ref, row);
  const status = token && kept?.[ref.key] === token ? 'kept' : 'changed';
  return {
    ...base,
    status,
    basis,
    token,
    changedAt: validTime(row.updated_at) || null,
    changedById: row.updated_by || null,
    differences: describeChange(ref, row),
  };
}

/** Results that need the person: changed or deleted, not kept. */
export const needsAttention = (results) => (results || []).filter((r) => r.status === 'changed' || r.status === 'deleted');

/** A new kept map with this result's current token recorded. */
export function keepSource(kept, result) {
  if (!result?.key || !result.token) return { ...(kept || {}) };
  return { ...(kept || {}), [result.key]: result.token };
}

/** The kept map without entries for keys no longer referenced (tidy before save). */
export function pruneKept(kept, refs) {
  const keys = new Set((refs || []).map((r) => r.key));
  return Object.fromEntries(Object.entries(kept || {}).filter(([k]) => keys.has(k)));
}

export const whenText = (iso) => (validTime(iso) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);

/** The sentences the notice shows for one result; `usedBy` names what used the source. */
export function noticeText(result, { usedBy = 'this project' } = {}) {
  const r = result.ref || {};
  const what = `${r.name || r.id || 'A source'} (${kindLabel(r.kind)})`;
  const used = whenText(r.used_at);
  if (result.status === 'deleted') {
    return {
      headline: `${what} was deleted from the registry, or is no longer shared with you, after ${usedBy} used it.`,
      detail: `${used ? `Used ${used}. ` : ''}The values taken from it stay as they were.`,
    };
  }
  const at = whenText(result.changedAt);
  const by = result.changedBy ? ` by ${result.changedBy}` : '';
  const parts = [];
  if (used) parts.push(`Used ${used}.`);
  if (at) parts.push(`Changed ${at}${by}.`);
  else if (by) parts.push(`Changed${by}.`);
  if (result.differences?.length) parts.push(`What moved: ${result.differences.join('; ')}.`);
  return { headline: `${what} changed after ${usedBy} used it.`, detail: parts.join(' ') };
}

/** The line a result panel shows while any result-affecting source needs attention, or null. */
export function staleResultsText(results) {
  const hit = needsAttention(results).filter((r) => r.ref?.affects_results !== false);
  if (!hit.length) return null;
  const names = [...new Set(hit.map((r) => r.ref?.name || r.ref?.id).filter(Boolean))];
  return `Computed from inputs whose source changed: ${names.join(', ')}. Refresh from source or keep the current values to clear this mark.`;
}
