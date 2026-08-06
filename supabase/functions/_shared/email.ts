// Shared transactional email helper: Resend first, Brevo fallback.
//
// Extracted from the invite-employee flow (rewritten 2026-08-05); since
// 2026-08-06 invite-employee itself uses this helper too. The legacy
// `send-email` / `send-email-via-smtp` functions some code still invokes are
// deployed-but-unversioned; never build on them.
//
// Env: RESEND_API_KEY, BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME,
// SENDER_EMAIL (default no-reply@petrolord.com).
//
// Returns true if either provider accepted the message. Never throws: callers
// treat delivery as best-effort and must not fail their operation on it.

export interface EmailAttachment {
  filename: string;
  content: string;          // base64
  contentType?: string;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  logPrefix?: string;
}

export async function sendEmail({ to, subject, html, attachments, logPrefix = '[email]' }: SendEmailArgs): Promise<boolean> {
  const senderEmail = Deno.env.get('SENDER_EMAIL') || 'no-reply@petrolord.com';
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const brevoApiKey = Deno.env.get('BREVO_API_KEY');

  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `Petrolord <${senderEmail.includes('@') ? senderEmail : 'onboarding@resend.dev'}>`,
          to, subject, html,
          ...(attachments?.length
            ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) }
            : {}),
        }),
      });
      if (res.ok) return true;
      console.warn(`${logPrefix} Resend failed:`, await res.text());
    } catch (e) { console.warn(`${logPrefix} Resend exception:`, (e as Error).message); }
  }

  if (brevoApiKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({
          sender: {
            email: Deno.env.get('BREVO_SENDER_EMAIL') || senderEmail,
            name: Deno.env.get('BREVO_SENDER_NAME') || 'Petrolord',
          },
          to: [{ email: to }], subject, htmlContent: html,
          ...(attachments?.length
            ? { attachment: attachments.map((a) => ({ name: a.filename, content: a.content })) }
            : {}),
        }),
      });
      if (res.ok) return true;
      console.warn(`${logPrefix} Brevo failed:`, await res.text());
    } catch (e) { console.warn(`${logPrefix} Brevo exception:`, (e as Error).message); }
  }

  return false;
}
