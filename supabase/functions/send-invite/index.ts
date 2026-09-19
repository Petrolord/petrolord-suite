// send-invite: e-mails an EXISTING HSE invitation (public.invitations) to its
// invited address. Called by the HSE team pages (teamService.inviteMember /
// resendInvitation, inviteUserService.sendInviteEmail) after they insert the
// invitation row.
//
// Security fix 2026-09-19. The Horizons-era version (deployed, never
// committed) was an unauthenticated mail relay: verify_jwt off, no caller
// check, and email / inviteLink / orgName / inviterName / role were taken from
// the body and interpolated unescaped into HTML sent from Petrolord's Brevo
// sender, so anyone could send Petrolord-branded phishing to anyone. It also
// logged a prefix of the Brevo API key.
//
// Now (see ../_shared/invite-send.ts):
//   * the caller must be signed in and an active admin of the invitation's
//     organization, or a platform super admin (public.platform_admins);
//   * the body only names the invitation: { invite_id } or { token }. Any
//     email / inviteLink / orgName / inviterName / role in the body is IGNORED;
//     the recipient, role and organization come from the database row and the
//     link is built here from an allow-listed origin;
//   * every interpolated value is HTML-escaped.
// The HSE payloads already carry `token` (and invite_id), so the live HSE
// build keeps working without a client change.
//
// Response: always 200 with { success, messageId? , error? } for delivery
// outcomes (the HSE callers read success/error), 400/401/403/404/409 for a
// request that is refused.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './cors.ts';
import { escapeHtml, getCaller } from '../_shared/platform-admin.ts';
import { inviteOrigin, resolveSendableInvitation } from '../_shared/invite-send.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const caller = await getCaller(admin, req);
    if (!caller) return json({ success: false, error: 'Sign in required.' }, 401);

    const body = await req.json().catch(() => ({}));
    const decision = await resolveSendableInvitation(admin, caller.id, body);
    if (!decision.ok) return json({ success: false, error: decision.error }, decision.status);

    const { invite, orgName } = decision;
    const isResend = body?.isResend === true || body?.is_resend === true;
    const inviteLink = `${inviteOrigin(req.headers.get('origin'))}/accept-invite/${encodeURIComponent(invite.token)}`;
    const inviterName = caller.email || 'An administrator';

    const apiKey = Deno.env.get('BREVO_API_KEY') ||
      ((Deno.env.get('BREVO_SMTP_PASSWORD') || '').startsWith('xkeysib-') ? Deno.env.get('BREVO_SMTP_PASSWORD') : '');
    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || Deno.env.get('SENDER_EMAIL');
    const senderName = Deno.env.get('BREVO_SENDER_NAME') || 'Petrolord';
    if (!apiKey || !senderEmail) {
      console.error('[send-invite] email provider not configured');
      return json({ success: false, error: 'Email service is not configured.' });
    }

    const subject = isResend
      ? `Reminder: Invitation to join ${orgName} on Petrolord HSE`
      : `You've been invited to join ${orgName} on Petrolord HSE`;
    const e = escapeHtml;
    const htmlContent = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${e(subject)}</title></head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f9; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #1a472a; padding: 20px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 24px;">Petrolord HSE</h1></div>
    <div style="padding: 40px; color: #333333; line-height: 1.6;">
      <h2>Hello${invite.first_name ? ` ${e(invite.first_name)}` : ''},</h2>
      <p><strong>${e(inviterName)}</strong> has invited you to join the organization <strong>${e(orgName)}</strong> on the Petrolord HSE platform.</p>
      <p>You have been assigned the role: <strong>${e(invite.role || 'Member')}</strong></p>
      <p>Click the button below to accept your invitation and set up your account:</p>
      <div style="text-align: center;"><a href="${e(inviteLink)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; margin-top: 20px;">Accept Invitation</a></div>
      <p style="margin-top: 30px; font-size: 0.9em; color: #666;">Or copy and paste this link into your browser:<br/><a href="${e(inviteLink)}" style="color: #2563eb;">${e(inviteLink)}</a></p>
      <p>Petrolord HSE and Petrolord Suite share the same login, so once you set your password you can use both.</p>
    </div>
    <div style="background-color: #f4f4f9; padding: 20px; text-align: center; font-size: 12px; color: #666666;">
      <p>&copy; ${new Date().getFullYear()} Petrolord. If you were not expecting this invitation, you can ignore this email.</p>
    </div>
  </div>
</body></html>`;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: invite.email }],
        subject,
        htmlContent,
      }),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!res.ok) {
      console.error(`[send-invite] provider error ${res.status} for invitation ${invite.id}`);
      return json({ success: false, error: `Email provider error (${res.status}).` });
    }
    console.log(`[send-invite] invitation ${invite.id} sent by ${caller.id}`);
    return json({ success: true, messageId: data.messageId ?? null });
  } catch (error) {
    console.error('[send-invite] failed:', (error as Error).message);
    return json({ success: false, error: 'Could not send the invitation email.' });
  }
});
