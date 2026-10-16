#!/usr/bin/env node
// Sets the custom thumbnail on videos that are already on the channel.
// Owner-run (it calls the YouTube API as the channel).
//   node tools/ai-employees/youtube/set-thumbnails.mjs --dry-run      # what it would do, no API, no writes
//   node tools/ai-employees/youtube/set-thumbnails.mjs                # every uploaded listing still without one
//   node tools/ai-employees/youtube/set-thumbnails.mjs --video petro-01=_aBSe9V8W3o --video petro-02=eC_UIq_Abec
//   option: --force (set again even where it was set before)
//
// Without --video it reads the done youtube_listing tasks in the database and
// takes /root/demo-videos/<key>/thumbnail.jpg (or .png) for each. Only keys
// on the public allowlist are touched, and Shorts are left alone (YouTube
// picks their frame). Each success is logged to ai_employee_actions as
// thumbnail_set. thumbnails.set costs 50 quota units per video.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublicKey, isShortKey, thumbnailFile, thumbnailHint } from './lib/listing.mjs';
import { loadServiceEnv, createDb } from './lib/supabase.mjs';
import { tokenProvider } from './lib/oauth.mjs';
import { createYouTubeClient } from './lib/youtube.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SLUG = 'youtube-channel-manager';
const VIDEOS = '/root/demo-videos';
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const many = (n) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] ? [argv[i + 1]] : []));
const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png' };

function thumbFor(key, sourceDir) {
  const dir = sourceDir || path.join(VIDEOS, key);
  const name = thumbnailFile({ hasThumbnailJpg: fs.existsSync(path.join(dir, 'thumbnail.jpg')), hasThumbnailPng: fs.existsSync(path.join(dir, 'thumbnail.png')) });
  return name ? path.join(dir, name) : null;
}

async function main() {
  const dryRun = flag('dry-run');
  const allowlist = JSON.parse(fs.readFileSync(path.join(HERE, 'config/public-allowlist.json'), 'utf8'));
  const env = loadServiceEnv();
  const db = env ? createDb(env) : null;
  const employee = db ? await db.employee(SLUG) : null;

  let targets = many('video').map((pair) => {
    const [key, videoId] = pair.split('=');
    if (!key || !videoId) throw new Error(`--video takes key=videoId, got "${pair}"`);
    return { key, videoId, task: null };
  });
  if (!targets.length) {
    if (!employee) throw new Error('No database access (/root/.ai-employees.env) or no channel manager row; pass --video key=videoId instead.');
    const done = await db.tasks(employee.id, { status: 'done', kind: 'youtube_listing' });
    targets = done.filter((t) => t.result?.video_id).map((t) => ({ key: t.payload.video_key, videoId: t.result.video_id, task: t }));
  }

  const yt = dryRun ? null : createYouTubeClient({ getToken: tokenProvider() });
  let set = 0; let failed = 0; let refusedForPermission = false;
  for (const t of targets) {
    if (!isPublicKey(allowlist, t.key)) { console.log(`skip ${t.key}: not on the public allowlist`); continue; }
    if (isShortKey(allowlist, t.key)) { console.log(`skip ${t.key}: a Short; YouTube picks its frame`); continue; }
    const file = thumbFor(t.key, t.task?.payload?.source_dir);
    if (!file) { console.log(`skip ${t.key}: no thumbnail.jpg or thumbnail.png (run tools/demo-video/thumbs.mjs ${t.key})`); continue; }
    if (t.task && !flag('force')) {
      const prior = t.task.result?.thumbnail || (await db.actions(employee.id, t.task.id)).some((a) => a.action === 'thumbnail_set');
      if (prior) { console.log(`skip ${t.key}: thumbnail already set (--force to set again)`); continue; }
    }
    if (dryRun) { console.log(`[dry run] ${t.key} (${t.videoId}): would set ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`); continue; }
    try {
      await yt.thumbnailsSet({ videoId: t.videoId, filePath: file, contentType: TYPES[path.extname(file)] || 'image/jpeg' });
      set += 1;
      console.log(`set ${t.key} (https://www.youtube.com/watch?v=${t.videoId})`);
      if (db && employee) await db.logAction({ employee_id: employee.id, task_id: t.task?.id || null, action: 'thumbnail_set', detail: { video_key: t.key, video_id: t.videoId, file: path.basename(file) } });
    } catch (e) {
      failed += 1;
      if (/\(403\)/.test(e.message)) refusedForPermission = true;
      console.error(`failed ${t.key}: ${e.message}`);
    }
  }
  console.log(`\n${set} thumbnail(s) set${failed ? `, ${failed} failed` : ''}.`);
  if (refusedForPermission) console.log(thumbnailHint('(403)'));
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`set-thumbnails failed: ${e.message}`);
  process.exit(1);
});
