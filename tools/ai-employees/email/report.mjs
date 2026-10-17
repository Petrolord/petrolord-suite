#!/usr/bin/env node
// Fetches Brevo stats for campaigns this employee scheduled and writes them
// into each task's result (opens, clicks, unsubscribes, bounces).
//   node tools/ai-employees/email/report.mjs --dry   # print, no writes
//   node tools/ai-employees/email/report.mjs         # update task results (cron, daily)
import { loadServiceEnv, createDb } from '../youtube/lib/supabase.mjs';
import { createBrevoClient } from './lib/brevo.mjs';
import { loadBrevoKey } from './lib/env.mjs';
import { SLUG, KIND } from './lib/campaign.mjs';
import { reportTasks } from './lib/report.mjs';

async function main() {
  const dry = process.argv.includes('--dry') || process.argv.includes('--dry-run');
  const env = loadServiceEnv();
  if (!env) throw new Error('No /root/.ai-employees.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const db = createDb(env);
  const employee = await db.employee(SLUG);
  if (!employee) throw new Error(`No ${SLUG} row in ai_employees.`);
  const tasks = await db.tasks(employee.id, { status: 'done', kind: KIND });
  const brevo = createBrevoClient({ apiKey: loadBrevoKey() }); // read-only calls
  await reportTasks({ tasks, db, brevo, dry });
}

main().catch((e) => {
  console.error(`report failed: ${e.message}`);
  process.exit(1);
});
