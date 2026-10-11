#!/usr/bin/env node
// Builds youtube_listing proposals for the allowlisted finished videos under
// /root/demo-videos/<key>/ and queues them for human review.
//   node tools/ai-employees/youtube/propose.mjs                 # local JSON only
//   node tools/ai-employees/youtube/propose.mjs --db            # insert into ai_employee_tasks
//   options: --keys lesson-a1,qi-01  --start 2026-10-20  --every-days 2  --out <file>
// Read-only on the video folders. Default privacy is private. Skips keys
// that already have a proposed, approved or done listing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildListing, publicKeys, isPublicKey, scheduleSlots } from './lib/listing.mjs';
import { loadServiceEnv, createDb } from './lib/supabase.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SLUG = 'youtube-channel-manager';
const VIDEOS = '/root/demo-videos';
const DEFAULT_OUT = '/root/ai-employees/youtube-proposals.json';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };

const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

function readFolder(key) {
  const dir = path.join(VIDEOS, key);
  return {
    dir,
    files: {
      hasVideo: fs.existsSync(path.join(dir, 'youtube.mp4')),
      hasSrt: fs.existsSync(path.join(dir, 'youtube.srt')),
      hasThumbnail: fs.existsSync(path.join(dir, 'thumbnail.png')),
      description: readIf(path.join(dir, 'youtube-description.txt')),
      chapters: readIf(path.join(dir, 'chapters.txt')),
    },
  };
}

async function main() {
  const allowlist = JSON.parse(fs.readFileSync(path.join(HERE, 'config/public-allowlist.json'), 'utf8'));
  const wanted = arg('keys') ? arg('keys').split(',').map((s) => s.trim()) : publicKeys(allowlist);
  for (const k of wanted) if (!isPublicKey(allowlist, k)) throw new Error(`${k} is members-only and is never proposed for YouTube.`);

  const useDb = flag('db');
  let db = null; let employee = null; let existing = [];
  const outFile = arg('out', DEFAULT_OUT);
  let local = { employee: SLUG, tasks: [] };

  if (useDb) {
    const env = loadServiceEnv();
    if (!env) throw new Error('No /root/.ai-employees.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Run without --db to write local JSON.');
    db = createDb(env);
    employee = await db.employee(SLUG);
    if (!employee) throw new Error(`No ${SLUG} row in ai_employees. Has the migration been applied?`);
    if (employee.status !== 'active') throw new Error(`${SLUG} is ${employee.status}. Nothing is proposed while it is not active.`);
    existing = await db.tasks(employee.id, { kind: 'youtube_listing' });
  } else if (fs.existsSync(outFile)) {
    local = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    existing = local.tasks || [];
  }

  const taken = new Set(existing.filter((t) => ['proposed', 'approved', 'done'].includes(t.status)).map((t) => t.payload?.video_key));
  const todo = wanted.filter((k) => !taken.has(k) && fs.existsSync(path.join(VIDEOS, k, 'youtube.mp4')));
  const missing = wanted.filter((k) => !fs.existsSync(path.join(VIDEOS, k, 'youtube.mp4')));
  const slots = scheduleSlots(todo.length, { start: arg('start'), everyDays: Number(arg('every-days', '2')) });

  let n = 0;
  for (const [i, key] of todo.entries()) {
    const { dir, files } = readFolder(key);
    const payload = buildListing({ key, allowlist, files, scheduledAt: slots[i], sourceDir: dir });
    const row = { kind: 'youtube_listing', title: payload.title, payload, status: 'proposed' };
    if (useDb) {
      const task = await db.insertTask({ ...row, employee_id: employee.id });
      await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'proposal_created', detail: { kind: row.kind, video_key: key, scheduled_at: payload.scheduled_at, warnings: payload.copy_warnings } });
    } else {
      local.tasks.push({ ...row, id: `local-${key}-${Date.now()}`, created_at: new Date().toISOString() });
      local.actions = [...(local.actions || []), { action: 'proposal_created', video_key: key, created_at: new Date().toISOString() }];
    }
    n += 1;
    const warn = payload.copy_warnings.length ? `  [check: ${payload.copy_warnings.join('; ')}]` : '';
    console.log(`proposed ${key}: ${payload.title} (${payload.privacy}, ${payload.scheduled_at})${warn}`);
  }

  if (!useDb) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(local, null, 2)}\n`);
    console.log(`\n${n} proposal(s) written to ${outFile} (local mode; pass --db to queue them for review in /admin/ai-employees).`);
  } else {
    console.log(`\n${n} proposal(s) queued for review at /admin/ai-employees.`);
  }
  if (taken.size) console.log(`skipped (already proposed, approved or done): ${[...taken].filter((k) => wanted.includes(k)).join(', ')}`);
  if (missing.length) console.log(`no finished video yet: ${missing.join(', ')}`);
}

main().catch((e) => {
  console.error(`propose failed: ${e.message}`);
  process.exit(1);
});
