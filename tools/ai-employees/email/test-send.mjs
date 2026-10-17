#!/usr/bin/env node
// Sends one task's draft to the two managers only, for proofing. Run by hand:
//   node tools/ai-employees/email/test-send.mjs --task <uuid> [--to ayoasaolu@lordswayenergy.com]
//   node tools/ai-employees/email/test-send.mjs --task <uuid> --dry
// It makes (or reuses) a draft campaign named "TEST ..." with no recipients
// and calls Brevo's sendTest, which goes only to the addresses given. The
// addresses must be Brevo contacts (Brevo's rule for test sends). Any
// address other than the managers' is refused. Placeholders still unfilled
// are sent as they are, so the proof shows them.
import { loadServiceEnv, createDb } from '../youtube/lib/supabase.mjs';
import { createBrevoClient } from './lib/brevo.mjs';
import { loadBrevoKey } from './lib/env.mjs';
import { SLUG } from './lib/campaign.mjs';
import { testSend, MANAGERS } from './lib/test-send.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };

async function main() {
  const id = arg('task');
  if (!id) throw new Error('Pass --task <uuid>.');
  const to = arg('to') ? arg('to').split(',').map((s) => s.trim().toLowerCase()) : [...MANAGERS];
  const env = loadServiceEnv();
  if (!env) throw new Error('No /root/.ai-employees.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const db = createDb(env);
  const employee = await db.employee(SLUG);
  if (!employee) throw new Error(`No ${SLUG} row in ai_employees.`);
  const task = (await db.tasks(employee.id)).find((t) => t.id === id);
  if (!task) throw new Error(`No task ${id} for ${SLUG}.`);
  const dry = argv.includes('--dry') || argv.includes('--dry-run');
  const brevo = dry ? null : createBrevoClient({ apiKey: loadBrevoKey() });
  await testSend({ task, employee, db, brevo, to, dry });
}

main().catch((e) => {
  console.error(`test-send failed: ${e.message}`);
  process.exit(1);
});
