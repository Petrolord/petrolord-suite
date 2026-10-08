// Plays a storyboard in a real browser while the screen is captured.
// Sync is by construction: each step starts its action, its narration starts
// `lead` seconds later, and the next step waits until the narration (plus a
// short tail) has finished. The timeline records when each step's narration
// starts, and the assembler drops each clip at exactly that time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDisplay, openApp, startCapture } from './capture.mjs';
import { makeDirector } from './director.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function recordStoryboard(sb, clips, { baseUrl, env, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const disp = await startDisplay();
  const { ctx, page } = await openApp(`${baseUrl}/login`, { profileDir: path.join(outDir, 'profile'), overlayPath: path.join(HERE, 'overlay.js') });
  const d = makeDirector(page);
  const shared = { baseUrl, env, values: {} };
  let cap;
  try {
    await sb.setup(d, shared); // log in and reach the opening screen, not filmed
    cap = startCapture(path.join(outDir, 'raw.mkv'));
    const t0 = await cap.started;
    const now = () => (Date.now() - t0) / 1000;
    await d.sleep((sb.leadIn ?? 1.0) * 1000);
    const timeline = [];
    for (let i = 0; i < sb.steps.length; i++) {
      const s = sb.steps[i]; const clip = clips[i];
      const start = now(); const sayAt = start + (s.lead ?? 0.25);
      if (s.chapter) { await d.lowerThird(s.chapter, s.chapterSub || ''); setTimeout(() => d.lowerThird(null).catch(() => {}), (s.chapterHold ?? 4.5) * 1000); }
      if (s.actAfter) await d.sleep(Math.max(0, (sayAt + s.actAfter - now()) * 1000));
      if (s.do) await s.do(d, shared);
      const end = Math.max(now(), sayAt + (clip?.duration ?? 0) + (s.tail ?? 0.4)) + (s.hold ?? 0);
      await d.sleep(Math.max(0, (end - now()) * 1000));
      timeline.push({ id: s.id, chapter: s.chapter || null, start, sayAt, end: now() });
      process.stdout.write(`  step ${s.id} ${start.toFixed(1)}s -> ${now().toFixed(1)}s\n`);
    }
    await d.sleep((sb.leadOut ?? 1.2) * 1000);
    await cap.stop();
    cap = null;
    fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ storyboard: sb.id, timeline, values: shared.values }, null, 2));
    return { timeline, values: shared.values };
  } finally {
    if (cap) await cap.stop().catch(() => {});
    await ctx.close().catch(() => {});
    disp.stop();
  }
}
