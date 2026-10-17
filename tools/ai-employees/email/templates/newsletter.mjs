// Scaffolding for job (b), the monthly newsletter (owner decision 2026-10-17).
// No automation yet: nothing calls this on a schedule. A person or a later
// propose step passes in the month's items (from merged work, STATUS docs and
// the YouTube queue); this shapes them into an email_newsletter draft with the
// same layout, copy rules and UTM tags as the NAPE series. Design:
// docs/ai-employees/email-marketer-PLAN.md.
import { renderEmail, copyIssues } from '../lib/templates.mjs';
import { findPlaceholders } from '../../../../src/lib/aiEmailDraft.js';

export const KIND = 'email_newsletter';
export const REASON = 'You are receiving the Petrolord newsletter because you asked Petrolord to keep in touch.';

/**
 * month: 'YYYY-MM'; items: [{ title, body, href?, linkLabel? }];
 * audience: symbolic keys (the newsletter audience is decided in the plan,
 * not here); scheduledAt: ISO.
 */
export function newsletterDraft({ month, intro, items, audience, scheduledAt }) {
  if (!/^\d{4}-\d{2}$/.test(String(month))) throw new Error('month is YYYY-MM');
  if (!items?.length) throw new Error('A newsletter needs at least one item.');
  const campaign = `newsletter-${month}`;
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const subject = `Petrolord in ${label}`;
  const preheader = items.slice(0, 3).map((i) => i.title).join(', ');
  const blocks = [{ h: `Petrolord in ${label}` }, ...(intro ? [{ p: intro }] : [])];
  for (const i of items) {
    blocks.push({ h2: i.title }, { p: i.body });
    if (i.href) blocks.push({ p: `[${i.linkLabel || 'Read more'}](${i.href})` });
  }
  blocks.push({ sign: true });
  const { html, text } = renderEmail({ subject, preheader, blocks, campaign, reason: REASON });
  const placeholders = findPlaceholders(subject, preheader, html, text);
  return {
    kind: KIND,
    title: subject,
    status: 'proposed',
    payload: { series: 'newsletter', key: campaign, subject, preheader, html, text, audience, scheduled_at: scheduledAt, timezone: 'Africa/Lagos', utm_campaign: campaign, placeholders, facts: Object.fromEntries(placeholders.map((p) => [p, ''])), notes: [], copy_warnings: copyIssues(text) },
  };
}
