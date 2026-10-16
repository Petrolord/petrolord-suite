/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';
import {
  finalTime, candidateTimes, frameScore, windowScores, bestWindow, pickFrame, thumbTextFromTitle, wordCount,
  lessonNumber, demoNumber, thumbSpec, SERIES_STYLE, INTRO_SECONDS,
} from '../lib/thumbs.mjs';

const allowlist = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai-employees/youtube/config/public-allowlist.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/thumbs.json'), 'utf8'));

// w x h RGB24 image filled by fn(x, y) -> [r, g, b]
const img = (w, h, fn) => {
  const b = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) b.set(fn(x, y), (y * w + x) * 3);
  return b;
};
const white = () => [250, 250, 250];
const chart = (x, y) => (((x >> 2) + (y >> 2)) % 2 ? [220, 40, 40] : [30, 60, 200]);

describe('frame times', () => {
  const rec = {
    timeline: [
      { id: 'open', start: 1, end: 10 },
      { id: 'a', start: 10, end: 20 },
      { id: 'tiny', start: 20, end: 21 },
      { id: 'b', start: 21, end: 41 },
      { id: 'close', start: 41, end: 50 },
    ],
    cuts: [{ from: 25, to: 35 }],
  };
  test('raw capture times move onto the finished video: minus cuts, plus the intro card', () => {
    expect(finalTime(10, rec)).toBe(10 + INTRO_SECONDS);
    expect(finalTime(40, rec)).toBe(30 + INTRO_SECONDS);
    expect(finalTime(30, rec)).toBe(25 + INTRO_SECONDS); // inside a cut lands on the cut point
  });
  test('one candidate per step, late in the step; opening, closing and short steps skipped', () => {
    const c = candidateTimes(rec);
    expect(c.map((x) => x.id)).toEqual(['a', 'b']);
    expect(c[0].t).toBeCloseTo(4.5 + 10 + 0.8 * 10, 3);
    // b runs 21..41 raw, 21..31 on the cut picture
    expect(c[1].t).toBeCloseTo(4.5 + 21 + 0.8 * 10, 3);
  });
});

describe('frame scoring', () => {
  test('a coloured, detailed frame beats plain white app chrome (negative control)', () => {
    const w = 32; const h = 18;
    expect(frameScore(img(w, h, chart), w, h)).toBeGreaterThan(frameScore(img(w, h, white), w, h) + 50);
    expect(frameScore(img(w, h, white), w, h)).toBeLessThan(1);
    expect(frameScore(Buffer.alloc(3), w, h)).toBe(0);
  });
  test('the busy side of the frame wins the window; several frames are summed', () => {
    const w = 40; const h = 10;
    const right = img(w, h, (x, y) => (x >= 24 ? chart(x, y) : white()));
    const left = img(w, h, (x, y) => (x < 16 ? chart(x, y) : white()));
    expect(bestWindow(right, w, h, { frac: 0.4 })).toBeGreaterThan(0.85);
    expect(bestWindow(left, w, h, { frac: 0.4 })).toBeLessThan(0.15);
    expect(windowScores(right, w, h, { frac: 0.4, steps: 4 })).toHaveLength(5);
    // two of three frames busy on the right
    expect(bestWindow([right, right, left], w, h, { frac: 0.4 })).toBeGreaterThan(0.5);
    expect(bestWindow(right, w, h, { frac: 1 })).toBe(0.5);
  });
  test('pickFrame: override step or time wins, else best score, ties to the earlier', () => {
    const scored = [{ id: 'a', t: 10, score: 5 }, { id: 'b', t: 20, score: 9 }, { id: 'c', t: 30, score: 9 }];
    expect(pickFrame(scored)).toEqual({ t: 20, id: 'b', reason: 'best score' });
    expect(pickFrame(scored, 'a')).toEqual({ t: 10, id: 'a', reason: 'override step' });
    expect(pickFrame([], 42.5)).toEqual({ t: 42.5, id: null, reason: 'override time' });
    expect(() => pickFrame(scored, 'nope')).toThrow(/not in the timeline/);
    expect(() => pickFrame([])).toThrow(/no candidate/);
  });
});

describe('thumbnail text and style', () => {
  test('text from a title: the headline before the colon or through the question mark, six words at most', () => {
    expect(thumbTextFromTitle('Does the Seismic See the Oil? QI Studio on the Ekene Field | Petrolord Suite')).toBe('Does the Seismic See the Oil?');
    expect(thumbTextFromTitle('Seismic QC: Bandwidth, Noise and Footprint | QI with Petrolord, Lesson 3')).toBe('Seismic QC');
    expect(wordCount(thumbTextFromTitle('From Pressure History to Oil in Place on the Field: x'))).toBe(5);
  });
  test('lesson and demo numbers from keys', () => {
    expect(lessonNumber('lesson-qi-a3')).toBe(3);
    expect(lessonNumber('lesson-a1')).toBe(1);
    expect(lessonNumber('lesson-rcp-a4')).toBe(4);
    expect(demoNumber('seis-02')).toBe(2);
  });
  test('demo and lesson series look different; the tag carries the number', () => {
    const demo = thumbSpec({ key: 'qi-02', series: { kind: 'demo', playlist: 'QI Studio' }, title: 'x', entry: { text: 'Tie Wells, Build *Angle Stacks*' } });
    const lesson = thumbSpec({ key: 'lesson-qi-a2', series: { kind: 'lesson', playlist: 'QI with Petrolord' }, title: 'x', entry: { text: 'The *Usability Matrix*' } });
    expect(demo).toMatchObject({ kind: 'demo', tag: 'Demo 2', chip: 'QI Studio', accent: SERIES_STYLE.demo.accent });
    expect(lesson).toMatchObject({ kind: 'lesson', tag: 'Lesson 2', chip: 'QI', accent: SERIES_STYLE.lesson.accent });
    expect(demo.accent).not.toBe(lesson.accent);
  });
  test('negative controls: members-only keys, too many words and em dashes are refused', () => {
    expect(() => thumbSpec({ key: 'lesson-qi-b4', series: null, title: 'x' })).toThrow(/not on the public allowlist/);
    expect(() => thumbSpec({ key: 'qi-01', series: { kind: 'demo', playlist: 'QI Studio' }, entry: { text: 'one two three four five six seven' } })).toThrow(/7 words/);
    expect(() => thumbSpec({ key: 'qi-01', series: { kind: 'demo', playlist: 'QI Studio' }, entry: { text: 'Oil \u2014 or not' } })).toThrow(/em dash/);
  });
  test('config: every entry is 3 to 6 words, clean copy, and names a public video', () => {
    for (const [key, e] of Object.entries(config.keys)) {
      const n = wordCount(e.text);
      expect([key, n >= 3 && n <= 6]).toEqual([key, true]);
      expect(e.text).not.toMatch(/[\u2014<>]/);
      if (e.frame != null) expect(['string', 'number']).toContain(typeof e.frame);
    }
    for (const key of Object.keys(config.keys)) {
      // a thumbnail is only made for an allowlisted key; round-2 keys join the allowlist in their own PR
      const listed = allowlist.series.some((s) => (s.keys || []).includes(key));
      if (listed) expect(thumbSpec({ key, series: allowlist.series.find((s) => s.keys.includes(key)), title: 'x', entry: config.keys[key] }).text).toBe(config.keys[key].text);
    }
    expect(fs.readFileSync(path.join(__dirname, '../config/thumbs.json'), 'utf8')).not.toMatch(/\u2014/);
  });
  test('config covers every public non-Short video on the allowlist', () => {
    const keys = allowlist.series.filter((s) => s.kind !== 'short').flatMap((s) => s.keys || []);
    for (const k of keys) expect([k, Boolean(config.keys[k])]).toEqual([k, true]);
  });
});
