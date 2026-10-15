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
// reaches the user's quota (updates/deletes stay quota-free so an
// over-quota user can still save work and free space). Both layers read
// seismic_storage_quota_bytes() since QI Q0b-4.
export const STORAGE_QUOTA_BYTES = 20 * 1024 ** 3;   // 20 GiB, everyone's floor

// QI Q0b-4: an organization can have a larger seismic storage tier. The
// signed-in user's quota is seismic_storage_quota_bytes(), the same function
// the bucket's INSERT policy uses; on any failure (an older database, a read
// hiccup) the friendly check falls back to the 20 GiB floor.
export async function getQuotaBytes() {
  try {
    const { data, error } = await supabase.rpc('seismic_storage_quota_bytes');
    const n = Number(data);
    return !error && Number.isFinite(n) && n >= STORAGE_QUOTA_BYTES ? n : STORAGE_QUOTA_BYTES;
  } catch {
    return STORAGE_QUOTA_BYTES;
  }
}

// Seismic storage tiers (owner-approved 2026-10-06): an organisation with a
// tier shares one pool. seismic_storage_summary() answers exactly what the
// bucket policy counts (pooled usage and quota) and names the pool; use it
// when the database has it.
async function pooledSummary() {
  try {
    const { data, error } = await supabase.rpc('seismic_storage_summary');
    if (error || !data || typeof data !== 'object') return null;
    const used = Number(data.used_bytes);
    const quota = Number(data.quota_bytes);
    if (!Number.isFinite(used) || !(quota >= STORAGE_QUOTA_BYTES)) return null;
    return {
      usedBytes: used,
      quotaBytes: quota,
      known: true,
      pooled: !!data.pooled,
      organizationName: data.organization_name || null,
      tierLabel: data.tier_label || null,
      members: Number(data.members) || null,
    };
  } catch {
    return null;
  }
}

// Fallback accounting for the friendly layer (an older database): OWN rows
// only (org-shared rows visible under sharing v1 RLS are a teammate's
// footprint, not this user's), volumes + 2D lines together.
// survey_meta.storage_bytes is the registered footprint each ingest/derive writes.
export async function getStorageUsage() {
  const empty = { usedBytes: 0, quotaBytes: STORAGE_QUOTA_BYTES, known: false };
  let user;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    return empty;
  }
  if (!user) return empty;
  const pooled = await pooledSummary();
  if (pooled) return pooled;
  const sum = (rows) => (rows || []).reduce(
    (s, r) => s + (Number(r.survey_meta?.storage_bytes) || 0), 0);
  const [vols, lines, quotaBytes] = await Promise.all([
    supabase.from('seismic_volumes').select('survey_meta').eq('user_id', user.id),
    supabase.from('seismic_lines').select('survey_meta').eq('user_id', user.id),
    getQuotaBytes(),
  ]);
  if (vols.error || lines.error) return empty;
  return {
    usedBytes: sum(vols.data) + sum(lines.data),
    quotaBytes,
    known: true,
    pooled: false,
  };
}

export async function assertQuota(estimateBytes) {
  const usage = await getStorageUsage();
  if (!usage.known) return;
  if (usage.usedBytes + estimateBytes > usage.quotaBytes) {
    const gib = (n) => (n / 1024 ** 3).toFixed(1);
    const whose = usage.pooled ? `your organisation's shared seismic storage (${gib(usage.quotaBytes)} GiB)` : `${gib(usage.quotaBytes)} GiB`;
    throw new Error(
      `Storage quota exceeded: ${gib(usage.usedBytes)} GiB used + ~${gib(estimateBytes)} GiB new `
      + `> ${whose}. Delete old volumes or lines first${usage.pooled ? ', or ask your administrator about a larger storage tier' : ''}.`);
  }
}
