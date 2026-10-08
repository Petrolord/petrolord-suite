// Screen capture of a real Chrome window on a virtual display.
// A 4-core host holds a clean 30 fps at 2560x1440 (4K live capture managed
// about 8 fps), so the page is 1920x1080 CSS pixels at device scale 1.3333,
// captured at 2560x1440 and upscaled to 3840x2160 when the video is finished.
// Chrome runs in --app mode, so there is no tab strip or address bar.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';

export const CAPTURE = { w: 2560, h: 1440, fps: 30, css: { w: 1920, h: 1080 }, scale: 2560 / 1920 };

export async function startDisplay(display = ':99') {
  const x = spawn('Xvfb', [display, '-screen', '0', `${CAPTURE.w}x${CAPTURE.h}x24`, '-nolisten', 'tcp', '-nocursor'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  process.env.DISPLAY = display;
  return { stop: () => x.kill() };
}

export async function openApp(url, { profileDir, overlayPath }) {
  fs.rmSync(profileDir, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false, viewport: null,
    args: [`--app=${url}`, '--window-position=0,0', `--window-size=${CAPTURE.css.w},${CAPTURE.css.h}`,
      `--force-device-scale-factor=${CAPTURE.scale}`, '--hide-scrollbars', '--disable-infobars', '--no-first-run',
      '--disable-features=Translate', '--lang=en-GB'],
  });
  await ctx.addInitScript({ path: overlayPath });
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page };
}

// Starts ffmpeg and resolves once ffmpeg reports progress, with the wall clock
// of the first captured frame: the timeline is measured from there.
export function startCapture(outFile) {
  const ff = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-framerate', String(CAPTURE.fps), '-video_size', `${CAPTURE.w}x${CAPTURE.h}`,
    '-draw_mouse', '0', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv444p', outFile],
  { stdio: ['pipe', 'ignore', 'pipe'] });
  let log = '';
  const closed = new Promise((r) => ff.on('close', r));
  const started = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ffmpeg did not start:\n${log.slice(-800)}`)), 15000);
    // ffmpeg reports progress about twice a second, so back the report's
    // frame count out of the clock: t0 = now - frames / fps.
    let done = false;
    ff.stderr.on('data', (b) => {
      log += b;
      const m = !done && /frame=\s*(\d+)/.exec(String(b));
      if (m && Number(m[1]) > 0) { done = true; clearTimeout(t); resolve(Date.now() - (Number(m[1]) / CAPTURE.fps) * 1000); }
    });
  });
  return {
    started,
    async stop() { ff.stdin.write('q'); await closed; return log; },
  };
}
