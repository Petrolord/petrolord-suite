// W0.2: mutable interpretation state (velocity model, well-tie
// calibration, named traverses) lives in seismic_volumes columns guarded
// by an integer-revision compare-and-set; manifest.json is
// immutable-after-ingest. Precedence: a row with interp_rev > 0 is
// authoritative (nulls mean deleted); interp_rev = 0 falls back to the
// legacy manifest fields and writes through once on open.
//
// Own module (no ingestService import, jest cannot parse its inline
// worker import.meta) so precedence, composition, and CAS are testable.

import { supabase } from '@/lib/customSupabaseClient';

/** CAS refusal: another session saved after this one read. Catch by
 *  `e.name === 'INTERP_CONFLICT'`; the message is user-facing copy. */
export class InterpConflictError extends Error {
  constructor() {
    super('This volume was updated in another session. Reload the volume, then save again.');
    this.name = 'INTERP_CONFLICT';
  }
}

/** Resolve the effective interpretation state from a fresh row + the
 *  frozen storage manifest. */
export function resolveInterpState(row, manifest) {
  const rev = row?.interp_rev ?? 0;
  if (rev > 0) {
    return {
      velocity: row.velocity_model || null,
      calibration: (row.velocity_model && row.velocity_calibration) || null,
      traverses: row.traverses || [],
      rev,
    };
  }
  return {
    velocity: manifest?.velocity || null,
    calibration: (manifest?.velocity && manifest?.velocity_calibration) || null,
    traverses: manifest?.traverses || [],
    rev: 0,
  };
}

/** True when a rev-0 row has legacy manifest state worth writing through. */
export function interpNeedsMigration(manifest) {
  return Boolean(manifest?.velocity || manifest?.velocity_calibration
    || (manifest?.traverses && manifest.traverses.length));
}

/** Merge a velocity save into the in-memory manifest view (same
 *  semantics the old manifest writer had: calibration persists only
 *  alongside a model, a hand-typed save clears it). */
export function applyVelocityToManifest(manifest, velocity, calibration = null) {
  const next = { ...manifest };
  if (velocity) next.velocity = velocity;
  else delete next.velocity;
  if (velocity && calibration) next.velocity_calibration = calibration;
  else delete next.velocity_calibration;
  return next;
}

/** Merge a traverse-list save into the in-memory manifest view. */
export function applyTraversesToManifest(manifest, traverses) {
  const next = { ...manifest };
  if (traverses && traverses.length) next.traverses = traverses;
  else delete next.traverses;
  return next;
}

/** Compose the viewer's effective manifest from the frozen storage
 *  manifest + resolved interpretation state. */
export function composeManifest(manifest, interp) {
  return applyTraversesToManifest(
    applyVelocityToManifest(manifest, interp.velocity, interp.calibration),
    interp.traverses,
  );
}

/** Fresh row read on volume open (the list snapshot may carry a stale
 *  interp_rev). */
export async function getVolumeRow(volumeId) {
  const { data, error } = await supabase
    .from('seismic_volumes').select('*').eq('id', volumeId).single();
  if (error) throw new Error(`Could not load volume: ${error.message}`);
  return data;
}

async function casUpdate(volumeId, patch, expectedRev) {
  const { data, error } = await supabase
    .from('seismic_volumes')
    .update({ ...patch, interp_rev: expectedRev + 1 })
    .eq('id', volumeId)
    .eq('interp_rev', expectedRev)
    .select();
  if (error) throw new Error(`Could not save interpretation state: ${error.message}`);
  if (!data || data.length === 0) throw new InterpConflictError();
  return data[0];
}

/** Save the velocity model (+ optional calibration provenance) under CAS.
 *  Pass velocity null to remove the model. Returns the updated row. */
export function saveVolumeVelocity(volume, velocity, calibration, expectedRev) {
  return casUpdate(volume.id, {
    velocity_model: velocity ?? null,
    velocity_calibration: (velocity && calibration) ? calibration : null,
  }, expectedRev);
}

/** Save the named traverse list under CAS. Empty list clears. */
export function saveVolumeTraverses(volume, traverses, expectedRev) {
  return casUpdate(volume.id, {
    traverses: (traverses && traverses.length) ? traverses : null,
  }, expectedRev);
}

/** One-time write-through of legacy manifest interp state into the row
 *  (rev 0 -> 1). Losing the race means another session migrated first;
 *  the fresh row is returned either way. */
export async function migrateInterpState(volume, manifest) {
  try {
    return await casUpdate(volume.id, {
      velocity_model: manifest.velocity ?? null,
      velocity_calibration:
        (manifest.velocity && manifest.velocity_calibration) ? manifest.velocity_calibration : null,
      traverses: (manifest.traverses && manifest.traverses.length) ? manifest.traverses : null,
    }, 0);
  } catch (e) {
    if (e?.name === 'INTERP_CONFLICT') return getVolumeRow(volume.id);
    throw e;
  }
}
