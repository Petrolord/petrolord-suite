// Electrofacies Studio (Data & AI D3): what a saved facies run holds.
//
// A run stores its INPUTS (where the data came from and the spec as typed,
// seeds included) and a SUMMARY of what the runs found when it was saved:
// per method the settings, the headline scores against the core, the rows
// and wells used and a fingerprint of the exact numbers clustered.
// Everything on screen is recomputed by the engine when a run opens; if the
// data has changed since, the fingerprints differ and the studio says so.
//
// Registry wells are referenced by id and read again on open. An uploaded
// table is not stored anywhere else, so its columns are kept in the run (up
// to MAX_SAVED_UPLOAD_VALUES values); beyond that the run keeps the spec
// only and asks for the file again.
import { snapshotFaciesTable } from '@/utils/dataAi/faciesData';
import { defaultSpec, ENGINE_VERSION, methodText } from '@/utils/dataAi/faciesWorkflows';

export const STUDY_SCHEMA = 1;
export const ELECTROFACIES_ROUTE = '/dashboard/apps/data-ai/electrofacies-studio';
export const SOURCES = ['wells', 'upload'];
export const RESULT_KEYS = ['kmeans', 'agglomerative', 'knn', 'cart'];

/** FNV-1a (32 bit) over the clustered numbers: names, wells, X and core facies, as hex. */
export function fingerprint(design) {
  if (!design || !Array.isArray(design.X)) return null;
  let h = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  feed(JSON.stringify(design.names));
  for (let i = 0; i < design.X.length; i += 1) {
    feed(design.groups[i]);
    feed(JSON.stringify(design.X[i]));
    feed(String(design.facies ? design.facies[i] : ''));
  }
  return h.toString(16).padStart(8, '0');
}

const matchSummary = (cmp) => {
  if (!cmp || cmp.none || !cmp.match || cmp.match.error) return null;
  return {
    mode: cmp.mode, rows: cmp.rows, ari: cmp.match.ari, accuracy: cmp.match.report.accuracy,
  };
};

/** The part of each result worth keeping as the record of the run. */
export function summarise({ design, parsed, results }) {
  if (!design || design.error) return null;
  const out = {
    features: design.names,
    scale: parsed.scale,
    rows: design.X.length,
    wells: design.wells,
    faciesSource: design.faciesText,
    fingerprint: fingerprint(design),
    engine: ENGINE_VERSION,
    ranAt: new Date().toISOString(),
    methods: {},
  };
  const pca = results.pca?.result;
  if (pca && !pca.error) out.pca = { matrix: pca.matrix, explainedVarianceRatio: pca.explainedVarianceRatio };
  RESULT_KEYS.forEach((key) => {
    const r = results[key]?.result;
    if (!r) return;
    if (key === 'kmeans') {
      const km = r.kmeans;
      out.methods.kmeans = km.error ? { refused: km.error } : {
        text: methodText(key, r, parsed), k: km.k, seed: km.seed, nInit: km.runs.length, inertia: km.inertia, silhouette: r.silhouette?.error ? null : r.silhouette?.mean ?? null, core: matchSummary(r.compare),
      };
    } else if (key === 'agglomerative') {
      const ag = r.agglomerative;
      out.methods.agglomerative = ag.error ? { refused: ag.error } : {
        text: methodText(key, r, parsed), linkage: ag.linkage, k: ag.k ?? null, sampled: !!r.sampled, rows: ag.n, silhouette: r.silhouette?.error ? null : r.silhouette?.mean ?? null, core: matchSummary(r.compare),
      };
    } else {
      const refused = r.error || r.blind?.error || r.blindTree?.error || null;
      out.methods[key] = refused ? { refused } : {
        text: methodText(key, r, parsed),
        heldOutWells: r.split.testGroups,
        heldOutRows: r.split.nTest,
        accuracy: r.scores.report.error ? null : r.scores.report.accuracy,
        macroF1: r.scores.report.error ? null : r.scores.report.macro.f1,
        ari: r.scores.ari.error ? null : r.scores.ari.ari,
      };
    }
  });
  return out;
}

/** The payload a save writes. */
export function serializeStudy({
  name, source, dataRef, table, spec, design, parsed, results,
}) {
  const snap = source === 'upload' && table ? snapshotFaciesTable(table) : null;
  return {
    name,
    schema: STUDY_SCHEMA,
    source: SOURCES.includes(source) ? source : null,
    dataRef: dataRef || null,
    snapshot: snap,
    snapshotOmitted: source === 'upload' && table && !snap ? true : undefined,
    spec,
    summary: summarise({ design, parsed, results: results || {} }),
    modified: new Date().toISOString(),
  };
}

/** A stored spec merged over the defaults, so an older save still opens. */
export function specFromPayload(spec) {
  const d = defaultSpec();
  if (!spec || typeof spec !== 'object') return d;
  return {
    ...d,
    ...spec,
    features: Array.isArray(spec.features) ? spec.features.filter((f) => f && typeof f.name === 'string').map((f) => ({ name: f.name, log: !!f.log })) : [],
    facies: { ...d.facies, ...(spec.facies || {}) },
    pca: { ...d.pca, ...(spec.pca || {}) },
    kmeans: { ...d.kmeans, ...(spec.kmeans || {}) },
    elbow: { ...d.elbow, ...(spec.elbow || {}) },
    agglomerative: { ...d.agglomerative, ...(spec.agglomerative || {}) },
    supervised: { ...d.supervised, ...(spec.supervised || {}) },
  };
}

/** A stored payload back to inputs, or null when it cannot be read. */
export function studyFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || payload.schema !== STUDY_SCHEMA) return null;
  return {
    name: payload.name || '',
    source: SOURCES.includes(payload.source) ? payload.source : null,
    dataRef: payload.dataRef || null,
    snapshot: payload.snapshot || null,
    snapshotOmitted: !!payload.snapshotOmitted,
    spec: specFromPayload(payload.spec),
    summary: payload.summary || null,
  };
}
