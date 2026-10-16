/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';
import {
  SHORT, parseSrt, stepTimes, clipWindow, lengthProblem, shortCues, shortAss, panelGeometry, shortDescriptionFile, PARENT_URL_TOKEN,
} from '../lib/shorts.mjs';
import { seriesFor, isShortKey, parseDescriptionFile, LIMITS, copyIssues } from '../../ai-employees/youtube/lib/listing.mjs';

const allowlist = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai-employees/youtube/config/public-allowlist.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/shorts.json'), 'utf8'));

const SRT = `1
00:00:06,050 --> 00:00:10,125
This is Petrophysics Studio,
part of the Petrolord Suite.

2
00:00:21,094 --> 00:00:24,825
On the left are the wells
in the shared registry.

3
00:00:40,000 --> 00:00:52,000
Net pay is now 31 ft, which agrees with the oil column and the net-to-gross of this sand.

4
00:01:10,500 --> 00:01:14,000
In the next video we check it.
`;

const rec = {
  timeline: [
    { id: 'open', start: 1, end: 15 },
    { id: 'well', start: 15, end: 33 },
    { id: 'result', start: 33, end: 60 },
    { id: 'close', start: 60, end: 75 },
  ],
};

describe('captions and windows', () => {
  const cues = parseSrt(SRT);
  test('parseSrt reads times and joins the lines', () => {
    expect(cues).toHaveLength(4);
    expect(cues[0]).toEqual({ start: 6.05, end: 10.125, text: 'This is Petrophysics Studio, part of the Petrolord Suite.' });
    expect(parseSrt('garbage')).toEqual([]);
  });

  test('a window starts before the first sentence of the first step and ends after the last of the last step', () => {
    const steps = stepTimes(rec);
    expect(steps[1]).toMatchObject({ id: 'well', a: 19.5, b: 37.5 });
    const w = clipWindow(steps, cues, { from: 'well', to: 'result' });
    expect(w.start).toBeCloseTo(21.094 - 0.25, 3);
    expect(w.end).toBeCloseTo(52 + 0.6, 3);
    expect(w.total).toBeCloseTo(w.duration + SHORT.outroSeconds, 3);
    expect(lengthProblem(w)).toBeNull();
  });

  test('negative controls: unknown or reversed steps, silent steps, and lengths outside 30 to 60 s', () => {
    const steps = stepTimes(rec);
    expect(() => clipWindow(steps, cues, { from: 'nope', to: 'result' })).toThrow(/not in the timeline/);
    expect(() => clipWindow(steps, cues, { from: 'result', to: 'well' })).toThrow(/comes before/);
    expect(() => clipWindow(steps, [], { from: 'well', to: 'well' })).toThrow(/no narration/);
    expect(lengthProblem({ total: 20 })).toMatch(/under 30/);
    expect(lengthProblem({ total: 75 })).toMatch(/over 60/);
  });

  test('phone captions: at most two lines of 22 characters, inside the window, on the clip clock', () => {
    const win = { start: 20, end: 53 };
    const sc = shortCues(cues, win);
    expect(sc.length).toBeGreaterThan(2);
    for (const c of sc) {
      expect(c.lines.length).toBeLessThanOrEqual(2);
      for (const l of c.lines) expect(l.length).toBeLessThanOrEqual(22);
      expect(c.start).toBeGreaterThanOrEqual(0);
      expect(c.end).toBeLessThanOrEqual(33.001);
      expect(c.end).toBeGreaterThan(c.start);
    }
    // the long cue is shared out over its own time, in order
    const long = sc.filter((c) => c.start >= 19.9);
    expect(long[0].start).toBeCloseTo(20, 2);
    expect(long[long.length - 1].end).toBeCloseTo(32, 2);
    expect(sc.map((c) => c.lines.join(' ')).join(' ')).toMatch(/^On the left are the wells in the shared registry\. Net pay is now 31 ft/);
    // cues outside the window are dropped (negative control)
    expect(sc.some((c) => /Petrophysics Studio|next video/.test(c.lines.join(' ')))).toBe(false);
  });

  test('the subtitle file is 1080x1920, top-aligned in the safe area, with no override braces from the text', () => {
    const ass = shortAss([{ start: 0, end: 1.5, lines: ['Net pay {is}', 'now 31 ft'] }]);
    expect(ass).toMatch(/PlayResX: 1080\nPlayResY: 1920/);
    expect(ass).toMatch(new RegExp(`,8,${SHORT.captionMarginL},${SHORT.captionMarginR},${SHORT.captionTop},`));
    expect(ass).toMatch(/Dialogue: 0,0:00:00\.00,0:00:01\.50,Short,,0,0,0,,Net pay is\\Nnow 31 ft/);
  });

  test('panel geometry keeps the crop inside the frame and the panel above the captions', () => {
    const g = panelGeometry({ w: 0.65, focus: 1 });
    expect(g.x0 + g.w).toBeCloseTo(1, 4);
    expect(g.panelTop + g.panelHeight).toBeLessThan(SHORT.captionTop);
    expect(panelGeometry({ w: 0.1, focus: -1 })).toMatchObject({ w: 0.4, x0: 0 });
    expect(g.panelHeight % 2).toBe(0);
  });
});

describe('description and config', () => {
  test('the description links the parent through the placeholder and parses as a kit file', () => {
    const text = shortDescriptionFile({ hook: 'Same logs, net pay doubled. Why?', title: 'Same logs, net pay doubled. Why? | Petrophysics Studio', parentTitle: 'From Raw Logs to Net Pay | Petrolord Suite', appName: 'Petrophysics Studio', tags: ['petrophysics'] });
    const p = parseDescriptionFile(text);
    expect(p.title).toBe('Same logs, net pay doubled. Why? | Petrophysics Studio #Shorts');
    expect(p.body).toContain(`Full demo: ${PARENT_URL_TOKEN}`);
    expect(p.body).toContain('"From Raw Logs to Net Pay"');
    expect(p.tags).toEqual(['petrophysics', 'Shorts', 'Petrolord Suite']);
    expect(copyIssues(text)).toEqual([]);
  });

  test('config: hooks are short clean copy and titles fit YouTube', () => {
    for (const [parent, list] of Object.entries(config.shorts)) {
      const ns = list.map((s) => s.n);
      expect(new Set(ns).size).toBe(ns.length);
      for (const s of list) {
        expect(s.hook.length).toBeLessThanOrEqual(48);
        expect(copyIssues(s.hook)).toEqual([]);
        expect(s.hook).not.toMatch(/\u2014/);
        expect(`${s.hook} | Material Balance Studio #Shorts`.length).toBeLessThanOrEqual(LIMITS.title);
        expect(typeof s.from).toBe('string');
        expect(typeof s.to).toBe('string');
        expect(parent).toMatch(/^[a-z]+-\d{2}$/);
      }
    }
  });

  test('config: Shorts are cut from demos only, and every listed Short key has a config entry', () => {
    for (const parent of Object.keys(config.shorts)) {
      expect(parent).not.toMatch(/^lesson-/);
      const s = seriesFor(allowlist, parent);
      // a parent still waiting for its allowlist PR is simply not public yet
      if (s) expect(s.kind).toBe('demo');
    }
    const listedShorts = allowlist.series.filter((s) => s.kind === 'short').flatMap((s) => s.keys);
    for (const k of listedShorts) {
      const m = k.match(/^(.+)-short(\d+)$/);
      expect(m).toBeTruthy();
      expect((config.shorts[m[1]] || []).some((s) => s.n === Number(m[2]))).toBe(true);
      expect(isShortKey(allowlist, k)).toBe(true);
    }
  });
});
