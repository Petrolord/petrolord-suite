// One approved youtube_listing task: upload the video, then captions,
// thumbnail and playlist, and record the outcome. Split out of execute.mjs
// so tests can drive it with mocked YouTube, database and R2 clients.
import fs from 'node:fs';
import path from 'node:path';
import { executeBlocker, videoResource, withParentUrl, thumbnailHint } from './listing.mjs';
import { ensureLocal, fileSource, r2Record, resolveThumbnail, thumbnailPlan } from './masters.mjs';

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

export async function runTask({ task, employee, allowlist, db, yt, dryRun, force, playlists, uploaded, r2 = null, log = console.log }) {
  const parentVideoId = task.payload?.parent_key ? uploaded.get(task.payload.parent_key) || null : null;
  const blocker = executeBlocker({ task, employee, allowlist, parentVideoId });
  if (blocker) { console.log(`skip ${task.id}: ${blocker}`); return; }
  const p = { ...task.payload };
  if (p.format === 'short') p.description = withParentUrl(p.description, parentVideoId);
  const dir = p.source_dir;
  const videoName = p.video_file || 'youtube.mp4';
  const video = path.join(dir, videoName);
  const srt = p.captions_file ? path.join(dir, p.captions_file) : null;

  if (dryRun) {
    // plan only: says where each file would come from, fetches nothing
    const src = fileSource(dir, videoName, { r2 });
    if (src === 'missing') { console.log(`[dry run] ${task.id} ${p.video_key}: WOULD FAIL, ${video} is missing locally and cannot be restored from R2`); return; }
    const size = src === 'local' ? fs.statSync(video).size : r2Record(dir, videoName).size;
    const th = thumbnailPlan(dir, p, { r2 });
    console.log(`[dry run] ${task.id} ${p.video_key}: would upload ${video} (${(size / 1e6).toFixed(1)} MB${src === 'r2' ? ', restored from R2 first' : ''}) as "${p.title}", ${p.privacy}`);
    console.log(`          playlist ${p.playlist ? `"${p.playlist}"` : 'none'}, captions ${srt && fs.existsSync(srt) ? 'yes' : 'no'}, thumbnail ${th.name ? `${th.name}${th.source === 'r2' ? ' (from R2)' : ''}${p.thumbnail_file ? '' : ' (folder fallback)'}` : 'no'}${p.format === 'short' ? `, Short of ${p.parent_key} (${parentVideoId})` : ''}`);
    return;
  }

  // a started upload with no outcome means a crash mid-upload: a person checks the channel before a retry
  const prior = await db.actions(employee.id, task.id);
  if (prior.some((a) => a.action === 'upload_started') && !force) {
    console.log(`skip ${task.id}: an earlier upload started and never finished. Check YouTube Studio, then rerun with --force.`);
    return;
  }

  // housekeeping frees youtube.mp4 30 days after its R2 backup; bring it back
  try {
    const got = await ensureLocal(dir, videoName, { r2, log });
    if (got.source === 'r2') await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'master_restored', detail: { video_key: p.video_key, file: videoName } });
  } catch (e) {
    const result = { video_key: p.video_key, error: e.message, completed_at: new Date().toISOString() };
    await db.updateTask(task.id, { status: 'failed', result }, { fromStatus: 'approved' });
    await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'task_failed', detail: { error: e.message } });
    console.error(`failed ${p.video_key}: ${e.message}`);
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
    // tasks proposed before #1176 have no thumbnail_file: use the folder's thumbnail, as new tasks do
    const th = await resolveThumbnail(dir, p, { r2, log });
    if (th.warning) extras.push(th.warning);
    if (th.file) {
      const warn = await setThumbnail(yt, v.id, th.file);
      if (warn) extras.push(warn); else { result.thumbnail = true; result.thumbnail_file = path.basename(th.file); }
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

