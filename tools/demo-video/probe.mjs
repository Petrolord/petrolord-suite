// Dry run for writing narration: plays a probe module's `probe(d, shared, log)`
// in the same browser setup as a recording, with no capture and no audio, and
// prints whatever it logs (zone card figures, plot readouts).
// node tools/demo-video/probe.mjs <path/to/probe.mjs> [--base-url URL]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv, OUT_ROOT } from './lib/env.mjs';
import { startDisplay, openApp } from './lib/capture.mjs';
import { makeDirector } from './lib/director.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const i = args.indexOf('--base-url');
const baseUrl = i >= 0 ? args[i + 1] : 'http://127.0.0.1:4173';
const mod = (await import(pathToFileURL(path.resolve(file)).href)).default;
const env = loadEnv();
const disp = await startDisplay(':98'); // not :99, so a probe can run beside a recording on another well
const { ctx, page } = await openApp(`${baseUrl}/login`, { profileDir: path.join(OUT_ROOT, '.probe-profile'), overlayPath: path.join(HERE, 'lib', 'overlay.js'), css: mod.viewport || { w: 1440, h: 810 } });
const d = makeDirector(page);
d.sleep = d.sleep || ((ms) => page.waitForTimeout(ms));
const shared = { baseUrl, env, values: {} };
try {
  await mod.probe(d, shared, (...a) => console.log(...a));
} catch (e) {
  console.error('probe failed:', e.message);
  await page.screenshot({ path: path.join(OUT_ROOT, 'probe-fail.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await ctx.close().catch(() => {});
  disp.stop();
}
