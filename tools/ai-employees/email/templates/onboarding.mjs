// Scaffolding for job (c), welcome and guidance emails for people newly added
// to or subscribed to the Suite, HSE or NextGen (owner decision 2026-10-17).
// No automation and no trigger yet: the design (triggers, consent basis,
// frequency caps) is docs/ai-employees/email-marketer-PLAN.md. This shapes
// one email_onboarding draft from a person's product and starter steps; the
// Suite's steps come from the Guided Journey starter packs
// (src/lib/journey/disciplines.js, STARTER_PACKS).
import { renderEmail, copyIssues } from '../lib/templates.mjs';
import { findPlaceholders } from '../../../../src/lib/aiEmailDraft.js';

export const KIND = 'email_onboarding';
export const PRODUCTS = Object.freeze({
  suite: { name: 'Petrolord Suite', url: 'https://petrolord.com/dashboard' },
  hse: { name: 'Petrolord HSE', url: '[HSE SIGN-IN URL]' },
  nextgen: { name: 'NextGen Academy', url: 'https://nextgen.petrolord.com' },
});
export const REASON = 'You are receiving this email because an account was opened for you. It is a service email about your account.';

/** steps: [{ label, href? }] for the person's discipline; firstName optional. */
export function onboardingDraft({ product, firstName, steps, scheduledAt, recipient }) {
  const prod = PRODUCTS[product];
  if (!prod) throw new Error(`Unknown product ${product}`);
  const campaign = `welcome-${product}`;
  const subject = `Welcome to ${prod.name}: where to start`;
  const preheader = `Your first ${Math.min(steps?.length || 0, 3) || 'few'} steps in ${prod.name}, and where to find help.`;
  const blocks = [
    { h: `Welcome to ${prod.name}${firstName ? `, ${firstName}` : ''}` },
    { p: 'Here is where to start. Each step takes you straight to the right place.' },
    { list: (steps || []).slice(0, 5).map((s) => (s.href ? `[${s.label}](${s.href})` : s.label)) },
    { button: { label: `Open ${prod.name}`, href: prod.url } },
    { p: 'Questions? Reply to this email and the team will help.' },
    { sign: true },
  ];
  const { html, text } = renderEmail({ subject, preheader, blocks, campaign, reason: REASON });
  const placeholders = findPlaceholders(subject, preheader, html, text);
  return {
    kind: KIND,
    title: subject,
    status: 'proposed',
    payload: { series: 'onboarding', key: `${campaign}-${recipient || 'preview'}`, product, recipient: recipient || null, subject, preheader, html, text, audience: [], scheduled_at: scheduledAt, utm_campaign: campaign, placeholders, facts: Object.fromEntries(placeholders.map((p) => [p, ''])), notes: ['Scaffold only: onboarding emails have no trigger or send path yet (see email-marketer-PLAN.md).'], copy_warnings: copyIssues(text) },
  };
}
