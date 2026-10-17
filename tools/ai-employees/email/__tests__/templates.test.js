/**
 * @jest-environment node
 */
import { renderEmail, withUtm, copyIssues, webLinks, UNSUBSCRIBE_TAG, SENDER, REPLY_TO, COMPANY_LINE } from '../lib/templates.mjs';
import { napeTasks } from '../lib/series.mjs';
import { newsletterDraft } from '../templates/newsletter.mjs';
import { onboardingDraft } from '../templates/onboarding.mjs';

const STATS = { apps: 105, modulesWord: 'Ten', courses: 80, appCourses: 73 };
const tasks = napeTasks(STATS);

test('the sender and reply-to are the owner-fixed address', () => {
  expect(SENDER).toEqual({ name: 'Petrolord', email: 'info@lordswayenergy.com' });
  expect(REPLY_TO).toBe('info@lordswayenergy.com');
  for (const t of tasks) {
    expect(t.payload.sender).toEqual(SENDER);
    expect(t.payload.reply_to).toBe(REPLY_TO);
  }
});

test.each(tasks.map((t) => [t.payload.key, t.payload]))('%s: unsubscribe, company line, preheader, 600 px layout', (_k, p) => {
  expect(p.html).toContain(`href="${UNSUBSCRIBE_TAG}"`);
  expect(p.text).toContain(UNSUBSCRIBE_TAG);
  expect(p.html).toContain(COMPANY_LINE);
  expect(p.text).toContain(COMPANY_LINE);
  expect(p.html).toContain('max-width:600px');
  expect(p.html).toContain(`<!--preheader-->${p.preheader.replace(/'/g, '&#39;')}<!--/preheader-->`);
  expect(p.html).not.toMatch(/<script/i);
});

test.each(tasks.map((t) => [t.payload.key, t.payload]))('%s: no em dash or other copy problem anywhere', (_k, p) => {
  for (const s of [p.subject, p.preheader, p.html, p.text, ...p.notes]) expect(s).not.toContain('\u2014');
  expect(copyIssues(`${p.subject}\n${p.preheader}\n${p.text}`)).toEqual([]);
  expect(p.copy_warnings).toEqual([]);
});

test.each(tasks.map((t) => [t.payload.key, t.payload]))('%s: every web link carries the UTM tags for its email', (key, p) => {
  const links = webLinks(p.html);
  expect(links.length).toBeGreaterThan(1);
  for (const l of links) {
    const u = new URL(l);
    expect(u.searchParams.get('utm_source')).toBe('email');
    expect(u.searchParams.get('utm_medium')).toBe('email');
    expect(u.searchParams.get('utm_campaign')).toBe(key);
  }
  for (const l of p.text.match(/https?:\/\/\S+?(?=[)\s]|$)/g) || []) expect(l).toContain(`utm_campaign=${key}`);
});

test('withUtm keeps existing parameters and leaves mailto and the unsubscribe tag alone', () => {
  expect(withUtm('https://wa.me/2349015566981?text=Hi', 'c')).toBe('https://wa.me/2349015566981?text=Hi&utm_source=email&utm_medium=email&utm_campaign=c');
  expect(withUtm('mailto:info@lordswayenergy.com', 'c')).toBe('mailto:info@lordswayenergy.com');
  expect(withUtm(UNSUBSCRIBE_TAG, 'c')).toBe(UNSUBSCRIBE_TAG);
});

test('copyIssues catches em dashes, contrasts, exclamations, hype and American spelling (negative controls)', () => {
  expect(copyIssues('A tool \u2014 for you')).toContain('em dash');
  expect(copyIssues('A workflow, not a tool')).toContain('"X, not Y" contrast');
  expect(copyIssues('Come now!')).toContain('exclamation mark');
  expect(copyIssues('A seamless platform')).toContain('hype word "seamless"');
  expect(copyIssues('Pick a color')[0]).toMatch(/American spelling/);
  expect(copyIssues('Reservoir Modelling and the organisation')).toEqual([]);
});

test('text and HTML are escaped; a placeholder stays visible as text', () => {
  const { html } = renderEmail({ subject: 'S', preheader: 'P', campaign: 'c', blocks: [{ p: 'A <b> & [BOOTH NUMBER]' }] });
  expect(html).toContain('A &lt;b&gt; &amp; [BOOTH NUMBER]');
});

test('newsletter and onboarding scaffolds use the same layout and rules', () => {
  const n = newsletterDraft({ month: '2026-12', items: [{ title: 'ZGY import', body: 'Seismolord reads ZGY.', href: 'https://petrolord.com' }], audience: ['nape-optins'], scheduledAt: '2026-12-02T08:00:00.000Z' });
  expect(n.kind).toBe('email_newsletter');
  expect(n.payload.subject).toBe('Petrolord in December 2026');
  expect(n.payload.html).toContain(UNSUBSCRIBE_TAG);
  expect(n.payload.copy_warnings).toEqual([]);
  const o = onboardingDraft({ product: 'suite', firstName: 'Ada', steps: [{ label: 'Import your wells', href: 'https://petrolord.com/dashboard' }], scheduledAt: '2026-12-02T08:00:00.000Z', recipient: 'u1' });
  expect(o.kind).toBe('email_onboarding');
  expect(webLinks(o.payload.html).every((l) => l.includes('utm_campaign=welcome-suite'))).toBe(true);
  expect(onboardingDraft({ product: 'hse', steps: [] }).payload.placeholders).toEqual(['[HSE SIGN-IN URL]']);
});
