#!/usr/bin/env node
// Runs approved youtube_listing tasks: upload the video (private), add
// captions, the thumbnail and the playlist, then mark the task done or
// failed with the result and log every step.
//   node tools/ai-employees/youtube/execute.mjs --dry-run       # plan only, no upload, no writes
//   node tools/ai-employees/youtube/execute.mjs                 # upload approved tasks whose slot is due (cron, daily)
//   node tools/ai-employees/youtube/execute.mjs --max 2 --lead-hours 0
//   node tools/ai-employees/youtube/execute.mjs --task <uuid>   # one task
//   node tools/ai-employees/youtube/execute.mjs --dry-run --local [file]  # plan from the local proposals JSON, no DB, no API
// A Short (payload.format "short") waits until its parent demo is uploaded,
// then goes up with the parent's watch URL in its description. A thumbnail
// that YouTube refuses never fails the upload; it is logged as a warning.
// Housekeeping frees youtube.mp4 30 days after its R2 backup, so a due task
// whose video (or thumbnail) is gone locally gets it back from R2, checked
// against r2.json (size + MD5), before the upload. A task with no
// thumbnail_file (proposed before #1176) uses the folder's thumbnail.jpg/.png.
// Shadow-mode rule: only tasks a person approved in /admin/ai-employees run,
// only while the employee is active, and only for allowlisted videos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeBlocker, dueTasks, DAILY_UPLOAD_CAP } from './lib/listing.mjs';
import { runTask } from './lib/run-task.mjs';
import { fileSource, thumbnailPlan } from './lib/masters.mjs';
import { loadEnv } from '../../demo-video/lib/env.mjs';
import { r2Config, get as r2Get } from '../../demo-video/lib/r2.mjs';
import { loadServiceEnv, createDb } from './lib/supabase.mjs';
import { tokenProvider } from './lib/oauth.mjs';
import { createYouTubeClient } from './lib/youtube.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SLUG = 'youtube-channel-manager';
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };

/** Uploaded video ids by key, from done tasks: the parents a Short links to. */
function uploadedMap(doneTasks) {
  const m = new Map();
  for (const t of doneTasks || []) if (t.payload?.video_key && t.result?.video_id) m.set(t.payload.video_key, t.result.video_id);
  return m;
}

// --dry-run --local: the plan for the local proposals file, as if each
// proposal had been approved. Reads files only; no DB, no API.
function localPlan(allowlist, file, r2) {
  const local = JSON.parse(fs.readFileSync(file, 'utf8'));
  const employee = { status: 'active' };
  const all = (local.tasks || []).map((t) => ({ ...t, status: t.status === 'proposed' ? 'approved' : t.status, reviewer_email: t.reviewer_email || 'local-dry-run', reviewed_at: t.reviewed_at || new Date().toISOString() }));
  const uploaded = uploadedMap(all.filter((t) => t.status === 'done'));
  const pending = all.filter((t) => t.status === 'approved').sort((a, b) => Date.parse(a.payload.scheduled_at) - Date.parse(b.payload.scheduled_at));
  console.log(`[local dry run] ${pending.length} proposal(s) in ${file}, treated as approved for this plan only.`);
  const byDay = new Map();
  for (const t of pending) {
    const day = String(t.payload.scheduled_at).slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
    // in order, a parent ahead of its Short counts as uploaded by then
    const parentVideoId = t.payload.parent_key ? uploaded.get(t.payload.parent_key) || null : null;
    const blocker = executeBlocker({ task: t, employee, allowlist, parentVideoId });
    const dir = t.payload.source_dir;
    const video = dir ? fileSource(dir, t.payload.video_file || 'youtube.mp4', { r2 }) : 'missing';
    const th = dir ? thumbnailPlan(dir, t.payload, { r2 }) : { name: null };
    const files = video === 'missing' ? 'WOULD FAIL: video missing locally and not restorable from R2' : `video ${video === 'r2' ? 'restored from R2' : 'local'}, thumbnail ${th.name ? `${th.name}${th.source === 'r2' ? ' from R2' : ''}${t.payload.thumbnail_file ? '' : ' (fallback)'}` : 'none'}`;
    console.log(`${t.payload.scheduled_at} ${t.payload.video_key.padEnd(18)} ${blocker ? `BLOCKED: ${blocker}` : `upload, ${files}${t.payload.format === 'short' ? `, Short of ${t.payload.parent_key}` : ''}`}`);
    if (!blocker) uploaded.set(t.payload.video_key, `(uploaded ${day})`);
  }
  const busiest = Math.max(0, ...byDay.values());
  console.log(`busiest day: ${busiest} upload(s); daily cap ${DAILY_UPLOAD_CAP}.`);
}

async function main() {
  const dryRun = flag('dry-run');
  const allowlist = JSON.parse(fs.readFileSync(path.join(HERE, 'config/public-allowlist.json'), 'utf8'));
  // R2 restores housekept masters; without /root/.r2.env a missing file fails its task
  const r2cfg = r2Config(loadEnv());
  const r2 = r2cfg ? { cfg: r2cfg, get: r2Get } : null;
  if (flag('local')) {
    if (!dryRun) throw new Error('--local only plans (--dry-run); uploads run from tasks approved in the database.');
    const next = argv[argv.indexOf('--local') + 1];
    localPlan(allowlist, next && !next.startsWith('--') ? next : '/root/ai-employees/youtube-proposals.json', r2);
    return;
  }
  const env = loadServiceEnv();
  if (!env) throw new Error('No /root/.ai-employees.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. execute.mjs only acts on tasks approved in the database.');
  const db = createDb(env);
  const employee = await db.employee(SLUG);
  if (!employee) throw new Error(`No ${SLUG} row in ai_employees.`);
  if (employee.status !== 'active') {
    console.log(`${SLUG} is ${employee.status}. Nothing runs until it is resumed in /admin/ai-employees.`);
    return;
  }
  let tasks = await db.tasks(employee.id, { status: 'approved' });
  if (arg('task')) tasks = tasks.filter((t) => t.id === arg('task'));
  else {
    const approved = tasks.length;
    tasks = dueTasks(tasks, { leadHours: Number(arg('lead-hours', 24)), max: Number(arg('max', DAILY_UPLOAD_CAP)) });
    console.log(`${approved} approved, ${tasks.length} due now.`);
  }
  if (!tasks.length) { console.log('No approved tasks due.'); return; }

  const yt = dryRun ? null : createYouTubeClient({ getToken: tokenProvider() });
  const playlists = new Map();
  const uploaded = uploadedMap(await db.tasks(employee.id, { status: 'done' }));
  for (const task of tasks) {
    // re-read the register before each task so a pause stops the run
    const current = await db.employee(SLUG);
    if (current?.status !== 'active') { console.log(`${SLUG} was ${current?.status || 'removed'} mid-run. Stopping.`); return; }
    await runTask({ task, employee: current, allowlist, db, yt, dryRun, force: flag('force'), playlists, uploaded, r2 });
  }
}

main().catch((e) => {
  console.error(`execute failed: ${e.message}`);
  process.exit(1);
});
