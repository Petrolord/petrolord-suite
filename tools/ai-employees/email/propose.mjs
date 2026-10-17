#!/usr/bin/env node
// Drafts the NAPE 2026 email series (four emails) as email_campaign tasks for
// review at /admin/ai-employees. Nothing is sent: execute.mjs acts only on
// tasks a person approved.
//   node tools/ai-employees/email/propose.mjs --dry               # JSON + HTML previews, no database
//   node tools/ai-employees/email/propose.mjs --db                # queue the drafts for review
//   options: --only 1,3   --out <file.json>   --preview-dir <dir>
// Skips drafts whose key (nape2026-<n>) already has a proposed, approved or
// done task, so a rerun never queues a second copy.
import fs from 'node:fs';
import path from 'node:path';
import { suiteStats, NEXTGEN_LIVE_COURSES, NEXTGEN_APP_COURSES } from '../../../src/data/suiteCatalog.js';
import { finalEmail } from '../../../src/lib/aiEmailDraft.js';
import { napeTasks } from './lib/series.mjs';
import { SLUG } from './lib/campaign.mjs';
import { loadServiceEnv, createDb } from '../youtube/lib/supabase.mjs';

const DEFAULT_OUT = '/root/ai-employees/email-proposals.json';
const DEFAULT_PREVIEW = '/root/ai-employees/email-preview';
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };

function writePreviews(dir, tasks) {
  fs.mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const t of tasks) {
    const p = t.payload;
    const f = finalEmail(p);
    fs.writeFileSync(path.join(dir, `${p.key}.html`), f.html);
    fs.writeFileSync(path.join(dir, `${p.key}.txt`), `Subject: ${f.subject}\nPreheader: ${f.preheader}\n\n${f.text}`);
    rows.push(`<tr><td>${p.key}</td><td>${p.scheduled_at.slice(0, 10)} 09:00 Lagos</td><td><a href="${p.key}.html">${f.subject.replace(/</g, '&lt;')}</a></td><td>${p.audience.join(' + ')}</td><td>${p.placeholders.join(', ') || 'none'}</td></tr>`);
  }
  fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>Email drafts</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#14231b}td,th{border:1px solid #c3c9d0;padding:6px 10px;text-align:left;vertical-align:top}table{border-collapse:collapse}</style></head><body><h1>NAPE 2026 email drafts (not sent)</h1><table><tr><th>Key</th><th>Send</th><th>Subject</th><th>Audience</th><th>Placeholders</th></tr>${rows.join('')}</table></body></html>\n`);
}

async function main() {
  const s = suiteStats();
  const stats = { apps: s.apps, modulesWord: s.modulesWord, courses: NEXTGEN_LIVE_COURSES, appCourses: NEXTGEN_APP_COURSES };
  const only = arg('only') ? arg('only').split(',').map(Number) : undefined;
  const drafts = napeTasks(stats, { only });

  const useDb = flag('db');
  if (useDb && flag('dry')) throw new Error('Choose --dry or --db.');
  let db = null; let employee = null; let existing = [];
  const outFile = arg('out', DEFAULT_OUT);
  let local = { employee: SLUG, tasks: [] };
  if (useDb) {
    const env = loadServiceEnv();
    if (!env) throw new Error('No /root/.ai-employees.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Run with --dry to write local files.');
    db = createDb(env);
    employee = await db.employee(SLUG);
    if (!employee) throw new Error(`No ${SLUG} row in ai_employees. Has the 20261017120000 migration been applied?`);
    if (employee.status !== 'active') throw new Error(`${SLUG} is ${employee.status}. Nothing is proposed while it is not active.`);
    existing = await db.tasks(employee.id, { kind: 'email_campaign' });
  } else if (fs.existsSync(outFile) && !flag('fresh')) {
    local = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    existing = local.tasks || [];
  }
  const taken = new Set(existing.filter((t) => ['proposed', 'approved', 'done'].includes(t.status)).map((t) => t.payload?.key));

  let n = 0;
  for (const row of drafts) {
    const p = row.payload;
    if (taken.has(p.key)) { console.log(`skip ${p.key}: already proposed, approved or done`); continue; }
    if (useDb) {
      const task = await db.insertTask({ ...row, employee_id: employee.id });
      await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'proposal_created', detail: { kind: row.kind, key: p.key, scheduled_at: p.scheduled_at, placeholders: p.placeholders, warnings: p.copy_warnings } });
    } else {
      local.tasks.push({ ...row, id: `local-${p.key}`, created_at: new Date().toISOString() });
    }
    n += 1;
    const warn = p.copy_warnings.length ? `  [copy: ${p.copy_warnings.join('; ')}]` : '';
    console.log(`proposed ${p.key}: "${p.subject}" for ${p.scheduled_at} (09:00 Lagos) to ${p.audience.join(' + ')}; placeholders: ${p.placeholders.join(', ') || 'none'}${warn}`);
  }

  if (!useDb) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(local, null, 2)}\n`);
    const dir = arg('preview-dir', DEFAULT_PREVIEW);
    writePreviews(dir, local.tasks);
    console.log(`\n${n} draft(s) written to ${outFile}; previews in ${dir}/ (index.html). Nothing was queued or sent; pass --db to queue them for review.`);
  } else {
    console.log(`\n${n} draft(s) queued for review at /admin/ai-employees. Nothing is sent until a person approves.`);
  }
}

main().catch((e) => {
  console.error(`propose failed: ${e.message}`);
  process.exit(1);
});
