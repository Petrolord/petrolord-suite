import { supabase } from '@/lib/customSupabaseClient';

// Organization membership is spread across three historical tables:
//   - organization_users   (legacy table + per-user module/app grants)
//   - organization_members  (written by the signup flow)
//   - org_members           (used by some older flows; PK column is org_id)
// The whole frontend must resolve a user's org through here so that a row in ANY
// of them counts. Reading a single table makes users provisioned into a
// different one look org-less (the bug behind "Could not identify your
// organization"). This mirrors the membership check already done server-side in
// the generate-quote edge function.

/**
 * Resolve the organization id for a user from any of the three membership
 * tables. Returns the id string, or null if the user belongs to no org.
 */
export async function resolveUserOrgId(userId) {
  if (!userId) return null;
  const [ou, om, ogm] = await Promise.all([
    supabase.from('organization_users').select('organization_id').eq('user_id', userId).maybeSingle(),
    supabase.from('organization_members').select('organization_id').eq('user_id', userId).maybeSingle(),
    supabase.from('org_members').select('org_id').eq('user_id', userId).maybeSingle(),
  ]);
  return ou.data?.organization_id || om.data?.organization_id || ogm.data?.org_id || null;
}

/**
 * Convenience wrapper for call sites that previously destructured a single-row
 * `organization_users` query as `orgUser` and read `orgUser.organization_id`.
 * Returns `{ organization_id }` or null so those call sites keep working.
 */
export async function getUserOrgRow(userId) {
  const organization_id = await resolveUserOrgId(userId);
  return organization_id ? { organization_id } : null;
}
