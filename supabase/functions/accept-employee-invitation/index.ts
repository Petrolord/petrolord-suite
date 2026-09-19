// Accept an organization invitation (/auth/accept-invite?token=...).
//
// Rewritten 2026-08-05 alongside invite-employee; security fix 2026-09-19
// (migration 20260919190000_security_invitation_acceptance). The invited row
// lives in organization_members (status 'invited', invitation_token set by
// invite-employee).
//   * NEW user: the auth user is created with the invitation_token in its
//     metadata. handle_new_user() validates that token against the invited
//     row (same email, unexpired) and activates it with the row's role. The
//     trigger no longer honours a bare organization_id (anyone can put one in
//     signUp metadata), so the invited row is NOT deleted first any more: the
//     trigger upserts onto it. Before the migration is applied the old
//     trigger joins on organization_id and upserts onto the same row, so this
//     version is safe to deploy first.
//   * EXISTING user: the invited row is activated against their user id; no
//     password change, they log in as usual.
// Only rows still in status 'invited' with an unexpired token are honoured,
// and the token is cleared once used.

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
      .eq('status', 'invited')
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

    // 3. New account. The token travels in the metadata; handle_new_user()
    //    validates it and activates the invited row with ITS role.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: member.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: member.full_name || member.email,
        invitation_token: token,
        // Checked against the token's org by the new trigger; what the old
        // trigger joined on, so this also works before the migration.
        organization_id: member.organization_id,
        role: member.role || 'viewer',
        primary_app: 'suite',
      },
    });
    if (createError || !created?.user) {
      return json({ error: `Could not create your account: ${createError?.message || 'unknown error'}` }, 500);
    }

    // Belt and braces for the pre-migration trigger, which does not clear
    // the token: a used link must not work again.
    await supabaseAdmin.from('organization_members').update({
      invitation_token: null,
      invitation_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', member.id).eq('status', 'active');

    console.log(`[accept-invite] created user ${created.user.id} in org ${member.organization_id} as ${member.role}`);
    return json({ success: true, userId: created.user.id });
  } catch (error) {
    console.error('[accept-invite] Unhandled:', (error as Error).message);
    return json({ error: (error as Error).message }, 500);
  }
});
