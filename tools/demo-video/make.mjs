#!/usr/bin/env node
// node tools/demo-video/make.mjs <storyboard> [--stage tts|record|assemble|all] [--base-url URL]
//
//   tts       narration clips only (cached; cheap to re-run after a line changes)
//   record    tts + screen recording (needs Xvfb, Chrome and the demo account)
//   assemble  builds youtube.mp4, nape.mp4, captions and chapters from the last recording
//   all       the three in order (default)
//
// Output: $DEMO_VIDEO_OUT (default /root/demo-videos)/<storyboard id>/
// After assembling, the masters are copied to R2 when /root/.r2.env exists
// (--no-upload skips it; see r2.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv, OUT_ROOT } from './lib/env.mjs';
import { synthStoryboard } from './lib/tts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const opt = (k, dflt) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : dflt; };
if (!name) { console.error('usage: make.mjs <storyboard> [--stage tts|record|assemble|all] [--base-url URL]'); process.exit(2); }

const sb = (await import(pathToFileURL(path.join(HERE, 'storyboards', `${name}.mjs`)).href)).default;
const env = loadEnv();
const stage = opt('stage', 'all');
const baseUrl = opt('base-url', sb.baseUrl || env.DEMO_BASE_URL || 'http://127.0.0.1:4173');
const outDir = path.join(OUT_ROOT, sb.id);
fs.mkdirSync(outDir, { recursive: true });

console.log(`[${sb.id}] narration (${sb.steps.filter((s) => s.say).length} lines)`);
const clips = await synthStoryboard(sb, { apiKey: env.ELEVENLABS_API_KEY, cacheDir: path.join(OUT_ROOT, '.tts-cache') });
const talk = clips.reduce((a, c) => a + (c?.duration || 0), 0);
console.log(`[${sb.id}] narration ${talk.toFixed(1)} s`);
if (stage === 'tts') process.exit(0);

let rec;
if (stage === 'record' || stage === 'all') {
  const { recordStoryboard } = await import('./lib/record.mjs');
  console.log(`[${sb.id}] recording against ${baseUrl}`);
  rec = await recordStoryboard(sb, clips, { baseUrl, env, outDir });
} else {
  rec = JSON.parse(fs.readFileSync(path.join(outDir, 'timeline.json'), 'utf8'));
}
if (stage === 'assemble' || stage === 'all') {
  const { assemble } = await import('./lib/assemble.mjs');
  console.log(`[${sb.id}] assembling`);
  const r = await assemble(sb, clips, rec, { outDir });
  console.log(`[${sb.id}] done: ${r.duration.toFixed(1)} s, ${r.cues} subtitle cues -> ${outDir}`);
  const { r2Config, uploadVideo } = await import('./lib/r2.mjs');
  const cfg = r2Config(env);
  if (cfg && !args.includes('--no-upload')) {
    console.log(`[${sb.id}] copying masters to R2 (${cfg.bucket})`);
    // a failed upload never loses the cut; r2.mjs upload can retry it
    try { await uploadVideo(cfg, outDir); } catch (e) { console.warn(`[${sb.id}] R2 upload failed, retry with: node tools/demo-video/r2.mjs upload ${sb.id}\n  ${e.message}`); }
  }
}
