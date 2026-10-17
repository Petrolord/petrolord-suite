// AI email marketer (owner approved 2026-10-17). Pure helpers shared by the
// admin page (/admin/ai-employees) and the worker (tools/ai-employees/email):
// the email task kinds, reviewer placeholders such as [BOOTH NUMBER], and the
// final subject, preheader, HTML and text an approved draft is sent with.
// The admin preview and execute.mjs both call finalEmail(), so what the
// reviewer sees is what Brevo receives. No imports, no Supabase, no React.

export const EMAIL_KINDS = Object.freeze(['email_campaign', 'email_newsletter', 'email_onboarding']);
export const isEmailKind = (kind) => EMAIL_KINDS.includes(kind);

export const EMAIL_LIMITS = Object.freeze({ subject: 150, preheader: 200, html: 200000, text: 50000 });

// A fact the drafter could not find in the repo: capitals in square brackets,
// e.g. [BOOTH NUMBER]. Brevo's own tags use braces ({{ unsubscribe }}), so
// they never match.
const PLACEHOLDER_RE = /\[[A-Z][A-Z0-9 ,.'&/()-]{2,60}\]/g;

export function findPlaceholders(...texts) {
  const found = new Set();
  for (const t of texts) for (const m of String(t || '').match(PLACEHOLDER_RE) || []) found.add(m);
  return [...found];
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fill(text, facts, { html = false } = {}) {
  let out = String(text || '');
  for (const [ph, value] of Object.entries(facts || {})) {
    const v = String(value ?? '').trim();
    if (!v) continue;
    out = out.split(ph).join(html ? escapeHtml(v) : v);
  }
  return out;
}

// The layout marks the hidden preheader and the <title>, so an edited
// subject or preheader is carried into the HTML without re-rendering it.
const PREHEADER_RE = /<!--preheader-->[\s\S]*?<!--\/preheader-->/;
const TITLE_RE = /<title>[\s\S]*?<\/title>/;

/**
 * The email as it will be sent: the reviewer's facts filled in everywhere,
 * the subject and preheader synced into the HTML, and the placeholders
 * still unfilled (execute.mjs refuses to send while any remain).
 */
export function finalEmail(payload = {}) {
  const p = payload || {};
  const facts = p.facts || {};
  const subject = fill(p.subject, facts).trim();
  const preheader = fill(p.preheader, facts).trim();
  let html = fill(p.html, facts, { html: true });
  html = html.replace(PREHEADER_RE, `<!--preheader-->${escapeHtml(preheader)}<!--/preheader-->`);
  html = html.replace(TITLE_RE, `<title>${escapeHtml(subject)}</title>`);
  const text = fill(p.text, facts);
  return { subject, preheader, html, text, unfilled: findPlaceholders(subject, preheader, html, text) };
}

const AUDIENCE_LABELS = {
  'nape-optins': 'Brevo list: people who opted in at the last NAPE exhibition',
  'nape-2026-leads': 'NAPE 2026 leads with consent and an email (all interests)',
};
const INTEREST_LABELS = { suite: 'Petrolord Suite', nextgen: 'NextGen Academy', hse: 'Petrolord HSE', consulting: 'Consulting', other: 'Something else' };

/** "nape-2026-leads:suite" -> "NAPE 2026 leads who chose Petrolord Suite". */
export function audienceLabel(key) {
  const k = String(key || '');
  if (AUDIENCE_LABELS[k]) return AUDIENCE_LABELS[k];
  const m = k.match(/^nape-2026-leads:([a-z]+)$/);
  if (m) return `NAPE 2026 leads who chose ${INTEREST_LABELS[m[1]] || m[1]}`;
  return k;
}

function fmtUtc(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** Lagos is UTC+1 all year (no daylight saving). */
export function lagosLabel(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  return `${new Date(d.getTime() + 3600e3).toISOString().slice(0, 16).replace('T', ' ')} Lagos`;
}

/** An email task's payload normalised for the admin page. */
export function emailPreview(payload = {}) {
  const p = payload || {};
  const f = finalEmail(p);
  const audience = Array.isArray(p.audience) ? p.audience : p.audience ? [p.audience] : [];
  return {
    subject: f.subject || '(no subject)',
    preheader: f.preheader,
    html: f.html,
    text: f.text,
    audience: audience.map((a) => ({ key: a, label: audienceLabel(a) })),
    scheduledAt: p.scheduled_at || null,
    scheduledLabel: p.scheduled_at ? `${lagosLabel(p.scheduled_at)} (${fmtUtc(p.scheduled_at)})` : 'Not scheduled',
    sender: p.sender ? `${p.sender.name} <${p.sender.email}>` : null,
    replyTo: p.reply_to || null,
    placeholders: Array.isArray(p.placeholders) ? p.placeholders : findPlaceholders(p.subject, p.preheader, p.html, p.text),
    facts: p.facts || {},
    unfilled: f.unfilled,
    notes: Array.isArray(p.notes) ? p.notes : p.notes ? [String(p.notes)] : [],
    utmCampaign: p.utm_campaign || null,
  };
}

/**
 * Reviewer edits to an email draft: subject, preheader, scheduled time,
 * the facts for the placeholders, and (rarely) the raw HTML or text.
 * Returns the new payload, or null when nothing changed. Throws on an
 * edit that is not allowed, so the page never writes one.
 */
export function applyEmailEdits(payload = {}, edits = {}) {
  const next = { ...(payload || {}) };
  let changed = false;
  const setText = (field, limit, label) => {
    if (typeof edits[field] !== 'string') return;
    const v = field === 'html' || field === 'text' ? edits[field].replace(/\s+$/, '') : edits[field].trim();
    if (!v) throw new Error(`The ${label} cannot be empty.`);
    if (v.length > limit) throw new Error(`The ${label} is at most ${limit} characters.`);
    if (v !== next[field]) { next[field] = v; changed = true; }
  };
  setText('subject', EMAIL_LIMITS.subject, 'subject');
  setText('preheader', EMAIL_LIMITS.preheader, 'preheader');
  setText('html', EMAIL_LIMITS.html, 'HTML');
  setText('text', EMAIL_LIMITS.text, 'text version');
  if (typeof edits.html === 'string' && !/\{\{\s*unsubscribe\s*\}\}/.test(next.html || '')) {
    throw new Error('The HTML must keep the {{ unsubscribe }} link.');
  }
  if (typeof edits.scheduled_at === 'string' && edits.scheduled_at) {
    const t = Date.parse(edits.scheduled_at);
    if (!Number.isFinite(t)) throw new Error('The scheduled time is not a date.');
    const iso = new Date(t).toISOString();
    if (iso !== next.scheduled_at) { next.scheduled_at = iso; changed = true; }
  }
  if (edits.facts && typeof edits.facts === 'object') {
    const facts = { ...(next.facts || {}) };
    for (const [k, v] of Object.entries(edits.facts)) {
      const val = String(v ?? '').trim();
      if ((facts[k] || '') !== val) { facts[k] = val; changed = true; }
    }
    next.facts = facts;
  }
  if (!changed) return null;
  next.edited_by_reviewer = true;
  return next;
}
