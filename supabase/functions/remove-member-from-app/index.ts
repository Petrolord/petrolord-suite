// remove-member-from-app: take a member's seat on one app (Subscription
// Management page).
//
// Deployed from the Horizons era and never committed; brought into the repo
// by the 2026-10 security sweep. Before: the admin check used requested_by
// from the BODY (verify_jwt off), against organization_users, a table the
// 2026-07 membership consolidation dropped, and the assignment was never
// checked to belong to that organization.
// Now: the caller is the verified session user and must be an active
// owner/admin/org_admin of the organization (or a platform super admin);
// the assignment must belong to that organization. requested_by is ignored.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './cors.ts';
import { getCaller, isOrgAdmin, isPlatformAdmin } from '../_shared/platform-admin.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const caller = await getCaller(supabase, req);
    if (!caller) return json({ error: 'Sign in required.' }, 401);

    const { assignment_id, organization_id } = await req.json().catch(() => ({}));
    if (!UUID.test(String(assignment_id || '')) || !UUID.test(String(organization_id || ''))) {
      return json({ error: 'assignment_id and organization_id are required.' }, 400);
    }
    const allowed = (await isOrgAdmin(supabase, caller.id, organization_id)) || (await isPlatformAdmin(supabase, caller));
    if (!allowed) return json({ error: 'Only organization admins can remove seats.' }, 403);

    const { data: assignment } = await supabase
      .from('app_seat_assignments')
      .select('*')
      .eq('id', assignment_id)
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (!assignment) return json({ error: 'Assignment not found.' }, 404);

    // An admin seat lent to a member goes back to the admin who lent it.
    if (assignment.is_admin_seat && assignment.reassigned_from_admin) {
      const { error } = await supabase
        .from('app_seat_assignments')
        .update({ user_id: assignment.assigned_by, is_locked: false, reassigned_from_admin: false, updated_at: new Date().toISOString() })
        .eq('id', assignment_id)
        .eq('organization_id', organization_id);
      if (error) throw error;
      return json({ success: true, message: 'Seat reverted to admin' });
    }
    if (assignment.is_admin_seat) {
      return json({ error: 'Cannot remove the primary admin seat. Cancel the subscription instead.' }, 409);
    }

    const { error } = await supabase.from('app_seat_assignments').delete()
      .eq('id', assignment_id).eq('organization_id', organization_id);
    if (error) throw error;
    return json({ success: true, message: 'Seat removed' });
  } catch (e) {
    console.error('[remove-member-from-app]', (e as Error).message);
    return json({ error: 'Could not remove the seat.' }, 400);
  }
});
