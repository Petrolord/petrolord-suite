// NAPE 2026 leads to Brevo contacts. Only rows with consent, the consent
// text on record and an email are kept (the /nape form requires consent; the
// booth quiz collects no email). One contact per email address: the latest
// row's details win and interests are merged. Pure; tested in leads.test.js.
import { LEADS_LIST_NAME, LEAD_INTERESTS, interestListName } from './campaign.mjs';

export const ATTRIBUTES = Object.freeze(['FIRSTNAME', 'COMPANY', 'ROLE', 'INTERESTS', 'SOURCE']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The PostgREST query: consenting rows with an email, oldest first. */
export const LEADS_QUERY = 'event_leads?select=id,event,name,email,company,role,interests,consent,consent_text,source,created_at&consent=is.true&email=not.is.null&order=created_at.asc';

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export function leadContacts(rows) {
  const byEmail = new Map();
  const sorted = [...(rows || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const r of sorted) {
    if (r?.consent !== true || !String(r.consent_text || '').trim()) continue;
    const email = String(r.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    const prev = byEmail.get(email);
    const interests = [...new Set([...(prev?.interests || []), ...(r.interests || []).filter((k) => LEAD_INTERESTS.includes(k))])];
    byEmail.set(email, {
      email,
      interests,
      attributes: {
        FIRSTNAME: firstName(r.name) || prev?.attributes.FIRSTNAME || '',
        COMPANY: r.company || prev?.attributes.COMPANY || '',
        ROLE: r.role || prev?.attributes.ROLE || '',
        INTERESTS: interests.join(','),
        SOURCE: `${r.event || 'NAPE 2026'} ${r.source || 'qr'}`,
      },
    });
  }
  return [...byEmail.values()];
}

/** The Brevo list names a contact belongs in: the main list and one per interest. */
export const listNamesFor = (contact) => [LEADS_LIST_NAME, ...contact.interests.map(interestListName)];
export const ALL_LEAD_LISTS = Object.freeze([LEADS_LIST_NAME, ...LEAD_INTERESTS.map(interestListName)]);
