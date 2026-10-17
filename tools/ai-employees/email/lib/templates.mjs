// Email-safe rendering for the email marketer. A draft is a list of content
// blocks; renderEmail() turns it into one HTML email (600 px table layout,
// inline styles only, light background, works in Gmail and Outlook) and a
// plain-text version from the same blocks, with UTM tags on every web link.
// Pure: no file system, no network. Tested in __tests__/templates.test.js.
import { escapeHtml } from '../../../../src/lib/aiEmailDraft.js';

export const SENDER = Object.freeze({ name: 'Petrolord', email: 'info@lordswayenergy.com' });
export const REPLY_TO = 'info@lordswayenergy.com';
export const WORDMARK_URL = 'https://petrolord.com/petrolord-suite-wordmark.png'; // public/petrolord-suite-wordmark.png, 1041 x 108
export const COMPANY_LINE = 'Petrolord, a Lordsway Energy company';
export const ADDRESS_LINE = '128 City Road, London EC1V 2NX, United Kingdom · 8 The Providence Street, Lekki Phase 1, Lagos, Nigeria';
export const CONTACT_LINE = 'info@lordswayenergy.com · +234 901 556 6981';
// Brevo's template language: {{ unsubscribe }} becomes the contact's own
// unsubscribe link. Brevo refuses to send a campaign without one.
export const UNSUBSCRIBE_TAG = '{{ unsubscribe }}';
export const SIGN_OFF = 'The Petrolord team';

const C = { bg: '#eef0f3', card: '#ffffff', band: '#14231b', text: '#14231b', muted: '#4d5761', primary: '#2f6b48', accent: '#c8a24e', rule: '#d8dce1', factBg: '#f5f6f8' };
const FONT = "Arial, Helvetica, sans-serif";

/** Adds utm_source=email, utm_medium=email and utm_campaign to an http(s) link. */
export function withUtm(url, campaign) {
  const s = String(url || '');
  if (!/^https?:\/\//i.test(s) || !campaign) return s;
  const u = new URL(s);
  u.searchParams.set('utm_source', 'email');
  u.searchParams.set('utm_medium', 'email');
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}

// [label](https://...) inside a paragraph. A bare [BOOTH NUMBER] placeholder
// has no (url) after it, so it stays as text.
const LINK_RE = /\[([^\]]+)\]\(((?:https?:|mailto:|tel:)[^)\s]+)\)/g;

function inlineHtml(text, campaign) {
  let out = '';
  let last = 0;
  for (const m of String(text).matchAll(LINK_RE)) {
    out += escapeHtml(text.slice(last, m.index));
    out += `<a href="${escapeHtml(withUtm(m[2], campaign))}" style="color:${C.primary};text-decoration:underline;">${escapeHtml(m[1])}</a>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(String(text).slice(last));
}

function inlineText(text, campaign) {
  return String(text).replace(LINK_RE, (_all, label, url) => (/^(mailto|tel):/.test(url) ? label : `${label} (${withUtm(url, campaign)})`));
}

const P_STYLE = `margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${C.text};`;

function blockHtml(b, campaign) {
  if (b.h) return `<h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:24px;line-height:30px;font-weight:bold;color:${C.text};">${inlineHtml(b.h, campaign)}</h1>`;
  if (b.h2) return `<h2 style="margin:24px 0 8px 0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:bold;color:${C.primary};">${inlineHtml(b.h2, campaign)}</h2>`;
  if (b.p) return `<p style="${P_STYLE}">${inlineHtml(b.p, campaign)}</p>`;
  if (b.list) {
    const rows = b.list.map((item) => `<tr><td valign="top" width="20" style="padding:0 0 10px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${C.accent};">&#8226;</td><td valign="top" style="padding:0 0 10px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${C.text};">${inlineHtml(item, campaign)}</td></tr>`).join('');
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px 0;">${rows}</table>`;
  }
  if (b.facts) {
    const rows = b.facts.map(([k, v]) => `<tr><td valign="top" width="130" style="padding:8px 12px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;color:${C.muted};border-bottom:1px solid ${C.rule};">${escapeHtml(k)}</td><td valign="top" style="padding:8px 12px;font-family:${FONT};font-size:15px;line-height:22px;color:${C.text};border-bottom:1px solid ${C.rule};">${inlineHtml(v, campaign)}</td></tr>`).join('');
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;background-color:${C.factBg};border-top:3px solid ${C.accent};">${rows}</table>`;
  }
  if (b.button) {
    const href = escapeHtml(withUtm(b.button.href, campaign));
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr><td align="center" bgcolor="${C.primary}" style="border-radius:4px;"><a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;">${escapeHtml(b.button.label)}</a></td></tr></table>`;
  }
  if (b.sign) return `<p style="${P_STYLE}margin-top:8px;">${escapeHtml(SIGN_OFF)}</p>`;
  throw new Error(`Unknown block ${JSON.stringify(b).slice(0, 80)}`);
}

function blockText(b, campaign) {
  if (b.h) return `${inlineText(b.h, campaign)}\n`;
  if (b.h2) return `\n${inlineText(b.h2, campaign)}\n`;
  if (b.p) return `${inlineText(b.p, campaign)}\n`;
  if (b.list) return `${b.list.map((i) => `* ${inlineText(i, campaign)}`).join('\n')}\n`;
  if (b.facts) return `${b.facts.map(([k, v]) => `${k}: ${inlineText(v, campaign)}`).join('\n')}\n`;
  if (b.button) return `${b.button.label}: ${withUtm(b.button.href, campaign)}\n`;
  if (b.sign) return `${SIGN_OFF}\n`;
  throw new Error('Unknown block');
}

/**
 * { html, text } for a draft. reason is the "why you are getting this" line
 * at the foot; campaign is the utm_campaign value (e.g. nape2026-1).
 */
export function renderEmail({ subject, preheader, blocks, campaign, reason }) {
  if (!subject || !blocks?.length) throw new Error('A draft needs a subject and content.');
  const body = blocks.map((b) => blockHtml(b, campaign)).join('\n');
  const home = escapeHtml(withUtm('https://petrolord.com', campaign));
  const foot = (s) => `<p style="margin:0 0 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">${s}</p>`;
  const html = `<!DOCTYPE html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;"><!--preheader-->${escapeHtml(preheader || '')}<!--/preheader--></div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.bg};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:${C.card};">
<tr><td style="padding:20px 32px;background-color:${C.band};"><a href="${home}" style="text-decoration:none;"><img src="${WORDMARK_URL}" width="240" height="25" alt="Petrolord" style="display:block;border:0;outline:none;width:240px;height:auto;font-family:${FONT};font-size:22px;font-weight:bold;color:${C.accent};"></a></td></tr>
<tr><td style="padding:32px 32px 16px 32px;">
${body}
</td></tr>
<tr><td style="padding:20px 32px 28px 32px;border-top:1px solid ${C.rule};">
${reason ? foot(escapeHtml(reason)) : ''}
${foot(`<strong>${escapeHtml(COMPANY_LINE)}</strong>`)}
${foot(escapeHtml(ADDRESS_LINE))}
${foot(`<a href="mailto:info@lordswayenergy.com" style="color:${C.muted};">info@lordswayenergy.com</a> · +234 901 556 6981`)}
${foot(`<a href="${UNSUBSCRIBE_TAG}" style="color:${C.muted};text-decoration:underline;">Unsubscribe</a> from Petrolord emails at any time.`)}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
  const text = [
    ...blocks.map((b) => blockText(b, campaign)),
    '----------',
    reason || null,
    COMPANY_LINE,
    ADDRESS_LINE,
    CONTACT_LINE,
    `Unsubscribe: ${UNSUBSCRIBE_TAG}`,
  ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
  return { html, text: `${text}\n` };
}

// Copy rules (docs/ai-employees/brand-voice.md): no em dashes, no spaced en
// dash or double hyphen used as a dash, no "X, not Y" contrast, no
// exclamation marks, no hype words, British spelling.
const HYPE = ['revolutionary', 'game-changing', 'cutting-edge', 'seamless', 'unlock', 'supercharge', 'effortless', 'world-class', 'leverage', 'the best', 'the only', 'industry standard'];
const AMERICAN = { color: 'colour', center: 'centre', organization: 'organisation', modeling: 'modelling', license: 'licence (noun)', catalog: 'catalogue', favorite: 'favourite', analyze: 'analyse' };

/** Copy problems in user-facing text, for the reviewer and the tests. */
export function copyIssues(text) {
  const s = String(text || '');
  const issues = [];
  if (s.includes('\u2014')) issues.push('em dash');
  if (/\s\u2013\s/.test(s)) issues.push('spaced en dash used as a dash');
  if (/\s--\s/.test(s)) issues.push('double hyphen used as a dash');
  if (/,\s+not\s+(a|an|the|just)\b/i.test(s)) issues.push('"X, not Y" contrast');
  if (/!/.test(s.replace(/<!--[\s\S]*?-->|<!DOCTYPE/gi, ''))) issues.push('exclamation mark');
  for (const w of HYPE) if (new RegExp(`\\b${w}\\b`, 'i').test(s)) issues.push(`hype word "${w}"`);
  for (const [us, uk] of Object.entries(AMERICAN)) if (new RegExp(`\\b${us}\\b`, 'i').test(s)) issues.push(`American spelling "${us}" (use ${uk})`);
  return issues;
}

/** Every href in the HTML, except the unsubscribe tag and mailto/tel. */
export function webLinks(html) {
  return [...String(html).matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')).filter((h) => /^https?:/i.test(h));
}
