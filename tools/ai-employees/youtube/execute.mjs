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
// Shadow-mode rule: only tasks a person approved in /admin/ai-employees run,
// only while the employee is active, and only for allowlisted videos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeBlocker, videoResource, dueTasks, DAILY_UPLOAD_CAP, withParentUrl, thumbnailHint } from './lib/listing.mjs';
import { loadServiceEnv, createDb } from './lib/supabase.mjs';
import { tokenProvider } from './lib/oauth.mjs';
import { createYouTubeClient } from './lib/youtube.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SLUG = 'youtube-channel-manager';
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };

// playlistItems.insert right after an upload sometimes answers 409 "The
// operation was aborted" (seen on petro-01, 2026-10-13); YouTube's advice is
// to retry with backoff.
async function withRetry(fn, { tries = 4, waitMs = 5000 } = {}) {
  for (let i = 1; ; i += 1) {
    try { return await fn(); } catch (e) {
      if (i >= tries || !/\((409|429|5\d\d)\)/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, waitMs * i));
    }
  }
}

async function findOrCreatePlaylist(yt, title, cache) {
  if (cache.has(title)) return cache.get(title);
  const mine = await yt.playlistsMine();
  let pl = (mine?.items || []).find((p) => p.snippet?.title === title);
  let created = false;
  if (!pl) { pl = await yt.playlistsInsert({ title, privacyStatus: 'private' }); created = true; }
  cache.set(title, { id: pl.id, created });
  return cache.get(title);
}

const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

/** thumbnails.set with retry; returns null on success or the warning text. */
async function setThumbnail(yt, videoId, file) {
  try {
    await withRetry(() => yt.thumbnailsSet({ videoId, filePath: file, contentType: IMAGE_TYPES[path.extname(file).toLowerCase()] || 'image/jpeg' }));
    return null;
  } catch (e) {
    return `thumbnail: ${e.message} (${thumbnailHint(e.message)})`;
  }
}

async function runTask({ task, employee, allowlist, db, yt, dryRun, force, playlists, uploaded }) {
  const parentVideoId = task.payload?.parent_key ? uploaded.get(task.payload.parent_key) || null : null;
  const blocker = executeBlocker({ task, employee, allowlist, parentVideoId });
  if (blocker) { console.log(`skip ${task.id}: ${blocker}`); return; }
  const p = { ...task.payload };
  if (p.format === 'short') p.description = withParentUrl(p.description, parentVideoId);
  const dir = p.source_dir;
  const video = path.join(dir, p.video_file || 'youtube.mp4');
  if (!fs.existsSync(video)) throw new Error(`${video} is missing`);
  const srt = p.captions_file ? path.join(dir, p.captions_file) : null;
  const thumb = p.thumbnail_file ? path.join(dir, p.thumbnail_file) : null;

  if (dryRun) {
    console.log(`[dry run] ${task.id} ${p.video_key}: would upload ${video} (${(fs.statSync(video).size / 1e6).toFixed(1)} MB) as "${p.title}", ${p.privacy}`);
    console.log(`          playlist ${p.playlist ? `"${p.playlist}"` : 'none'}, captions ${srt && fs.existsSync(srt) ? 'yes' : 'no'}, thumbnail ${thumb && fs.existsSync(thumb) ? path.basename(thumb) : 'no'}${p.format === 'short' ? `, Short of ${p.parent_key} (${parentVideoId})` : ''}`);
    return;
  }

  // a started upload with no outcome means a crash mid-upload: a person checks the channel before a retry
  const prior = await db.actions(employee.id, task.id);
  if (prior.some((a) => a.action === 'upload_started') && !force) {
    console.log(`skip ${task.id}: an earlier upload started and never finished. Check YouTube Studio, then rerun with --force.`);
    return;
  }

  await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'upload_started', detail: { video_key: p.video_key } });
  const result = { video_key: p.video_key, started_at: new Date().toISOString() };
  try {
    const v = await yt.videosInsert({
      filePath: video,
      resource: videoResource(p),
      onProgress: (done, size) => process.stdout.write(`\r  ${p.video_key}: ${Math.round((100 * done) / size)}%`),
    });
    process.stdout.write('\n');
    result.video_id = v.id;
    result.url = `https://www.youtube.com/watch?v=${v.id}`;
    result.privacy = v.status?.privacyStatus;
    await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'video_uploaded', detail: { video_id: v.id, privacy: result.privacy } });

    const extras = [];
    if (srt && fs.existsSync(srt)) {
      try { await yt.captionsInsert({ videoId: v.id, filePath: srt }); result.captions = true; } catch (e) { extras.push(`captions: ${e.message}`); }
    }
    if (thumb && fs.existsSync(thumb)) {
      const warn = await setThumbnail(yt, v.id, thumb);
      if (warn) extras.push(warn); else result.thumbnail = true;
    }
    if (p.playlist) {
      try {
        const pl = await findOrCreatePlaylist(yt, p.playlist, playlists);
        await withRetry(() => yt.playlistItemsInsert({ playlistId: pl.id, videoId: v.id }));
        result.playlist_id = pl.id;
        if (pl.created) await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'playlist_created', detail: { title: p.playlist, playlist_id: pl.id } });
      } catch (e) { extras.push(`playlist: ${e.message}`); }
    }
    if (extras.length) result.warnings = extras;
    result.completed_at = new Date().toISOString();
    uploaded.set(p.video_key, v.id);
    await db.updateTask(task.id, { status: 'done', result }, { fromStatus: 'approved' });
    await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'task_done', detail: { video_id: v.id, warnings: extras } });
    console.log(`done ${p.video_key}: ${result.url}${extras.length ? ` (warnings: ${extras.join('; ')})` : ''}`);
  } catch (e) {
    result.error = e.message;
    result.completed_at = new Date().toISOString();
    await db.updateTask(task.id, { status: 'failed', result }, { fromStatus: 'approved' });
    await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'task_failed', detail: { error: e.message } });
    console.error(`failed ${p.video_key}: ${e.message}`);
  }
}

/** Uploaded video ids by key, from done tasks: the parents a Short links to. */
function uploadedMap(doneTasks) {
  const m = new Map();
  for (const t of doneTasks || []) if (t.payload?.video_key && t.result?.video_id) m.set(t.payload.video_key, t.result.video_id);
  return m;
}

// --dry-run --local: the plan for the local proposals file, as if each
// proposal had been approved. Reads files only; no DB, no API.
function localPlan(allowlist, file) {
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
    console.log(`${t.payload.scheduled_at} ${t.payload.video_key.padEnd(18)} ${blocker ? `BLOCKED: ${blocker}` : `upload, thumbnail ${t.payload.thumbnail_file || 'none'}${t.payload.format === 'short' ? `, Short of ${t.payload.parent_key}` : ''}`}`);
    if (!blocker) uploaded.set(t.payload.video_key, `(uploaded ${day})`);
  }
  const busiest = Math.max(0, ...byDay.values());
  console.log(`busiest day: ${busiest} upload(s); daily cap ${DAILY_UPLOAD_CAP}.`);
}

async function main() {
  const dryRun = flag('dry-run');
  const allowlist = JSON.parse(fs.readFileSync(path.join(HERE, 'config/public-allowlist.json'), 'utf8'));
  if (flag('local')) {
    if (!dryRun) throw new Error('--local only plans (--dry-run); uploads run from tasks approved in the database.');
    const next = argv[argv.indexOf('--local') + 1];
    localPlan(allowlist, next && !next.startsWith('--') ? next : '/root/ai-employees/youtube-proposals.json');
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
    await runTask({ task, employee: current, allowlist, db, yt, dryRun, force: flag('force'), playlists, uploaded });
  }
}

main().catch((e) => {
  console.error(`execute failed: ${e.message}`);
  process.exit(1);
});
