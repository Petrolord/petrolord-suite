// Seismic storage constants + quota accounting, in their own
// import.meta-free module so services that need the bucket name stay
// parseable under babel-jest (ingestService's inline worker URL poisons
// everything that imports it).

import { supabase } from '@/lib/customSupabaseClient';

export const SEISMIC_BUCKET = 'seismic';

// Per-user storage quota. This client check is the FRIENDLY layer: it
// fails a job up-front with a clear message before any upload work.
// The AUTHORITATIVE layer is server-side since migration
// 20260712120000_seismic_storage_quota.sql: the 'seismic' bucket's
// INSERT policy refuses new objects once the user's bucket footprint
// reaches the same 20 GiB (updates/deletes stay quota-free so an
// over-quota user can still save work and free space). Keep the two
// constants in lockstep.
export const STORAGE_QUOTA_BYTES = 20 * 1024 ** 3;   // 20 GiB

// One accounting for the friendly layer: OWN rows only (org-shared rows
// visible under sharing v1 RLS are a teammate's footprint, not this
// user's), volumes + 2D lines together. survey_meta.storage_bytes is the
// registered footprint each ingest/derive writes.
export async function getStorageUsage() {
  const empty = { usedBytes: 0, quotaBytes: STORAGE_QUOTA_BYTES, known: false };
  let user;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    return empty;
  }
  if (!user) return empty;
  const sum = (rows) => (rows || []).reduce(
    (s, r) => s + (Number(r.survey_meta?.storage_bytes) || 0), 0);
  const [vols, lines] = await Promise.all([
    supabase.from('seismic_volumes').select('survey_meta').eq('user_id', user.id),
    supabase.from('seismic_lines').select('survey_meta').eq('user_id', user.id),
  ]);
  if (vols.error || lines.error) return empty;
  return {
    usedBytes: sum(vols.data) + sum(lines.data),
    quotaBytes: STORAGE_QUOTA_BYTES,
    known: true,
  };
}

/** Friendly pre-flight quota check (the authoritative layer is the
 *  bucket's INSERT policy). Never blocks on a read hiccup. */
export async function assertQuota(estimateBytes) {
  const usage = await getStorageUsage();
  if (!usage.known) return;
  if (usage.usedBytes + estimateBytes > usage.quotaBytes) {
    const gib = (n) => (n / 1024 ** 3).toFixed(1);
    throw new Error(
      `Storage quota exceeded: ${gib(usage.usedBytes)} GiB used + ~${gib(estimateBytes)} GiB new `
      + `> ${gib(usage.quotaBytes)} GiB. Delete old volumes or lines first.`);
  }
}
