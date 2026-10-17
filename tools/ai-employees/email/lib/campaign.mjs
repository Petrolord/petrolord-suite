// Pure logic for the email marketer: turning a draft into an email_campaign
// task payload, the audience rules, the shadow-mode gate execute.mjs obeys,
// the due window, and the Brevo campaign body. No file system or network.
import { finalEmail, findPlaceholders } from '../../../../src/lib/aiEmailDraft.js';
import { renderEmail, copyIssues, SENDER, REPLY_TO } from './templates.mjs';

export const SLUG = 'email-marketer';
export const KIND = 'email_campaign';
export const MAX_PER_RUN = 2; // never more than two campaigns created in one run
export const LEAD_HOURS = 24; // create and schedule in Brevo up to a day ahead of the slot
export const STALE_HOURS = 48; // a slot more than two days gone is not sent late; a person reschedules it
export const LATE_DELAY_MIN = 15; // a slot just missed is scheduled this far ahead instead

// The only two audiences the owner allowed (2026-10-17). Anything else is refused.
export const LEADS_LIST_NAME = 'NAPE 2026 leads';
export const LEAD_INTERESTS = Object.freeze(['suite', 'nextgen', 'hse', 'consulting', 'other']);
export const interestListName = (k) => `${LEADS_LIST_NAME}: ${k}`;

export function isAllowedAudience(key) {
  const k = String(key || '');
  if (k === 'nape-optins' || k === 'nape-2026-leads') return true;
  const m = k.match(/^nape-2026-leads:([a-z]+)$/);
  return Boolean(m && LEAD_INTERESTS.includes(m[1]));
}

/** An email_campaign task payload for one series draft. */
export function buildCampaignPayload(draft, { series, scheduledAt, reason }) {
  const campaign = `${series}-${draft.n}`;
  const { html, text } = renderEmail({ subject: draft.subject, preheader: draft.preheader, blocks: draft.blocks, campaign, reason });
  const placeholders = findPlaceholders(draft.subject, draft.preheader, html, text);
  const warnings = [...new Set([...copyIssues(draft.subject), ...copyIssues(draft.preheader), ...copyIssues(text)])];
  for (const a of draft.audience) if (!isAllowedAudience(a)) throw new Error(`Audience ${a} is not one of the two the owner allowed.`);
  return {
    series,
    n: draft.n,
    key: campaign,
    subject: draft.subject,
    preheader: draft.preheader,
    html,
    text,
    audience: draft.audience,
    scheduled_at: scheduledAt,
    timezone: 'Africa/Lagos',
    sender: { ...SENDER },
    reply_to: REPLY_TO,
    utm_campaign: campaign,
    placeholders,
    facts: Object.fromEntries(placeholders.map((p) => [p, ''])),
    notes: [...(draft.notes || []), ...(placeholders.length ? [`Placeholders to fill: ${placeholders.join(', ')}`] : [])],
    copy_warnings: warnings,
  };
}

/**
 * Why execute.mjs must not act on this task, or null when it may.
 * The shadow-mode rule: an active employee, an approved task with a
 * reviewer on record, the right kind, every placeholder filled, the
 * unsubscribe link present, and only the allowed audiences.
 */
export function executeBlocker({ task, employee, now = Date.now() }) {
  if (!employee) return 'employee not found';
  if (employee.status !== 'active') return `employee is ${employee.status}`;
  if (!task) return 'no task';
  if (task.status !== 'approved') return `task is ${task.status}, only approved tasks run`;
  if (!task.reviewer_email || !task.reviewed_at) return 'task has no reviewer on record';
  if (task.kind !== KIND) return `kind ${task.kind} is not sent by execute.mjs`;
  if (task.result?.brevo_campaign_id) return `campaign ${task.result.brevo_campaign_id} already exists for this task`;
  const p = task.payload || {};
  const f = finalEmail(p);
  if (!f.subject || !f.html) return 'the draft has no subject or HTML';
  if (f.unfilled.length) return `placeholders not filled: ${f.unfilled.join(', ')}`;
  if (!/\{\{\s*unsubscribe\s*\}\}/.test(f.html)) return 'the HTML has no {{ unsubscribe }} link';
  const audience = Array.isArray(p.audience) ? p.audience : [];
  if (!audience.length) return 'no audience';
  const bad = audience.filter((a) => !isAllowedAudience(a));
  if (bad.length) return `audience not allowed: ${bad.join(', ')}`;
  const slot = Date.parse(p.scheduled_at || '');
  if (!Number.isFinite(slot)) return 'no scheduled time';
  if (slot < now - STALE_HOURS * 3600e3) return `the slot ${p.scheduled_at} passed more than ${STALE_HOURS} h ago; edit the time and approve again`;
  return null;
}

/** Approved tasks whose slot is within leadHours, oldest first, at most max. */
export function dueTasks(tasks, { now = Date.now(), leadHours = LEAD_HOURS, max = MAX_PER_RUN } = {}) {
  const slot = (t) => Date.parse(t?.payload?.scheduled_at || '');
  return (tasks || [])
    .filter((t) => Number.isFinite(slot(t)) && slot(t) <= now + leadHours * 3600e3)
    .sort((a, b) => slot(a) - slot(b))
    .slice(0, max);
}

/** The Brevo scheduledAt: the slot, or a few minutes from now if it has just passed. */
export function sendTime(scheduledAt, now = Date.now()) {
  const slot = Date.parse(scheduledAt);
  const t = slot > now + 60e3 ? slot : now + LATE_DELAY_MIN * 60e3;
  return new Date(Math.ceil(t / 60e3) * 60e3).toISOString();
}

/**
 * Brevo list ids for the symbolic audience. config: { 'nape-optins':
 * { list_ids: [..] } } from config/audiences.json; lists: [{id, name}] from
 * the Brevo account. Throws, naming what is missing, rather than guess.
 */
export function resolveAudience(audience, { config, lists }) {
  const ids = new Set();
  const byName = new Map((lists || []).map((l) => [l.name, l.id]));
  for (const a of audience || []) {
    if (!isAllowedAudience(a)) throw new Error(`Audience ${a} is not allowed.`);
    if (a === 'nape-optins') {
      const cfg = (config?.['nape-optins']?.list_ids || []).filter((n) => Number.isInteger(n));
      if (!cfg.length) throw new Error('nape-optins has no Brevo list id. Put the NAPE opt-in list id(s) in tools/ai-employees/email/config/audiences.json.');
      cfg.forEach((n) => ids.add(n));
    } else {
      const interest = a.split(':')[1];
      const name = interest ? interestListName(interest) : LEADS_LIST_NAME;
      const id = byName.get(name);
      if (!id) throw new Error(`No Brevo list "${name}". Run sync-leads.mjs first.`);
      ids.add(id);
    }
  }
  return [...ids];
}

/** The campaign name carries the task id, so a rerun finds the campaign it made. */
export const campaignName = (task) => `AI ${task.payload?.key || 'email'} task ${task.id}`;

/** The createEmailCampaign body for an approved task. */
export function campaignBody(task, { listIds, scheduledAt }) {
  const f = finalEmail(task.payload);
  // the sender is fixed by the owner (2026-10-17), whatever the payload says
  return {
    name: campaignName(task),
    subject: f.subject,
    previewText: f.preheader,
    sender: { name: SENDER.name, email: SENDER.email },
    replyTo: REPLY_TO,
    htmlContent: f.html,
    recipients: { listIds },
    scheduledAt,
    tag: task.payload?.series || 'ai-email',
  };
}
