// Accept an organization invitation (/auth/accept-invite?token=...).
//
// Rewritten 2026-08-05 alongside invite-employee. The invited row lives in
// organization_members (status 'invited', invitation_token set by
// invite-employee). Two constraints shape the flow:
//   * (organization_id, email) is UNIQUE on organization_members, and
//   * handle_new_user() fires on auth user creation and, when the signup
//     metadata carries organization_id, inserts the active membership row
//     itself — and RE-RAISES on any error.
// So for a NEW user we delete the invited row first, then create the auth
// user with {organization_id, role} metadata and let the trigger write the
// active membership (restoring the invited row if creation fails). For an
// EXISTING user we simply activate the invited row against their user id —
// no password change, they log in as usual.

import { corsHeaders } from "./cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { token, password } = await req.json();
    if (!token || !password) return json({ error: 'Missing token or password' }, 400);

    // 1. Resolve the invitation.
    const { data: member, error: memberError } = await supabaseAdmin.from('organization_members')
      .select('*')
      .eq('invitation_token', token)
      .gte('invitation_expires_at', new Date().toISOString())
      .maybeSingle();
    if (memberError || !member) return json({ error: 'Invalid or expired invitation link. Ask your admin to re-invite you.' }, 400);

    // 2. Existing account? Link it instead of failing (the old version threw).
    const { data: existingUser } = await supabaseAdmin.from('users')
      .select('id').eq('email', member.email).maybeSingle();
    if (existingUser?.id) {
      const { error: linkError } = await supabaseAdmin.from('organization_members').update({
        user_id: existingUser.id,
        status: 'active',
        invitation_token: null,
        invitation_expires_at: null,
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', member.id);
      if (linkError) return json({ error: `Could not activate membership: ${linkError.message}` }, 500);
      console.log(`[accept-invite] linked existing user ${existingUser.id} into org ${member.organization_id}`);
      return json({
        success: true,
        linked: true,
        message: 'You already have a Petrolord account, so it was added to the organization. Log in with your existing password.',
      });
    }

    // 3. New account: remove the invited row so handle_new_user() can insert
    //    the active membership without violating the (org, email) unique key.
    const { error: deleteError } = await supabaseAdmin.from('organization_members')
      .delete().eq('id', member.id);
    if (deleteError) return json({ error: `Could not process invitation: ${deleteError.message}` }, 500);

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: member.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: member.full_name || member.email,
        organization_id: member.organization_id, // handle_new_user joins this org instead of creating one
        role: member.role || 'viewer',
        primary_app: 'suite',
      },
    });
    if (createError || !created?.user) {
      // Restore the invitation so the link keeps working after a transient failure.
      await supabaseAdmin.from('organization_members').insert({
        organization_id: member.organization_id,
        email: member.email,
        full_name: member.full_name,
        role: member.role,
        status: 'invited',
        invited_at: member.invited_at,
        invitation_token: token,
        invitation_expires_at: member.invitation_expires_at,
      });
      return json({ error: `Could not create your account: ${createError?.message || 'unknown error'}` }, 500);
    }

    console.log(`[accept-invite] created user ${created.user.id} in org ${member.organization_id} as ${member.role}`);
    return json({ success: true, userId: created.user.id });
  } catch (error) {
    console.error('[accept-invite] Unhandled:', (error as Error).message);
    return json({ error: (error as Error).message }, 500);
  }
});
