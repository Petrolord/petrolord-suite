// Invite a member to an organization (Suite + HSE shared flow).
//
// Rewritten 2026-08-05: the Horizons-era original checked permissions against
// organization_users (dropped by the 20260713300000 membership consolidation,
// so every invite 403'd) and wrote its token to the invitations table while
// accept-employee-invitation looked in organization_members.invitation_token —
// the two halves never matched. This version uses the canonical
// organization_members table end to end:
//   1. caller must be an active admin-role member of the org, or a platform
//      super admin;
//   2. an 'invited' member row is upserted with a fresh invitation_token;
//   3. the invite email links to /auth/accept-invite?token=... which
//      accept-employee-invitation resolves against that same row.
// The response always includes invite_link so the UI can offer a copyable
// link when email delivery fails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './cors.ts';
import { sendEmail } from '../_shared/email.ts';

const SUPER_ADMIN_EMAILS = ['info@petrolord.com', 'ayoasaolu@gmail.com', 'ayodejiasaolu1@gmail.com', 'support@petrolord.com'];
const ADMIN_ROLES = ['owner', 'admin', 'org_admin', 'super_admin'];

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

    // 1. Resolve the caller from the JWT.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    const caller = authData?.user ?? null;
    if (authError || !caller) return json({ error: 'Unauthorized: invalid or expired session.' }, 401);

    const { email, full_name, role = 'viewer', organization_id } = await req.json();
    const inviteEmail = String(email || '').trim().toLowerCase();
    if (!inviteEmail || !organization_id) {
      return json({ error: 'email and organization_id are required.' }, 400);
    }

    // 2. Permission: active admin-role member of the org, or platform super admin.
    const { data: callerRows } = await supabaseAdmin.from('organization_members')
      .select('role, status')
      .eq('organization_id', organization_id).eq('user_id', caller.id);
    const isOrgAdmin = (callerRows ?? []).some((m) =>
      (m.status ?? 'active').toLowerCase() === 'active' && ADMIN_ROLES.includes(m.role));
    let allowed = isOrgAdmin ||
      caller.user_metadata?.is_super_admin === true ||
      SUPER_ADMIN_EMAILS.includes(String(caller.email || '').toLowerCase());
    if (!allowed) {
      const { data: urow } = await supabaseAdmin.from('users')
        .select('is_super_admin').eq('id', caller.id).maybeSingle();
      allowed = urow?.is_super_admin === true;
    }
    if (!allowed) return json({ error: 'Only organization admins can invite members.' }, 403);

    // 3. Upsert the invited member row. (organization_id, email) is unique:
    //    an existing ACTIVE member is reported as such; an existing invited
    //    row gets a fresh token (re-invite).
    const { data: existing } = await supabaseAdmin.from('organization_members')
      .select('id, status, user_id')
      .eq('organization_id', organization_id).eq('email', inviteEmail).maybeSingle();
    if (existing && (existing.status ?? '').toLowerCase() === 'active') {
      return json({ error: `${inviteEmail} is already an active member of this organization.` }, 409);
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const memberRow = {
      organization_id,
      email: inviteEmail,
      full_name: full_name || null,
      role,
      status: 'invited',
      invited_at: new Date().toISOString(),
      invitation_token: token,
      invitation_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    const { error: writeError } = existing
      ? await supabaseAdmin.from('organization_members').update(memberRow).eq('id', existing.id)
      : await supabaseAdmin.from('organization_members').insert(memberRow);
    if (writeError) return json({ error: `Could not record the invitation: ${writeError.message}` }, 500);

    // 4. Send the invite email (Resend, then Brevo fallback). Failure to send
    //    never fails the invite: the link is returned for manual sharing.
    const { data: orgRow } = await supabaseAdmin.from('organizations')
      .select('name').eq('id', organization_id).maybeSingle();
    const orgName = orgRow?.name || 'their organization';
    const origin = (req.headers.get('origin') || 'https://petrolord.com').replace(/\/$/, '');
    const inviteLink = `${origin}/auth/accept-invite?token=${token}`;

    const emailSubject = `You're invited to join ${orgName} on Petrolord`;
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #111827;">You've been invited</h2>
        <p style="color: #4b5563;">You have been invited to join <strong>${orgName}</strong> on the Petrolord platform as <strong>${String(role)}</strong>.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #65a30d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation</a>
        </div>
        <p style="color: #6b7280; font-size: 14px; text-align: center;">Or copy this link into your browser:<br>
        <a href="${inviteLink}" style="color: #65a30d;">${inviteLink}</a></p>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 30px;">This link expires in 7 days.</p>
      </div>
    `;

    // Shared Resend -> Brevo helper (extracted from this function; behavior
    // identical). Send failure never fails the invite: the link is returned
    // for manual sharing.
    const emailSent = await sendEmail({
      to: inviteEmail,
      subject: emailSubject,
      html: emailHtml,
      logPrefix: '[invite-employee]',
    });

    console.log(`[invite-employee] ${caller.email} invited ${inviteEmail} to org ${organization_id} (email sent: ${emailSent})`);
    return json({
      success: true,
      emailSent,
      invite_link: inviteLink,
      message: emailSent
        ? `Invitation emailed to ${inviteEmail}.`
        : `Invitation created, but the email could not be sent. Share the invite link manually.`,
    });
  } catch (error) {
    console.error('[invite-employee] Unhandled:', (error as Error).message);
    return json({ error: (error as Error).message }, 500);
  }
});
