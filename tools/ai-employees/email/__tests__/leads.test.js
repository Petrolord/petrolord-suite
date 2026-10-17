/**
 * @jest-environment node
 */
import { leadContacts, listNamesFor, ALL_LEAD_LISTS } from '../lib/leads.mjs';
import { syncLeads } from '../lib/sync.mjs';

const CONSENT = 'Petrolord and Lordsway Energy may contact me by phone, WhatsApp or email about the products I chose. I can ask for my details to be deleted at any time.';
const rows = [
  { id: 1, event: 'NAPE 2026', name: 'Ada Obi', email: 'Ada@Example.ng', company: 'Breeze', role: 'Geophysicist', interests: ['suite'], consent: true, consent_text: CONSENT, source: 'qr', created_at: '2026-10-11T10:00:00Z' },
  { id: 2, event: 'NAPE 2026', name: 'Ada Obi', email: 'ada@example.ng', company: null, role: null, interests: ['nextgen', 'bogus'], consent: true, consent_text: CONSENT, source: 'tablet', created_at: '2026-10-12T10:00:00Z' },
  { id: 3, event: 'NAPE 2026', name: 'Quiz Player', email: null, interests: [], consent: true, consent_text: CONSENT, source: 'quiz', created_at: '2026-10-12T11:00:00Z' },
  { id: 4, event: 'NAPE 2026', name: 'No Consent', email: 'nc@example.ng', interests: ['hse'], consent: false, consent_text: CONSENT, source: 'qr', created_at: '2026-10-12T12:00:00Z' },
  { id: 5, event: 'NAPE 2026', name: 'No Text', email: 'nt@example.ng', interests: ['hse'], consent: true, consent_text: '', source: 'qr', created_at: '2026-10-12T12:00:00Z' },
  { id: 6, event: 'NAPE 2026', name: 'Bad Email', email: 'not-an-email', interests: [], consent: true, consent_text: CONSENT, source: 'qr', created_at: '2026-10-12T12:00:00Z' },
  { id: 7, event: 'NAPE 2026', name: 'Tunde', email: 'tunde@example.ng', interests: ['hse'], consent: true, consent_text: CONSENT, source: 'qr', created_at: '2026-10-13T12:00:00Z' },
];

test('only consenting rows with consent text and a valid email; one contact per address', () => {
  const c = leadContacts(rows);
  expect(c.map((x) => x.email)).toEqual(['ada@example.ng', 'tunde@example.ng']);
  expect(c[0].interests).toEqual(['suite', 'nextgen']); // merged; unknown interest dropped
  expect(c[0].attributes).toEqual({ FIRSTNAME: 'Ada', COMPANY: 'Breeze', ROLE: 'Geophysicist', INTERESTS: 'suite,nextgen', SOURCE: 'NAPE 2026 tablet' });
  expect(listNamesFor(c[1])).toEqual(['NAPE 2026 leads', 'NAPE 2026 leads: hse']);
});

function fakeBrevo() {
  const lists = new Map(); // name -> {id, emails:Set}
  const contacts = new Map();
  let next = 1;
  const calls = [];
  return {
    calls, lists, contacts,
    ensureAttributes: async (names) => { calls.push(['attrs', names]); return []; },
    ensureList: async (name) => {
      calls.push(['ensureList', name]);
      if (lists.has(name)) return { id: lists.get(name).id, created: false };
      lists.set(name, { id: next++, emails: new Set() });
      return { id: lists.get(name).id, created: true };
    },
    upsertContact: async ({ email, attributes, listIds }) => {
      calls.push(['upsert', email]);
      contacts.set(email, attributes);
      for (const l of lists.values()) if (listIds.includes(l.id)) l.emails.add(email);
    },
    listEmails: async (id) => [...[...lists.values()].find((l) => l.id === id).emails],
    removeFromList: async (id, emails) => { calls.push(['remove', id, emails]); const l = [...lists.values()].find((x) => x.id === id); emails.forEach((e) => l.emails.delete(e)); },
  };
}

test('sync upserts into the main and interest lists, and a second run changes nothing', async () => {
  const b = fakeBrevo();
  const first = await syncLeads({ rows, brevo: b, log: () => {} });
  expect(first.upserted).toBe(2);
  expect(first.lists_created).toEqual(ALL_LEAD_LISTS);
  expect([...b.lists.get('NAPE 2026 leads').emails].sort()).toEqual(['ada@example.ng', 'tunde@example.ng']);
  expect([...b.lists.get('NAPE 2026 leads: suite').emails]).toEqual(['ada@example.ng']);
  expect([...b.lists.get('NAPE 2026 leads: hse').emails]).toEqual(['tunde@example.ng']);
  expect(b.contacts.has('nc@example.ng')).toBe(false);

  const snapshot = JSON.stringify([...b.lists].map(([k, v]) => [k, v.id, [...v.emails].sort()]));
  const second = await syncLeads({ rows, brevo: b, log: () => {} });
  expect(second.lists_created).toEqual([]);
  expect(second.removed).toBe(0);
  expect(JSON.stringify([...b.lists].map(([k, v]) => [k, v.id, [...v.emails].sort()]))).toBe(snapshot);
  expect(b.contacts.size).toBe(2);
});

test('a deleted lead is taken out of the lists on the next run', async () => {
  const b = fakeBrevo();
  await syncLeads({ rows, brevo: b, log: () => {} });
  const r = await syncLeads({ rows: rows.filter((x) => x.id !== 7), brevo: b, log: () => {} });
  expect(r.removed).toBe(2); // main list and the hse list
  expect(b.lists.get('NAPE 2026 leads').emails.has('tunde@example.ng')).toBe(false);
});

test('a dry run calls nothing on Brevo and masks emails', async () => {
  const lines = [];
  const r = await syncLeads({ rows, brevo: null, dry: true, log: (l) => lines.push(l) });
  expect(r.contacts).toBe(2);
  expect(lines.join('\n')).not.toContain('ada@example.ng');
  expect(lines.join('\n')).toContain('a***@example.ng');
});
