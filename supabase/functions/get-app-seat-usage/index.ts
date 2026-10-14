// get-app-seat-usage: seat allocation and assignments of one app for one org
// (Subscription Management page).
//
// Deployed from the Horizons era and never committed; brought into the repo
// by the 2026-10 security sweep. Before: verify_jwt off and no caller check,
// so anyone could read any organization's seat holders; app_id went
// unescaped into a PostgREST or() filter; it listed every auth user.
// Now: the caller must be signed in and an active member of the org (or a
// platform super admin); app_id must be a plain slug.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './cors.ts';
import { getCaller, isOrgMember, isPlatformAdmin } from '../_shared/platform-admin.ts';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,80}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const caller = await getCaller(supabase, req);
    if (!caller) return json({ error: 'Sign in required.' }, 401);

    const { organization_id, app_id } = await req.json().catch(() => ({}));
    if (!UUID.test(String(organization_id || '')) || !SLUG.test(String(app_id || ''))) {
      return json({ error: 'organization_id and app_id are required.' }, 400);
    }
    const allowed = (await isOrgMember(supabase, caller.id, organization_id)) || (await isPlatformAdmin(supabase, caller));
    if (!allowed) return json({ error: 'Forbidden.' }, 403);

    // 1. Allocation from the active purchase (app_id, or a module whose id contains it).
    const { data: purchase } = await supabase
      .from('purchased_modules')
      .select('seats_allocated, status')
      .eq('organization_id', organization_id)
      .or(`app_id.eq.${app_id},module_id.ilike.%${app_id}%`)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    const totalSeats = purchase?.seats_allocated || 0;

    // 2. Assignments.
    const { data: assignments, error } = await supabase
      .from('app_seat_assignments')
      .select('id, user_id, seat_number, is_admin_seat, is_locked, reassigned_from_admin, created_at')
      .eq('organization_id', organization_id)
      .eq('app_id', app_id)
      .order('seat_number');
    if (error) throw error;
    const rows = assignments ?? [];

    // 3. Names from user_profiles (no auth.users listing).
    const userIds = rows.map((a) => a.user_id).filter(Boolean);
    const { data: profiles } = userIds.length
      ? await supabase.from('user_profiles').select('id, full_name').in('id', userIds)
      : { data: [] };

    const enriched = rows.map((a) => ({
      ...a,
      user_name: profiles?.find((p) => p.id === a.user_id)?.full_name || 'Unknown User',
      can_reassign: a.is_admin_seat && !a.reassigned_from_admin,
    }));

    return json({
      total_seats: totalSeats,
      used_seats: rows.length,
      available_seats: Math.max(0, totalSeats - rows.length),
      assignments: enriched,
    });
  } catch (e) {
    console.error('[get-app-seat-usage]', (e as Error).message);
    return json({ error: 'Could not load seat usage.' }, 400);
  }
});
