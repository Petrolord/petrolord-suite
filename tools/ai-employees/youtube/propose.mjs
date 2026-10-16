#!/usr/bin/env node
// Builds youtube_listing proposals for the allowlisted finished videos under
// /root/demo-videos/<key>/ and queues them for human review.
//   node tools/ai-employees/youtube/propose.mjs                 # local JSON only
//   node tools/ai-employees/youtube/propose.mjs --db            # insert into ai_employee_tasks
//   options: --keys lesson-a1,qi-01  --start 2026-10-20  --every-days 2  --out <file>
//            --only videos|shorts  --shorts-every-days 2  --privacy private|unlisted|public (default private)
// Read-only on the video folders. Default privacy is private. Skips keys
// that already have a proposed, approved or done listing.
// Shorts (<demo>-short<n>, allowlist series of kind "short") are scheduled
// between the main uploads: a day or more after their parent demo's slot
// and two days or more after the previous Short. A Short whose parent has
// not been proposed yet waits for a later run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildListing, publicKeys, isPublicKey, isShortKey, shortParent, scheduleSlots, scheduleShorts } from './lib/listing.mjs';
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
      hasThumbnailJpg: fs.existsSync(path.join(dir, 'thumbnail.jpg')),
      hasThumbnailPng: fs.existsSync(path.join(dir, 'thumbnail.png')),
      description: readIf(path.join(dir, 'youtube-description.txt')),
      chapters: readIf(path.join(dir, 'chapters.txt')),
    },
  };
}

async function main() {
  const allowlist = JSON.parse(fs.readFileSync(path.join(HERE, 'config/public-allowlist.json'), 'utf8'));
  let wanted = arg('keys') ? arg('keys').split(',').map((s) => s.trim()) : publicKeys(allowlist);
  for (const k of wanted) if (!isPublicKey(allowlist, k)) throw new Error(`${k} is members-only and is never proposed for YouTube.`);
  const only = arg('only');
  if (only === 'videos') wanted = wanted.filter((k) => !isShortKey(allowlist, k));
  else if (only === 'shorts') wanted = wanted.filter((k) => isShortKey(allowlist, k));
  else if (only) throw new Error('--only takes videos or shorts');

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

  const live = existing.filter((t) => ['proposed', 'approved', 'done'].includes(t.status));
  const taken = new Set(live.map((t) => t.payload?.video_key));
  const ready = wanted.filter((k) => !taken.has(k) && fs.existsSync(path.join(VIDEOS, k, 'youtube.mp4')));
  const missing = wanted.filter((k) => !fs.existsSync(path.join(VIDEOS, k, 'youtube.mp4')));
  const mains = ready.filter((k) => !isShortKey(allowlist, k));
  const shorts = ready.filter((k) => isShortKey(allowlist, k));
  const mainSlots = scheduleSlots(mains.length, { start: arg('start'), everyDays: Number(arg('every-days', '2')) });

  // parents' slots: listings already proposed, approved or done, plus the ones made now
  const parentSlots = {};
  const uploadedIds = {};
  for (const t of live) {
    if (t.payload?.video_key && t.payload?.scheduled_at) parentSlots[t.payload.video_key] = t.payload.scheduled_at;
    if (t.status === 'done' && t.result?.video_id) uploadedIds[t.payload.video_key] = t.result.video_id;
  }
  mains.forEach((k, i) => { parentSlots[k] = mainSlots[i]; });
  const lastShort = live.filter((t) => t.payload?.format === 'short').map((t) => t.payload.scheduled_at).sort().pop() || null;
  const { slots: shortSlots, waiting } = scheduleShorts(shorts, parentSlots, { start: arg('start'), everyDays: Number(arg('shorts-every-days', '2')), lastSlot: lastShort });
  const todo = [...mains.map((k, i) => [k, mainSlots[i]]), ...shorts.filter((k) => shortSlots[k]).map((k) => [k, shortSlots[k]])];

  let n = 0;
  for (const [key, slot] of todo) {
    const { dir, files } = readFolder(key);
    const payload = buildListing({ key, allowlist, files, scheduledAt: slot, sourceDir: dir, parentVideoId: uploadedIds[shortParent(key)] || null, privacy: arg('privacy', 'private') });
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
    console.log(`proposed ${key}: ${payload.title} (${payload.privacy}, ${payload.scheduled_at}${payload.thumbnail_file ? `, ${payload.thumbnail_file}` : ''})${warn}`);
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
  if (waiting.length) console.log(`Shorts waiting for their parent demo to be proposed first: ${waiting.join(', ')}`);
}

main().catch((e) => {
  console.error(`propose failed: ${e.message}`);
  process.exit(1);
});
