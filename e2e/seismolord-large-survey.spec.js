// Large-survey benchmark (Stream L). SKIPPED unless SEIS_BENCH=1, because
// it needs the synthetic 4.5 GB survey and its brick store:
//
//   node /root/seis-bench/gen-segy.mjs /root/seis-bench/out/survey.sgy
//   node --max-old-space-size=3000 tools/seismolord-bench/make-bricks.mjs
//   node tools/seismolord-bench/mock-storage.mjs &        # never Supabase
//   npx vite --port 5199 --host 127.0.0.1 &
//   SEIS_BENCH=1 E2E_BASE_URL=http://127.0.0.1:5199 \
//     SEIS_BENCH_SEGY=/root/seis-bench/out/survey.sgy \
//     npx playwright test e2e/seismolord-large-survey.spec.js
//
// The 10 Mbps test (target 4) starts its own shaped mock storage on port
// 8898 (SEIS_BENCH_SLOW_PORT); skip it with SEIS_BENCH_SLOW=0.
//
// The v4 display-copy tests need the v4 store (skip with SEIS_BENCH_V4=0):
//   node --experimental-specifier-resolution=node --max-old-space-size=3000 \
//     tools/seismolord-bench/make-bricks-v4.mjs --out /root/seis-bench/out/v4
// They start their own mock storage on 8897 (full speed) and 8896
// (SEIS_BENCH_SLOW_MBPS).
//
// It drives /dev/seismolord-largesurvey, which runs the real viewer path:
// ?mode=after is the slice worker and its sources, ?mode=before is the
// pre-Stream-L main-thread cache and all-bricks-at-once assembly.
//
// Memory is sampled from /proc every 100 ms for every Chromium process
// this test started. "tab" is the largest renderer process (the page, its
// workers and their buffers: what target 5 is about and what the
// BASELINE's "peak renderer (tab) RSS" measured); "all" adds the browser,
// GPU and utility processes (RSS summed, so shared pages count more than
// once; it is an upper bound).

import fs from 'fs';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import { test, expect, chromium } from '@playwright/test';

const RUN = process.env.SEIS_BENCH === '1';
const SEGY = process.env.SEIS_BENCH_SEGY || '/root/seis-bench/out/survey.sgy';
const STORAGE = process.env.SEIS_BENCH_STORAGE || 'http://127.0.0.1:8899';
const DEVICE_MEMORY = Number(process.env.SEIS_BENCH_DEVICE_MEMORY || 8);
const SLOW = process.env.SEIS_BENCH_SLOW !== '0';
const SLOW_PORT = Number(process.env.SEIS_BENCH_SLOW_PORT || 8898);
const SLOW_MBPS = Number(process.env.SEIS_BENCH_SLOW_MBPS || 10);
// Drop a file from the page cache so the two modes are measured from the
// same (cold) starting point: SEIS_BENCH_COLD=1 SEIS_BENCH_BRICKS=<file>.
const COLD = process.env.SEIS_BENCH_COLD === '1';
const BRICKS_FILE = process.env.SEIS_BENCH_BRICKS || '/root/seis-bench/out/bricks-v1.bin';
const MANIFEST_FILE = process.env.SEIS_BENCH_MANIFEST || '/root/seis-bench/out/bench-manifest.json';
const V4 = process.env.SEIS_BENCH_V4 !== '0';
const V4_STORE = process.env.SEIS_BENCH_V4_STORE || '/root/seis-bench/out/v4';
const V4_VOLUME = 'bench-v4';

/** Start a mock storage server; resolves once it listens. */
async function startStorage(args) {
  const server = spawn(process.execPath, [
    path.join(process.cwd(), 'tools/seismolord-bench/mock-storage.mjs'), ...args,
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('exit', (c) => reject(new Error(`mock storage exited ${c}`)));
  });
  return server;
}
const evict = (file) => {
  try {
    execFileSync('python3', ['-c',
      'import os,sys\nfd=os.open(sys.argv[1],os.O_RDONLY)\nos.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)\nos.close(fd)',
      file]);
  } catch { /* best effort */ }
};

const MID_INLINE = 355;
const MID_XLINE = 438;
const MID_TIME = 875;
const MB = 1024 * 1024;

test.describe(RUN ? 'Seismolord large-survey benchmark' : 'Seismolord large-survey benchmark (set SEIS_BENCH=1)', () => {
  test.skip(!RUN, 'benchmark: set SEIS_BENCH=1 with the synthetic survey in place');
  test.setTimeout(20 * 60 * 1000);

  /** Chromium processes that exist right now: pid -> type. */
  const chromeProcs = () => {
    const out = new Map();
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8');
        if (!/ms-playwright|chrome|headless_shell/.test(cmd)) continue;
        const type = /--type=([a-z-]+)/.exec(cmd);
        out.set(Number(d), type ? type[1] : 'browser');
      } catch { /* gone */ }
    }
    return out;
  };

  const rssBytes = (pid) => {
    try {
      return Number(fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1]) * 4096;
    } catch { return 0; }
  };

  /**
   * Peak resident memory while `fn` runs, in MB: `tabMb` is the largest
   * renderer process, `allMb` every process this test started. The pids
   * come from a diff against the processes that existed before the
   * browser was launched (browser.process() is null in this environment),
   * refreshed every second so late processes are counted too.
   */
  const withPeakRss = async (fn) => {
    let procs = new Map();
    let lastScan = 0;
    let tab = 0;
    let all = 0;
    const sample = () => {
      const now = Date.now();
      if (now - lastScan > 1000) {
        procs = new Map([...chromeProcs()].filter(([pid]) => !baselinePids.has(pid)));
        lastScan = now;
      }
      let sum = 0;
      let biggestRenderer = 0;
      for (const [pid, type] of procs) {
        const r = rssBytes(pid);
        sum += r;
        if (type === 'renderer' && r > biggestRenderer) biggestRenderer = r;
      }
      if (sum > all) all = sum;
      if (biggestRenderer > tab) tab = biggestRenderer;
    };
    sample();
    const timer = setInterval(sample, 100);
    try {
      const value = await fn();
      sample();
      return {
        value,
        tabMb: Math.round(tab / MB),
        allMb: Math.round(all / MB),
        processes: procs.size,
      };
    } finally {
      clearInterval(timer);
    }
  };

  const openHarness = async (page, params) => {
    await page.addInitScript((dm) => {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => dm, configurable: true });
    }, DEVICE_MEMORY);
    const qs = new URLSearchParams({ deviceMemory: String(DEVICE_MEMORY), ...params }).toString();
    await page.goto(`/dev/seismolord-largesurvey?${qs}`);
    await page.waitForFunction(() => Boolean(window.__seisBench));
    expect(await page.evaluate(() => window.__seisBench.budgetBytes))
      .toBe(DEVICE_MEMORY >= 16 ? 512 * MB : 256 * MB);
  };

  const round = (v) => (typeof v === 'number' ? Math.round(v) : v);
  const report = (title, rows) => {
    process.stdout.write(`\n### ${title}\n${JSON.stringify(rows, (k, v) => round(v), 1)}\n`);
  };

  // launched here rather than through the page fixture so the benchmark
  // can tell this browser's processes from everything else on the box
  let browser;
  let page;
  let crashed = null;
  let baselinePids = new Set();
  test.beforeEach(async ({ baseURL }) => {
    if (COLD) { evict(BRICKS_FILE); evict(SEGY); }
    baselinePids = new Set(chromeProcs().keys());
    crashed = null;
    browser = await chromium.launch();
    page = await browser.newPage({ baseURL });
    // a renderer that dies (out of memory, say) is reported as such
    // rather than as a closed page
    page.on('crash', () => { crashed = 'the renderer process crashed'; });
    page.on('pageerror', (e) => process.stdout.write(`\npageerror: ${e.message}\n`));
  });
  test.afterEach(async () => {
    await browser.close();
    expect(crashed, 'renderer crash').toBeNull();
  });

  test('targets 1, 2 and 5: from the local file, before any conversion', async () => {
    await openHarness(page, { mode: 'after' });
    await page.setInputFiles('[data-testid="segy-file"]', SEGY);
    const { value, tabMb, allMb } = await withPeakRss(() => page.evaluate(async ({ il, xl }) => {
      const b = window.__seisBench;
      // as in the import dialog: the preview scan starts with the view
      b.startPreviewScan();
      const open = await b.openLocal();
      const first = await b.show('inline', il);
      const next = await b.show('inline', il + 1);
      const back = await b.show('inline', il - 1);
      const cross = await b.show('crossline', xl);
      const crossNext = await b.show('crossline', xl + 1);
      let timeError = null;
      try { await b.show('time', 875); } catch (e) { timeError = e.code || e.message; }
      const stats = await b.stats();
      const preview = await b.previewDone();
      return {
        open, first, next, back, cross, crossNext, timeError, stats, preview,
      };
    }, { il: MID_INLINE, xl: MID_XLINE }));
    report('local file (after)', { ...value, tabMb, allMb });

    // target 1: first inline on screen under 10 s from the file being chosen
    expect(value.open.indexMs + value.first.onScreenMs).toBeLessThan(10000);
    // target 2: the next slice under 1 s from cache, under 3 s uncached
    expect(value.next.onScreenMs).toBeLessThan(1000);
    expect(value.cross.onScreenMs).toBeLessThan(3000);
    expect(value.crossNext.onScreenMs).toBeLessThan(3000);
    // time slices are refused with the conversion code, never a spinner
    expect(value.timeError).toBe('TIME_SLICE_NEEDS_CONVERSION');
    expect(value.preview.error).toBeUndefined();
    // target 5: the tab stays under 1.5 GB
    expect(tabMb).toBeLessThan(1500);
  });

  for (const mode of ['before', 'after']) {
    test(`targets 2, 3 and 5 from the server bricks (${mode})`, async () => {
      await openHarness(page, { mode, storage: STORAGE });
      // one evaluate per step, so each step has its own memory peak
      const steps = [
        ['first', 'inline', MID_INLINE],
        ['next', 'inline', MID_INLINE + 1],
        ['back', 'inline', MID_INLINE],
        ['far', 'inline', MID_INLINE + 40],
        ['cross', 'crossline', MID_XLINE],
        ['crossNext', 'crossline', MID_XLINE + 1],
        ['time', 'time', MID_TIME],
        ['timeNext', 'time', MID_TIME + 1],
      ];
      const serverBefore = await page.evaluate(() => window.__seisBench.serverStats());
      await page.evaluate(() => window.__seisBench.openBricks());
      const value = {};
      let tabMb = 0;
      let allMb = 0;
      const note = (name, r) => {
        value[name] = { ...r.value, tabMb: r.tabMb };
        tabMb = Math.max(tabMb, r.tabMb);
        allMb = Math.max(allMb, r.allMb);
      };
      for (const [name, o, idx] of steps) {
        // eslint-disable-next-line no-await-in-loop
        note(name, await withPeakRss(() => page.evaluate(
          ({ o: oo, idx: ii }) => window.__seisBench.show(oo, ii), { o, idx },
        )));
      }
      // the 3D view: three planes at once
      note('cube', await withPeakRss(() => page.evaluate(async ({ il, xl, t }) => {
        const b = window.__seisBench;
        const t0 = performance.now();
        await Promise.all([
          b.show('inline', il, { together: true }),
          b.show('crossline', xl, { together: true }),
          b.show('time', t, { together: true }),
        ]);
        return { onScreenMs: performance.now() - t0 };
      }, { il: MID_INLINE + 80, xl: MID_XLINE + 80, t: MID_TIME + 200 })));
      value.stats = await page.evaluate(() => window.__seisBench.stats());
      // this test's own share of the server's work
      value.server = await page.evaluate(() => window.__seisBench.serverStats())
        .then((a) => ({ bricks: a.bricks - serverBefore.bricks, bytes: a.bytes - serverBefore.bytes }));
      report(`server bricks (${mode})`, { ...value, tabMb, allMb });
      if (mode === 'after') {
        // target 2 from cache: the neighbour cut from the same bricks and
        // the slice just left
        expect(value.next.onScreenMs).toBeLessThan(1000);
        expect(value.back.onScreenMs).toBeLessThan(1000);
        // target 3: a time slice after conversion
        expect(value.time.onScreenMs).toBeLessThan(5000);
        // Target 2 uncached (under 3 s) is NOT met on v1 bricks: an inline
        // is 392 MiB of float32 bricks and loopback alone takes about 4 to
        // 6 s here. It is met on the v4 display copy (the 'v4 display
        // copy' tests below). What is asserted here is that it lands,
        // inside the budget.
        expect(value.first.onScreenMs).toBeLessThan(20000);
        expect(value.stats.peakBytes).toBeLessThanOrEqual(value.stats.budgetBytes);
        expect(tabMb).toBeLessThan(1500);                  // target 5
      }
    });
  }

  test.describe('over a 10 Mbps link', () => {
    test.skip(!SLOW, 'SEIS_BENCH_SLOW=0');
    let server;
    test.beforeAll(async () => {
      server = spawn(process.execPath, [
        path.join(process.cwd(), 'tools/seismolord-bench/mock-storage.mjs'),
        '--port', String(SLOW_PORT), '--mbps', String(SLOW_MBPS),
        '--bricks', BRICKS_FILE, '--manifest', MANIFEST_FILE,
      ], { stdio: ['ignore', 'pipe', 'inherit'] });
      await new Promise((resolve, reject) => {
        server.stdout.once('data', resolve);
        server.once('exit', (c) => reject(new Error(`mock storage exited ${c}`)));
      });
    });
    test.afterAll(() => { server?.kill(); });

    test('target 4: first inline from the server over 10 Mbps (v1 bricks)', async () => {
      await openHarness(page, { mode: 'after', storage: `http://127.0.0.1:${SLOW_PORT}` });
      const { value, tabMb, allMb } = await withPeakRss(() => page.evaluate(async ({ il }) => {
        const b = window.__seisBench;
        const open = await b.openBricks();
        let first;
        let error = null;
        try { first = await b.show('inline', il); } catch (e) { error = e.code || e.message; }
        const next = error ? null : await b.show('inline', il + 1);
        return {
          open, first, next, error, stats: await b.stats(),
        };
      }, { il: MID_INLINE }));
      report(`server bricks over ${SLOW_MBPS} Mbps (after)`, { ...value, tabMb, allMb });
      // Target 4 (under 5 s) is NOT met on v1 bricks: 392 MiB at 10 Mbps
      // is about 330 s of transfer whatever the viewer does. It is met on
      // the v4 display levels (the 'v4 display copy' tests below). What Stream L owns and asserts: the
      // slice lands (its timeout counts silence, and every brick re-arms
      // it) and the tab stays inside target 5.
      expect(value.error).toBeNull();
      expect(value.next.onScreenMs).toBeLessThan(1000);
      expect(tabMb).toBeLessThan(1500);
    });
  });
  test.describe('v4 display copy', () => {
    test.skip(!V4, 'SEIS_BENCH_V4=0');
    const FAST_PORT = 8897;
    const V4_SLOW_PORT = 8896;
    let fast;
    let slow;
    test.beforeAll(async () => {
      fast = await startStorage(['--port', String(FAST_PORT), '--store', V4_STORE, '--volume', V4_VOLUME]);
      slow = await startStorage(['--port', String(V4_SLOW_PORT), '--store', V4_STORE, '--volume', V4_VOLUME,
        '--mbps', String(SLOW_MBPS)]);
    });
    test.afterAll(() => { fast?.kill(); slow?.kill(); });

    test('targets 2, 3 and 5 from the display copy (full speed)', async () => {
      await openHarness(page, { mode: 'after', storage: `http://127.0.0.1:${FAST_PORT}`, volume: V4_VOLUME });
      const steps = [
        ['first', 'inline', MID_INLINE],
        ['next', 'inline', MID_INLINE + 1],
        ['back', 'inline', MID_INLINE],
        ['far', 'inline', MID_INLINE + 40],
        ['farther', 'inline', MID_INLINE + 120],
        ['cross', 'crossline', MID_XLINE],
        ['crossNext', 'crossline', MID_XLINE + 1],
        ['time', 'time', MID_TIME],
        ['timeNext', 'time', MID_TIME + 1],
      ];
      const serverBefore = await page.evaluate(() => window.__seisBench.serverStats());
      await page.evaluate(() => window.__seisBench.openBricks());
      const value = {};
      let tabMb = 0;
      let allMb = 0;
      for (const [name, o, idx] of steps) {
        // eslint-disable-next-line no-await-in-loop
        const r = await withPeakRss(() => page.evaluate(
          ({ o: oo, idx: ii }) => window.__seisBench.show(oo, ii), { o, idx },
        ));
        value[name] = { ...r.value, tabMb: r.tabMb };
        tabMb = Math.max(tabMb, r.tabMb);
        allMb = Math.max(allMb, r.allMb);
      }
      value.stats = await page.evaluate(() => window.__seisBench.stats());
      value.server = await page.evaluate(() => window.__seisBench.serverStats())
        .then((a) => ({ bricks: a.bricks - serverBefore.bricks, bytes: a.bytes - serverBefore.bytes }));
      report('v4 display copy (full speed)', { ...value, tabMb, allMb });
      expect(value.first.codec).toBe('u8');
      // target 2 uncached: an inline and a crossline nobody asked for yet
      expect(value.first.onScreenMs).toBeLessThan(3000);
      expect(value.far.onScreenMs).toBeLessThan(3000);
      expect(value.farther.onScreenMs).toBeLessThan(3000);
      expect(value.cross.onScreenMs).toBeLessThan(3000);
      // target 2 cached
      expect(value.next.onScreenMs).toBeLessThan(1000);
      expect(value.back.onScreenMs).toBeLessThan(1000);
      // target 3
      expect(value.time.onScreenMs).toBeLessThan(5000);
      // target 5
      expect(value.stats.peakBytes).toBeLessThanOrEqual(value.stats.budgetBytes);
      expect(tabMb).toBeLessThan(1500);
    });

    test(`target 4: first inline over ${SLOW_MBPS} Mbps from the display copy`, async () => {
      await openHarness(page, { mode: 'after', storage: `http://127.0.0.1:${V4_SLOW_PORT}`, volume: V4_VOLUME });
      const { value, tabMb, allMb } = await withPeakRss(() => page.evaluate(async ({ il }) => {
        const b = window.__seisBench;
        const before = await b.serverStats();
        const open = await b.openBricks();
        const first = await b.show('inline', il);
        const next = await b.show('inline', il + 1);
        const after = await b.serverStats();
        return {
          open, first, next, server: { bricks: after.bricks - before.bricks, bytes: after.bytes - before.bytes },
        };
      }, { il: MID_INLINE }));
      report(`v4 display copy over ${SLOW_MBPS} Mbps`, { ...value, tabMb, allMb });
      // target 4: the first inline is on screen (coarsest level) under 5 s
      expect(value.first.partialLevel).toBeGreaterThan(0);
      expect(value.first.partialOnScreenMs).toBeLessThan(5000);
      // it sharpens to the full-resolution display slice, and the next
      // inline is cut from the same bricks
      expect(value.first.level).toBe(0);
      expect(value.next.onScreenMs).toBeLessThan(1000);
      expect(tabMb).toBeLessThan(1500);
    });
  });
});
