#!/usr/bin/env node
// Creates and schedules Brevo campaigns for approved email_campaign tasks
// whose slot is within the next 24 hours, at most 2 a run, oldest first.
//   node tools/ai-employees/email/execute.mjs --dry      # what it would do: no campaign, no writes
//   node tools/ai-employees/email/execute.mjs            # cron, daily
//   node tools/ai-employees/email/execute.mjs --task <uuid> [--force]
// Shadow-mode rule: only tasks a person approved in /admin/ai-employees,
// only while the employee is active, only with every placeholder filled,
// and only to the two allowed audiences. Never a second campaign for a task.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServiceEnv, createDb } from '../youtube/lib/supabase.mjs';
import { createBrevoClient } from './lib/brevo.mjs';
import { loadBrevoKey } from './lib/env.mjs';
import { SLUG, KIND, dueTasks, MAX_PER_RUN, LEAD_HOURS } from './lib/campaign.mjs';
import { runCampaignTask } from './lib/run-campaign.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };

async function main() {
  const dryRun = flag('dry') || flag('dry-run');
  const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config/audiences.json'), 'utf8'));
  const env = loadServiceEnv();
  if (!env) throw new Error('No /root/.ai-employees.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. execute.mjs only acts on tasks approved in the database.');
  const db = createDb(env);
  const employee = await db.employee(SLUG);
  if (!employee) throw new Error(`No ${SLUG} row in ai_employees.`);
  if (employee.status !== 'active') { console.log(`${SLUG} is ${employee.status}. Nothing runs until it is resumed in /admin/ai-employees.`); return; }

  let tasks = (await db.tasks(employee.id, { status: 'approved', kind: KIND }));
  if (arg('task')) tasks = tasks.filter((t) => t.id === arg('task'));
  else {
    const approved = tasks.length;
    tasks = dueTasks(tasks, { leadHours: Number(arg('lead-hours', LEAD_HOURS)), max: Number(arg('max', MAX_PER_RUN)) });
    console.log(`${approved} approved, ${tasks.length} due now.`);
  }
  if (!tasks.length) { console.log('No approved campaigns due.'); return; }

  // a dry run makes no Brevo call at all
  const brevo = dryRun ? null : createBrevoClient({ apiKey: loadBrevoKey() });
  for (const task of tasks) {
    const current = await db.employee(SLUG); // a pause stops the run
    if (current?.status !== 'active') { console.log(`${SLUG} was ${current?.status || 'removed'} mid-run. Stopping.`); return; }
    await runCampaignTask({ task, employee: current, db, brevo, config, dryRun, force: flag('force') });
  }
}

main().catch((e) => {
  console.error(`execute failed: ${e.message}`);
  process.exit(1);
});
