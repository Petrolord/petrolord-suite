#!/usr/bin/env node
// YouTube thumbnails for the public videos.
//   node tools/demo-video/thumbs.mjs                  # every key on the public allowlist
//   node tools/demo-video/thumbs.mjs qi-01 seis-02    # just these
//   options: --force (remake existing), --sheet <png> (contact sheet of the results),
//            --upload (copy each new thumbnail.jpg to R2 with the masters),
//            --allowlist <json> (another copy of the allowlist, for a branch under review)
//
// For each key: score one candidate frame per storyboard step (late in the
// step, when the result is on screen) and take the most colourful, detailed
// one unless tools/demo-video/config/thumbs.json names a step or a time;
// then draw cards/thumb.html over it in headless Chromium and save
// /root/demo-videos/<key>/thumbnail.jpg (1280x720, JPEG, under 2 MB).
// Only reads the masters; writes thumbnail.jpg beside them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { OUT_ROOT, loadEnv } from './lib/env.mjs';
import { candidateTimes, frameScore, bestWindow, pickFrame, thumbSpec, THUMB } from './lib/thumbs.mjs';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : null; };
const optVals = new Set(['--sheet', '--allowlist'].map((o) => args[args.indexOf(o) + 1]).filter(Boolean));
const keysArg = args.filter((a) => !a.startsWith('--') && !optVals.has(a));

const allowlist = JSON.parse(fs.readFileSync(opt('allowlist') || path.join(REPO, 'tools/ai-employees/youtube/config/public-allowlist.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config/thumbs.json'), 'utf8'));
const seriesOf = (key) => (allowlist.series || []).find((s) => (s.keys || []).includes(key)) || null;
const SAMPLE_W = 160; const SAMPLE_H = 90;

function titleOf(key, dir) {
  const f = path.join(dir, 'youtube-description.txt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').split('\n')[0].trim();
  return allowlist.fallbackListings?.[key]?.title || '';
}

async function grab(video, t) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', t.toFixed(3), '-i', video, '-frames:v', '1',
    '-vf', `scale=${SAMPLE_W}:${SAMPLE_H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
  { encoding: 'buffer', maxBuffer: 1 << 24 });
  return stdout;
}
const sample = async (video, t) => frameScore(await grab(video, t), SAMPLE_W, SAMPLE_H);

async function scoreAll(video, cands, width = 4) {
  const out = new Array(cands.length);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < cands.length) {
      const i = next; next += 1;
      out[i] = { ...cands[i], score: await sample(video, cands[i].t) };
    }
  }));
  return out;
}

async function makeOne(browser, key, tmp) {
  const series = seriesOf(key);
  const dir = path.join(OUT_ROOT, key);
  const video = path.join(dir, 'youtube.mp4');
  const out = path.join(dir, 'thumbnail.jpg');
  if (!fs.existsSync(video)) return { key, skipped: 'no youtube.mp4' };
  if (fs.existsSync(out) && !flag('force')) return { key, skipped: 'thumbnail.jpg exists (use --force)' };
  const entry = config.keys?.[key] || {};
  const spec = thumbSpec({ key, series, title: titleOf(key, dir), entry: { ...entry, chip: entry.chip || config.chips?.[series?.id] } });

  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const cands = candidateTimes(rec);
  const scored = typeof entry.frame === 'number' ? [] : await scoreAll(video, cands);
  const pick = pickFrame(scored, entry.frame ?? null);

  const focus = entry.focus ?? bestWindow(await grab(video, pick.t), SAMPLE_W, SAMPLE_H);
  const framePng = path.join(tmp, `${key}.png`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', pick.t.toFixed(3), '-i', video, '-frames:v', '1', '-vf', 'scale=1920:1080:flags=lanczos', framePng]);
  const page = await browser.newPage({ viewport: { width: THUMB.width, height: THUMB.height }, deviceScaleFactor: 1 });
  const mark = `file://${path.join(REPO, 'public/petrolord-suite-wordmark.png')}`;
  const hash = new URLSearchParams({
    frame: `file://${framePng}`, mark, text: spec.text, chip: spec.chip, tag: spec.tag, accent: spec.accent,
    focus: String(focus), zoom: String(entry.zoom ?? 1.1),
  }).toString();
  await page.goto(`file://${path.join(HERE, 'cards/thumb.html')}#${hash}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const fontSize = await page.evaluate(() => document.body.dataset.fontSize);
  await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
  await page.close();
  const bytes = fs.statSync(out).size;
  if (bytes > THUMB.maxBytes) throw new Error(`${out} is ${bytes} bytes, over YouTube's 2 MB`);
  return { key, focus, t: pick.t, step: pick.id, reason: pick.reason, text: spec.text, fontSize, kb: Math.round(bytes / 1024) };
}

const keys = keysArg.length ? keysArg : (allowlist.series || []).flatMap((s) => s.keys || []);
for (const k of keys) if (!seriesOf(k)) { console.error(`${k} is not on the public allowlist; no thumbnail is made for members-only videos.`); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));
const browser = await chromium.launch();
const made = [];
let failed = 0;
try {
  for (const key of keys) {
    try {
      const r = await makeOne(browser, key, tmp);
      if (r.skipped) console.log(`${key}: skipped, ${r.skipped}`);
      else { made.push(r); console.log(`${key}: ${r.kb} KB, frame ${r.t.toFixed(1)} s (${r.step || 'time'}, ${r.reason}, focus ${r.focus}), "${r.text}" at ${r.fontSize}px`); }
    } catch (e) { failed += 1; console.error(`${key}: FAILED ${e.message}`); }
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (opt('sheet') && made.length) {
  const list = made.map((r) => path.join(OUT_ROOT, r.key, 'thumbnail.jpg'));
  const cols = 4; const rows = Math.ceil(list.length / cols);
  const inputs = list.flatMap((f) => ['-i', f]);
  const scaled = list.map((_, i) => `[${i}:v]scale=480:270[s${i}]`).join(';');
  const layout = list.map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|');
  const graph = list.length > 1 ? `${scaled};${list.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${list.length}:layout=${layout}:fill=black[v]` : `${scaled.replace('[s0]', '[v]')}`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[v]', '-frames:v', '1', opt('sheet')]);
  console.log(`contact sheet (${cols}x${rows}): ${opt('sheet')}`);
}

if (flag('upload') && made.length) {
  const { r2Config, uploadVideo } = await import('./lib/r2.mjs');
  const cfg = r2Config(loadEnv());
  if (!cfg) console.warn('R2 is not configured (/root/.r2.env); thumbnails stay local only.');
  else for (const r of made) {
    try { await uploadVideo(cfg, path.join(OUT_ROOT, r.key), { log: () => {} }); console.log(`${r.key}: copied to R2`); } catch (e) { failed += 1; console.error(`${r.key}: R2 copy failed: ${e.message}`); }
  }
}

console.log(`\n${made.length} thumbnail(s) made${failed ? `, ${failed} failed` : ''}.`);
process.exit(failed ? 1 : 0);
