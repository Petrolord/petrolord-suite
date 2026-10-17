#!/usr/bin/env node
// node tools/demo-video/module.mjs <module> [--stage tts|compose] [--no-upload]
//
// A module video is a sequence of scenes, each an ordinary storyboard that
// make.mjs records on its own (node make.mjs <scene> --stage record), so one
// failed take costs one scene. This script then:
//   tts      makes (or reuses) every scene's narration and prints the lengths
//   compose  joins the recorded scenes with cards, captions, chapters and the
//            music bed (lib/compose.mjs): youtube.mp4, nape.mp4, review.mp4
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv, OUT_ROOT } from './lib/env.mjs';
import { synthStoryboard } from './lib/tts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const opt = (k, dflt) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : dflt; };
if (!name) { console.error('usage: module.mjs <module> [--stage tts|compose]'); process.exit(2); }
const load = async (n) => (await import(pathToFileURL(path.join(HERE, 'storyboards', `${n}.mjs`)).href)).default;

const mod = await load(name);
const env = loadEnv();
const stage = opt('stage', 'compose');
const scenes = {};
let talk = 0;
for (const it of mod.sequence.filter((x) => x.scene)) {
  let sb;
  try { sb = await load(it.scene); } catch (e) {
    if (stage !== 'tts') throw e;
    console.log(`${it.scene.padEnd(14)} NOT WRITTEN`); continue;
  }
  const clips = await synthStoryboard(sb, { apiKey: env.ELEVENLABS_API_KEY, cacheDir: path.join(OUT_ROOT, '.tts-cache') });
  const t = clips.reduce((a, c) => a + (c?.duration || 0), 0); talk += t;
  const rec = path.join(OUT_ROOT, sb.id, 'timeline.json');
  console.log(`${sb.id.padEnd(14)} narration ${t.toFixed(1).padStart(6)} s  ${fs.existsSync(rec) ? 'recorded' : 'NOT RECORDED'}`);
  scenes[it.scene] = { sb, clips };
}
console.log(`total narration ${talk.toFixed(1)} s`);
if (stage === 'tts') process.exit(0);

const outDir = path.join(OUT_ROOT, mod.id); fs.mkdirSync(outDir, { recursive: true });
const { composeModule } = await import('./lib/compose.mjs');
const r = await composeModule(mod, scenes, { outDir });
console.log(`[${mod.id}] done: ${r.total.toFixed(1)} s, ${r.cues} cues, ${r.chapters.length} chapters -> ${outDir}`);
if (!args.includes('--no-upload')) {
  const { r2Config, uploadVideo } = await import('./lib/r2.mjs');
  const cfg = r2Config(env);
  if (cfg) { try { await uploadVideo(cfg, outDir); } catch (e) { console.warn(`R2 upload failed: ${e.message}`); } }
}
