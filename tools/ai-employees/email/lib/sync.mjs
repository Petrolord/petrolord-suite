// Upsert consenting NAPE 2026 leads into Brevo: the list "NAPE 2026 leads"
// and one list per interest ("NAPE 2026 leads: suite", ...), so an email about
// one product reaches only the leads who chose it. Idempotent: lists are found
// by name before any is created, contacts are upserts, and a second run with
// the same rows changes nothing. A lead deleted from event_leads (a deletion
// request) is taken out of these lists on the next run.
import { leadContacts, listNamesFor, ALL_LEAD_LISTS, ATTRIBUTES } from './leads.mjs';

export async function syncLeads({ rows, brevo, dry = false, log = console.log }) {
  const contacts = leadContacts(rows);
  const summary = { leads: (rows || []).length, contacts: contacts.length, upserted: 0, removed: 0, lists_created: [], attributes_created: [] };
  if (dry) {
    log(`[dry run] ${contacts.length} consenting lead(s) with an email out of ${summary.leads} row(s).`);
    for (const c of contacts) log(`  ${c.email.replace(/^(.).*(@.*)$/, '$1***$2')}  lists: ${listNamesFor(c).join(' | ')}`);
    return summary;
  }
  summary.attributes_created = await brevo.ensureAttributes(ATTRIBUTES.filter((a) => a !== 'FIRSTNAME'));
  const ids = {};
  for (const name of ALL_LEAD_LISTS) {
    const r = await brevo.ensureList(name);
    ids[name] = r.id;
    if (r.created) summary.lists_created.push(name);
  }
  for (const c of contacts) {
    await brevo.upsertContact({ email: c.email, attributes: c.attributes, listIds: listNamesFor(c).map((n) => ids[n]) });
    summary.upserted += 1;
  }
  // honour deletions and changed interests: a list keeps only the leads that belong in it now
  for (const name of ALL_LEAD_LISTS) {
    const want = new Set(contacts.filter((c) => listNamesFor(c).includes(name)).map((c) => c.email));
    const extra = (await brevo.listEmails(ids[name])).filter((e) => !want.has(e));
    if (extra.length) { await brevo.removeFromList(ids[name], extra); summary.removed += extra.length; }
  }
  log(`synced ${summary.upserted} contact(s); removed ${summary.removed} from lists; lists created: ${summary.lists_created.join(', ') || 'none'}.`);
  return summary;
}
