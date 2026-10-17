// The email marketer's shared draft helpers: placeholders, the final email
// the admin preview shows and execute.mjs sends, reviewer edits, and the
// review patch for email tasks.
import { findPlaceholders, finalEmail, applyEmailEdits, emailPreview, audienceLabel, lagosLabel } from '@/lib/aiEmailDraft';
import { reviewPatch, taskPreview } from '@/lib/aiEmployees';

const html = '<html><head><title>Old [BOOTH NUMBER]</title></head><body><div><!--preheader-->Old pre<!--/preheader--></div><p>Booth [BOOTH NUMBER] at [VENUE]</p><a href="{{ unsubscribe }}">Unsubscribe</a></body></html>';
const payload = { subject: 'Find us at booth [BOOTH NUMBER]', preheader: 'Pre', html, text: 'Booth [BOOTH NUMBER]\n{{ unsubscribe }}', audience: ['nape-optins', 'nape-2026-leads:suite'], scheduled_at: '2026-10-21T08:00:00.000Z', placeholders: ['[BOOTH NUMBER]', '[VENUE]'], facts: { '[BOOTH NUMBER]': '', '[VENUE]': '' } };

test('placeholders are capitals in square brackets; Brevo tags and links are not', () => {
  expect(findPlaceholders('[BOOTH NUMBER] [VENUE] {{ unsubscribe }} [Browse](https://x) [+234 901]')).toEqual(['[BOOTH NUMBER]', '[VENUE]']);
});

test('finalEmail fills facts everywhere (escaped in HTML), syncs title and preheader, and lists what is unfilled', () => {
  expect(finalEmail(payload).unfilled).toEqual(['[BOOTH NUMBER]', '[VENUE]']);
  const f = finalEmail({ ...payload, preheader: 'New & short', facts: { '[BOOTH NUMBER]': 'B<12>', '[VENUE]': 'Eko' } });
  expect(f.unfilled).toEqual([]);
  expect(f.subject).toBe('Find us at booth B<12>');
  expect(f.html).toContain('Booth B&lt;12&gt; at Eko');
  expect(f.html).toContain('<title>Find us at booth B&lt;12&gt;</title>');
  expect(f.html).toContain('<!--preheader-->New &amp; short<!--/preheader-->');
  expect(f.text).toContain('Booth B<12>');
});

test('reviewer edits: subject, preheader, time and facts; empty or unsubscribe-less edits are refused', () => {
  expect(applyEmailEdits(payload, {})).toBeNull();
  const n = applyEmailEdits(payload, { subject: ' New subject ', scheduled_at: '2026-10-22T09:00:00+01:00', facts: { '[VENUE]': 'Eko Hotel' } });
  expect(n).toMatchObject({ subject: 'New subject', scheduled_at: '2026-10-22T08:00:00.000Z', edited_by_reviewer: true });
  expect(n.facts).toEqual({ '[BOOTH NUMBER]': '', '[VENUE]': 'Eko Hotel' });
  expect(() => applyEmailEdits(payload, { subject: '  ' })).toThrow(/cannot be empty/);
  expect(() => applyEmailEdits(payload, { html: '<p>no link</p>' })).toThrow(/unsubscribe/);
  expect(() => applyEmailEdits(payload, { scheduled_at: 'soon' })).toThrow(/not a date/);
});

test('reviewPatch on an email task stores the edited payload and the subject as title', () => {
  const task = { id: 't', kind: 'email_campaign', status: 'proposed', title: payload.subject, payload };
  const p = reviewPatch(task, { decision: 'approve', reviewerEmail: 'AyoAsaolu@lordswayenergy.com', edits: { facts: { '[BOOTH NUMBER]': 'B12' } } });
  expect(p.status).toBe('approved');
  expect(p.payload.facts['[BOOTH NUMBER]']).toBe('B12');
  expect(p.title).toBe(payload.subject);
  expect(reviewPatch(task, { decision: 'reject', reviewerEmail: 'a@b.com' }).payload).toBeUndefined();
});

test('previews: email tasks get the email preview, labels and Lagos time', () => {
  const pv = taskPreview({ kind: 'email_campaign', payload });
  expect(pv.kind).toBe('email');
  expect(pv.email.scheduledLabel).toBe('2026-10-21 09:00 Lagos (2026-10-21 08:00 UTC)');
  expect(pv.email.audience.map((a) => a.label)).toEqual([audienceLabel('nape-optins'), 'NAPE 2026 leads who chose Petrolord Suite']);
  expect(emailPreview({}).subject).toBe('(no subject)');
  expect(lagosLabel('bad')).toBeNull();
  expect(taskPreview({ kind: 'youtube_listing', payload: {} }).kind).toBe('youtube_listing');
});
