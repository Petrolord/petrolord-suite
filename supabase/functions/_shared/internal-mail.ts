// Body handling for the internal mail functions send-email and
// send-email-via-smtp (2026-10 security sweep). Both used to be open mail
// relays: anyone could post { to, subject, html } and Petrolord's sender
// would deliver it. They now serve only other edge functions holding the
// service-role key, and both deliver through _shared/email.ts.
//
// Pure TypeScript (no Deno imports) so jest can exercise it.

import { escapeHtml } from './platform-admin.ts';

export interface InternalMail { to: string; subject: string; html: string }

const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,255}\.[a-z]{2,24}$/i;

/**
 * Turn a request body into one message, or an error string.
 * Accepts { to, subject, html } or the 'quote_created' template that
 * generate-quote sends ({ to, template, details }).
 */
export function buildInternalMail(body: Record<string, unknown> | null | undefined): InternalMail | string {
  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  if (!EMAIL_RE.test(to)) return 'A single valid recipient is required.';
  if (body?.template === 'quote_created') {
    const d = (body?.details ?? {}) as Record<string, unknown>;
    const calc = (d.calculation ?? {}) as Record<string, unknown>;
    const link = String(d.link ?? '');
    const safeLink = /^https:\/\//i.test(link) ? escapeHtml(link) : '';
    return {
      to,
      subject: `Your Petrolord quote for ${String(d.orgName ?? 'your organization').slice(0, 120)}`,
      html: `<p>Your Petrolord quote is ready.</p>`
        + `<p><strong>Organization:</strong> ${escapeHtml(d.orgName)}<br/>`
        + `<strong>Seats:</strong> ${escapeHtml(d.numUsers)}<br/>`
        + `<strong>Term:</strong> ${escapeHtml(d.term)}<br/>`
        + `<strong>Total:</strong> $${escapeHtml(calc.final)}</p>`
        + (safeLink ? `<p><a href="${safeLink}">View the quote (PDF)</a></p>` : ''),
    };
  }
  const subject = String(body?.subject ?? '').replace(/[\r\n]+/g, ' ').trim();
  const html = String(body?.html ?? '');
  if (!subject || !html) return 'subject and html are required.';
  return { to, subject: subject.slice(0, 250), html };
}
