import { supabase } from '@/lib/customSupabaseClient';

// Membership consolidation (migration 20260713300000): organization_members
// is the single canonical membership table. The legacy organization_users /
// org_members tables were backfilled into it and replaced by read-only
// compatibility views scheduled for removal, so new code must never query
// them. All frontend org resolution goes through here; entitlements live in
// organization_apps / purchased_modules, not on the membership row.

/**
 * Resolve the organization id for a user. Returns the id string, or null if
 * the user belongs to no org.
 */
export async function resolveUserOrgId(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.organization_id || null;
}

/**
 * Full membership row for a user: `{ organization_id, role, status }` or null.
 * Call sites that previously destructured a single-row `organization_users`
 * query keep working (`organization_id` is present); `role` is the single
 * canonical role column (legacy user_role no longer exists).
 */
export async function getUserOrgRow(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data || null;
}
