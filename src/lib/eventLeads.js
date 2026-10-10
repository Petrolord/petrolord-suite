// Event leads (NAPE booth, 2026-10): the short form a visitor fills after
// scanning the booth QR code, then the hand-over to the Petrolord WhatsApp
// Business line. Pure helpers: validation, Nigerian phone numbers, the
// WhatsApp link, and an offline queue so a lead typed on patchy expo Wi-Fi is
// saved on the next visit instead of lost.

export const EVENT = 'NAPE 2026';
export const WHATSAPP_NUMBER = '2349015566981'; // +234 901 556 6981, WhatsApp Business
export const INTERESTS = Object.freeze([
  { key: 'suite', label: 'Petrolord Suite' },
  { key: 'nextgen', label: 'NextGen Academy' },
  { key: 'hse', label: 'Petrolord HSE' },
  { key: 'consulting', label: 'Consulting' },
  { key: 'other', label: 'Something else' },
]);
export const CONSENT_TEXT = 'Petrolord and Lordsway Energy may contact me by phone, WhatsApp or email about the products I chose. I can ask for my details to be deleted at any time.';
// The booth quiz (the Petrolord Upstream Challenge, src/pages/events/NapeQuiz.jsx).
export const QUIZ_URL = '/nape/quiz';
export const QUEUE_KEY = 'pl.eventLeads.queue';
export const LIMITS = Object.freeze({ name: 120, company: 160, role: 120, email: 200, note: 1000 });

/**
 * A phone number in E.164 digits (no plus), or null. Nigerian numbers are
 * accepted as 0XXXXXXXXXX, 234XXXXXXXXXX or +234 XXX XXX XXXX; other
 * countries need their + and country code.
 */
export function normalisePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const plus = s.startsWith('+');
  const d = s.replace(/[^\d]/g, '');
  if (!d) return null;
  // Nigeria: 11 digits starting 0, or 13 starting 234; mobile prefixes 7, 8, 9
  if (!plus && d.length === 11 && d.startsWith('0')) return /^0[789]\d{9}$/.test(d) ? `234${d.slice(1)}` : null;
  if (d.startsWith('234')) return /^234[789]\d{9}$/.test(d) ? d : null;
  if (plus && d.length >= 8 && d.length <= 15 && !d.startsWith('0')) return d;
  return null;
}

/** Field problems as {field: message}; empty when the lead can be saved. */
export function validateLead(f) {
  const e = {};
  if (!String(f.name || '').trim()) e.name = 'Please give your name.';
  else if (f.name.trim().length > LIMITS.name) e.name = 'That name is too long.';
  if (!normalisePhone(f.phone)) e.phone = 'Please give a phone number we can reach, for example 0803 123 4567.';
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'That email address does not look right.';
  for (const k of ['company', 'role', 'email', 'note']) if (f[k] && String(f[k]).length > LIMITS[k]) e[k] = 'That is too long.';
  if (!f.consent) e.consent = 'Please tick the box so we can follow up with you.';
  return e;
}

/** The row stored in event_leads. */
export function toRow(f, { source = 'qr', userAgent = '' } = {}) {
  const clean = (v, n) => (String(v || '').trim().slice(0, n) || null);
  return {
    event: EVENT,
    name: clean(f.name, LIMITS.name),
    phone: normalisePhone(f.phone),
    email: clean(f.email, LIMITS.email),
    company: clean(f.company, LIMITS.company),
    role: clean(f.role, LIMITS.role),
    interests: (f.interests || []).filter((k) => INTERESTS.some((i) => i.key === k)),
    note: clean(f.note, LIMITS.note),
    consent: !!f.consent,
    consent_text: CONSENT_TEXT,
    source: ['qr', 'tablet'].includes(source) ? source : 'qr',
    user_agent: String(userAgent || '').slice(0, 300) || null,
  };
}

/** The wa.me link with a greeting that names the visitor and what they want to talk about. */
export function whatsappUrl(f, number = WHATSAPP_NUMBER) {
  const name = String(f.name || '').trim();
  const picked = INTERESTS.filter((i) => (f.interests || []).includes(i.key)).map((i) => i.label);
  const about = picked.length ? ` I would like to talk about ${picked.length > 1 ? `${picked.slice(0, -1).join(', ')} and ${picked[picked.length - 1]}` : picked[0]}.` : '';
  const text = `Hello Petrolord, ${name ? `this is ${name}. ` : ''}I visited your booth at ${EVENT}.${about}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

const readQueue = (storage) => {
  try { const q = JSON.parse(storage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; }
};
const writeQueue = (storage, q) => {
  try { if (q.length) storage.setItem(QUEUE_KEY, JSON.stringify(q)); else storage.removeItem(QUEUE_KEY); } catch { /* storage blocked */ }
};

/** Keep a row that could not be saved, to try again later. */
export function queueLead(storage, row) {
  const q = readQueue(storage);
  q.push({ row, queuedAt: new Date().toISOString() });
  writeQueue(storage, q.slice(-20));
}

/**
 * Send every queued row with `insert(row)` (resolving {error}); rows that
 * fail stay queued. Returns how many were sent and how many remain.
 */
export async function flushQueue(storage, insert) {
  const q = readQueue(storage);
  if (!q.length) return { sent: 0, left: 0 };
  const left = [];
  let sent = 0;
  for (const item of q) {
    try {
      const { error } = await insert(item.row);
      if (error) left.push(item); else sent += 1;
    } catch { left.push(item); }
  }
  writeQueue(storage, left);
  return { sent, left: left.length };
}

/** Save a lead now, or queue it if the network or the table is not there. */
export async function saveLead(storage, insert, row) {
  try {
    const { error } = await insert(row);
    if (!error) return { saved: true };
    queueLead(storage, row);
    return { saved: false, queued: true, error: error.message };
  } catch (e) {
    queueLead(storage, row);
    return { saved: false, queued: true, error: e.message };
  }
}

/** CSV of lead rows for staff (header row, quoted cells). */
export function leadsCsv(rows) {
  const cols = ['created_at', 'event', 'name', 'phone', 'email', 'company', 'role', 'interests', 'note', 'source', 'consent'];
  const cell = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}
