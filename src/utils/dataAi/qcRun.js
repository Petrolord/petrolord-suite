// Data Quality Studio (Data & AI D1): what a saved QC run holds.
//
// A run stores its INPUTS (where the data came from and the profile) and a
// SUMMARY of what the run found when it was saved: the scorecard, the flag
// counts and a fingerprint of the values checked. The summary is a record
// of the check at that time; everything on screen is recomputed by the
// engine when a run opens, and if the data has changed since, the
// fingerprints differ and the app says so.
//
// Registry and spine data are referenced by id and read again on open. An
// uploaded file is not stored anywhere else, so its checked columns are kept
// in the run (up to MAX_SAVED_UPLOAD_VALUES numbers); beyond that the run
// keeps the profile only and asks for the file again.
import { snapshotDataset } from '@/utils/dataAi/qcDatasets';
import { PROFILE_SCHEMA, profileFromPayload } from '@/utils/dataAi/qcProfile';

export const RUN_SCHEMA = 1;
export const QC_STUDIO_ROUTE = '/dashboard/apps/data-ai/data-quality-studio';
export const SOURCES = ['wells', 'production', 'upload'];

/** FNV-1a (32 bit) over the dataset's index and channel values, as hex. */
export function fingerprint(ds) {
  if (!ds) return null;
  let h = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  feed(JSON.stringify(ds.index ? ds.index.values : null));
  ds.channels.forEach((c) => { feed(c.name); feed(JSON.stringify(c.values)); });
  return h.toString(16).padStart(8, '0');
}

/** The part of a run result worth keeping as the record of the run. */
export function summarise(run, ds) {
  if (!run) return null;
  const byDimension = {};
  run.flags.forEach((f) => { byDimension[f.dimension] = (byDimension[f.dimension] || 0) + 1; });
  const sc = run.scorecard && !run.scorecard.error ? run.scorecard : null;
  return {
    total: sc ? sc.total : null,
    weakest: sc ? sc.weakest : null,
    dimensions: sc ? sc.dimensions.map(({ name, score, checked, failed, weight }) => ({ name, score, checked, failed, weight })) : [],
    flagCount: run.flags.length,
    byDimension,
    samples: run.dataset.n,
    channels: run.dataset.channels,
    fingerprint: fingerprint(ds),
    ranAt: new Date().toISOString(),
  };
}

/** The payload a save writes. */
export function serializeRun({ name, source, datasetRef, dataset, profile, run }) {
  const snap = source === 'upload' && dataset ? snapshotDataset(dataset) : null;
  return {
    name,
    schema: RUN_SCHEMA,
    profileSchema: PROFILE_SCHEMA,
    source: SOURCES.includes(source) ? source : null,
    datasetRef: datasetRef || null,
    snapshot: snap,
    snapshotOmitted: source === 'upload' && dataset && !snap ? true : undefined,
    profile,
    summary: summarise(run, dataset),
    modified: new Date().toISOString(),
  };
}

/** A stored payload back to inputs, or null when it cannot be read. */
export function runFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || payload.schema !== RUN_SCHEMA) return null;
  return {
    name: payload.name || '',
    source: SOURCES.includes(payload.source) ? payload.source : null,
    datasetRef: payload.datasetRef || null,
    snapshot: payload.snapshot || null,
    snapshotOmitted: !!payload.snapshotOmitted,
    profile: profileFromPayload(payload.profile),
    summary: payload.summary || null,
  };
}
