#!/usr/bin/env node
// Copies consenting NAPE 2026 leads that gave an email (event_leads) into the
// Brevo lists "NAPE 2026 leads" and "NAPE 2026 leads: <interest>".
//   node tools/ai-employees/email/sync-leads.mjs --dry    # reads event_leads, prints masked emails and lists; no Brevo call
//   node tools/ai-employees/email/sync-leads.mjs          # upsert into Brevo (idempotent)
// Reads with the service role from /root/.ai-employees.env. Never writes to
// the database. A contact who unsubscribed in Brevo stays unsubscribed.
import { loadServiceEnv, createDb } from '../youtube/lib/supabase.mjs';
import { createBrevoClient } from './lib/brevo.mjs';
import { loadBrevoKey, fetchLeads } from './lib/env.mjs';
import { LEADS_QUERY } from './lib/leads.mjs';
import { syncLeads } from './lib/sync.mjs';
import { SLUG } from './lib/campaign.mjs';

const dry = process.argv.includes('--dry') || process.argv.includes('--dry-run');

async function main() {
  const env = loadServiceEnv();
  if (!env) throw new Error('No /root/.ai-employees.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const db = createDb(env);
  const employee = await db.employee(SLUG);
  if (!dry && employee?.status !== 'active') throw new Error(`${SLUG} is ${employee?.status || 'missing'}. Nothing is synced while it is not active.`);
  const rows = await fetchLeads(env, LEADS_QUERY);
  const brevo = dry ? null : createBrevoClient({ apiKey: loadBrevoKey() });
  const summary = await syncLeads({ rows, brevo, dry });
  if (!dry && employee) await db.logAction({ employee_id: employee.id, action: 'leads_synced', detail: { contacts: summary.contacts, upserted: summary.upserted, removed: summary.removed, lists_created: summary.lists_created } });
}

main().catch((e) => {
  console.error(`sync-leads failed: ${e.message}`);
  process.exit(1);
});
