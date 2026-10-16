#!/usr/bin/env node
// Vertical Shorts cut from the public demo masters.
//   node tools/demo-video/shorts.mjs                  # every Short in config/shorts.json
//   node tools/demo-video/shorts.mjs qi-01 seis-01    # the Shorts of these demos
//   node tools/demo-video/shorts.mjs --plan           # print the windows only, render nothing
//   options: --force (remake existing), --upload (copy each new Short to R2),
//            --allowlist <json> (another copy of the allowlist, for a branch under review)
//
// Each Short is 1080x1920: the app panel cropped from the 4K master over a
// blurred fill of the same picture, the wordmark and app name above it,
// captions burned in from the master's own youtube.srt, a hook card over
// the first 2 s and a closing card "Full demo on the channel". Output goes
// to /root/demo-videos/<parent>-short<n>/ (youtube.mp4,
// youtube-description.txt, short.json). Only demo masters on the public
// allowlist are cut; a members-only video never gets a Short.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { OUT_ROOT, loadEnv } from './lib/env.mjs';
import { bestWindow } from './lib/thumbs.mjs';
import { SHORT, parseSrt, stepTimes, clipWindow, lengthProblem, shortCues, shortAss, panelGeometry, shortDescriptionFile } from './lib/shorts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : null; };
const optVals = new Set(['--allowlist'].map((o) => (args.indexOf(o) > -1 ? args[args.indexOf(o) + 1] : null)).filter(Boolean));
const parentsArg = args.filter((a) => !a.startsWith('--') && !optVals.has(a));

const allowlist = JSON.parse(fs.readFileSync(opt('allowlist') || path.join(REPO, 'tools/ai-employees/youtube/config/public-allowlist.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config/shorts.json'), 'utf8'));
const thumbsConfig = JSON.parse(fs.readFileSync(path.join(HERE, 'config/thumbs.json'), 'utf8'));
const seriesOf = (key) => (allowlist.series || []).find((s) => s.kind !== 'short' && (s.keys || []).includes(key)) || null;
const ff = (a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 26 });

function parentInfo(key) {
  const dir = path.join(OUT_ROOT, key);
  const f = path.join(dir, 'youtube-description.txt');
  let title = allowlist.fallbackListings?.[key]?.title || '';
  let tags = allowlist.fallbackListings?.[key]?.tags || [];
  if (fs.existsSync(f)) {
    const text = fs.readFileSync(f, 'utf8');
    title = text.split('\n')[0].trim();
    const m = text.match(/^Tags:\s*(.*)$/mi);
    if (m) tags = m[1].split(',').map((t) => t.trim()).filter(Boolean);
  }
  return { dir, title, tags };
}

async function renderLayer(browser, out, fields, transparent) {
  const page = await browser.newPage({ viewport: { width: SHORT.width, height: SHORT.height }, deviceScaleFactor: 1 });
  const mark = `file://${path.join(REPO, 'public/petrolord-suite-wordmark.png')}`;
  await page.goto(`file://${path.join(HERE, 'cards/short.html')}#${new URLSearchParams({ ...fields, mark })}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}

function grabSmall(video, t) {
  return execFileSync('ffmpeg', ['-v', 'error', '-ss', t.toFixed(3), '-i', video, '-frames:v', '1', '-vf', 'scale=160:90:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 24 });
}

function plan(parent, entry) {
  const series = seriesOf(parent);
  if (!series) throw new Error(`${parent} is not on the public allowlist; members-only videos never get a Short`);
  if (series.kind !== 'demo') throw new Error(`${parent} is a ${series.kind}; Shorts are cut from demos only`);
  const { dir, title, tags } = parentInfo(parent);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const srt = path.join(dir, 'youtube.srt');
  if (!fs.existsSync(srt)) throw new Error(`${parent} has no youtube.srt to caption from`);
  const cues = parseSrt(fs.readFileSync(srt, 'utf8'));
  const win = clipWindow(stepTimes(rec), cues, entry);
  const problem = lengthProblem(win);
  if (problem) throw new Error(`${parent}-short${entry.n}: ${problem}`);
  const appName = thumbsConfig.chips?.[series.id] || series.playlist;
  const key = `${parent}-short${entry.n}`;
  return { key, parent, series, dir, title, tags, rec, cues, win, appName, entry };
}

async function makeOne(browser, p, tmp) {
  const outDir = path.join(OUT_ROOT, p.key);
  const out = path.join(outDir, 'youtube.mp4');
  if (fs.existsSync(out) && !flag('force')) return { skipped: 'youtube.mp4 exists (use --force)' };
  const video = path.join(p.dir, 'youtube.mp4');
  const w = p.entry.crop?.w ?? 0.65;
  // the busiest part of the frame over five moments of the clip, so a scene change does not throw the crop
  const focus = p.entry.crop?.focus ?? bestWindow([0.1, 0.3, 0.5, 0.7, 0.9].map((f) => grabSmall(video, p.win.start + p.win.duration * f)), 160, 90, { frac: w });
  const g = panelGeometry({ w, focus });
  const cw = 2 * Math.round((3840 * g.w) / 2); const cx = 2 * Math.round((3840 * g.x0) / 2);

  const work = fs.mkdtempSync(path.join(tmp, `${p.key}-`));
  const ass = path.join(work, 'captions.ass');
  fs.writeFileSync(ass, shortAss(shortCues(p.cues, p.win)));
  const tag = `Demo ${Number(p.parent.slice(-2))}`;
  const chrome = path.join(work, 'chrome.png'); const hook = path.join(work, 'hook.png'); const outro = path.join(work, 'outro.png');
  await renderLayer(browser, chrome, { mode: 'chrome', chip: p.appName, tag }, true);
  await renderLayer(browser, hook, { mode: 'hook', text: p.entry.hook, chip: p.appName }, true);
  await renderLayer(browser, outro, { mode: 'outro', chip: p.appName }, false);

  const D = p.win.duration.toFixed(3); const H = SHORT.hookSeconds; const O = SHORT.outroSeconds;
  const graph = [
    '[0:v]fps=30,split[a][b]',
    '[a]scale=-2:480,crop=270:480,boxblur=12:2,scale=1080:1920,eq=brightness=-0.34:saturation=0.6,setsar=1[bg]',
    `[b]crop=${cw}:2160:${cx}:0,scale=1080:${g.panelHeight}:flags=lanczos,setsar=1[fg]`,
    `[bg][fg]overlay=0:${g.panelTop}[m1]`,
    '[m1][1:v]overlay=0:0[m2]',
    `[m2]subtitles=f=${ass}:fontsdir=/usr/share/fonts[m3]`,
    `[2:v]format=rgba,fade=t=out:st=${H - 0.4}:d=0.4:alpha=1[h]`,
    '[m3][h]overlay=0:0:eof_action=pass,format=yuv420p,setsar=1[v0]',
    '[3:v]fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.3[v1]',
    `[0:a]aresample=48000,afade=t=in:d=0.15,afade=t=out:st=${(p.win.duration - 0.5).toFixed(3)}:d=0.5[a0]`,
    '[v0][a0][v1][4:a]concat=n=2:v=1:a=1[v][a]',
  ].join(';');
  fs.mkdirSync(outDir, { recursive: true });
  const tmpOut = path.join(work, 'short.mp4');
  ff(['-ss', p.win.start.toFixed(3), '-t', D, '-i', video, '-i', chrome, '-loop', '1', '-t', String(H), '-i', hook,
    '-loop', '1', '-t', String(O), '-i', outro, '-f', 'lavfi', '-t', String(O), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tmpOut]);
  fs.renameSync(tmpOut, out);

  const shortTitle = `${p.entry.hook} | ${p.appName}`;
  fs.writeFileSync(path.join(outDir, 'youtube-description.txt'), shortDescriptionFile({ hook: p.entry.hook, title: shortTitle, parentTitle: p.title, appName: p.appName, tags: p.tags.slice(0, 8) }));
  fs.writeFileSync(path.join(outDir, 'short.json'), `${JSON.stringify({ key: p.key, parent: p.parent, from: p.entry.from, to: p.entry.to, start: p.win.start, end: p.win.end, total: p.win.total, crop: { w: g.w, focus }, hook: p.entry.hook }, null, 2)}\n`);
  fs.rmSync(work, { recursive: true, force: true });
  return { mb: fs.statSync(out).size / 1e6, focus };
}

const parents = parentsArg.length ? parentsArg : Object.keys(config.shorts || {});
const plans = [];
for (const parent of parents) {
  const list = config.shorts?.[parent];
  if (!list) { console.error(`${parent} has no Shorts in config/shorts.json`); process.exit(2); }
  for (const entry of list) plans.push(plan(parent, entry));
}
for (const p of plans) console.log(`${p.key}: ${p.entry.from}..${p.entry.to}, ${p.win.start.toFixed(1)} to ${p.win.end.toFixed(1)} s on ${p.parent}, ${p.win.total.toFixed(1)} s with the closing card, "${p.entry.hook}"`);
if (flag('plan')) process.exit(0);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shorts-'));
const browser = await chromium.launch();
const made = [];
let failed = 0;
try {
  for (const p of plans) {
    try {
      const r = await makeOne(browser, p, tmp);
      if (r.skipped) console.log(`${p.key}: skipped, ${r.skipped}`);
      else { made.push(p.key); console.log(`${p.key}: ${r.mb.toFixed(1)} MB (panel focus ${r.focus})`); }
    } catch (e) { failed += 1; console.error(`${p.key}: FAILED ${e.message}`); }
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (flag('upload') && made.length) {
  const { r2Config, uploadVideo } = await import('./lib/r2.mjs');
  const cfg = r2Config(loadEnv());
  if (!cfg) console.warn('R2 is not configured (/root/.r2.env); Shorts stay local only.');
  else for (const k of made) {
    try { await uploadVideo(cfg, path.join(OUT_ROOT, k), { log: () => {} }); console.log(`${k}: copied to R2`); } catch (e) { failed += 1; console.error(`${k}: R2 copy failed: ${e.message}`); }
  }
}
console.log(`\n${made.length} Short(s) made${failed ? `, ${failed} failed` : ''}.`);
process.exit(failed ? 1 : 0);
