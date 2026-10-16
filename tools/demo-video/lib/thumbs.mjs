// Pure helpers for YouTube thumbnails: where to look in a finished video for
// a strong frame, how to score a frame, the 3 to 6 words of thumbnail text,
// and the series style. No file system, ffmpeg or browser here; thumbs.mjs
// does that. Unit tested in __tests__/thumbs.test.js.
import { cutTime } from './cuts.mjs';

export const INTRO_SECONDS = 4.5; // assemble.mjs default; no storyboard overrides it
export const THUMB = Object.freeze({ width: 1280, height: 720, maxBytes: 2 * 1024 * 1024 });

/** A raw-capture time on the finished youtube.mp4 clock. */
export function finalTime(rawT, rec, intro = INTRO_SECONDS) {
  return cutTime(rawT, rec?.cuts || []) + intro;
}

/**
 * Candidate frame times, one per step: late in the step (at `at` of its
 * length) so the action has settled and the result is on screen. The
 * opening and closing steps are skipped (they show the start page and the
 * sign-off), as are steps shorter than minSeconds.
 */
export function candidateTimes(rec, { intro = INTRO_SECONDS, at = 0.8, minSeconds = 3 } = {}) {
  const steps = rec?.timeline || [];
  const out = [];
  steps.forEach((s, i) => {
    if (i === 0 || i === steps.length - 1) return;
    const a = finalTime(s.start, rec, intro);
    const b = finalTime(s.end, rec, intro);
    if (!(b - a >= minSeconds)) return;
    out.push({ id: s.id, index: i, t: Number((a + (b - a) * at).toFixed(3)) });
  });
  return out;
}

/**
 * How much a frame has to look at, from raw RGB24 pixels: colourfulness
 * (Hasler and Suesstrunk 2003) plus luminance contrast plus edge density.
 * White app chrome scores low; a coloured chart, a log track or a seismic
 * section scores high.
 */
export function frameScore(rgb, width, height) {
  const n = width * height;
  if (!n || rgb.length < n * 3) return 0;
  let sRg = 0; let sYb = 0; let qRg = 0; let qYb = 0; let sL = 0; let qL = 0; let edges = 0;
  const lum = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const r = rgb[3 * i]; const g = rgb[3 * i + 1]; const b = rgb[3 * i + 2];
    const rg = r - g; const yb = 0.5 * (r + g) - b;
    sRg += rg; sYb += yb; qRg += rg * rg; qYb += yb * yb;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = l; sL += l; qL += l * l;
  }
  const m = (s) => s / n;
  const sd = (s, q) => Math.sqrt(Math.max(0, q / n - (s / n) ** 2));
  const colour = Math.hypot(sd(sRg, qRg), sd(sYb, qYb)) + 0.3 * Math.hypot(m(sRg), m(sYb));
  const contrast = sd(sL, qL);
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const i = y * width + x;
      if (Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + width]) > 40) edges += 1;
    }
  }
  const edgeDensity = edges / ((width - 1) * (height - 1));
  return Number((colour + 0.5 * contrast + 60 * edgeDensity).toFixed(4));
}

/**
 * Where the eye should go across a frame: the horizontal window (frac of
 * the width, full height) with the highest frameScore, as the object-position
 * fraction the thumbnail template takes (0 = left edge, 1 = right edge).
 * App screens put the chart or section on one side and a parameter panel on
 * the other, so the thumbnail shows the chart side.
 */
export function windowScores(rgb, width, height, { frac = 0.65, steps = 14 } = {}) {
  const ww = Math.max(2, Math.round(width * frac));
  if (ww >= width) return [frameScore(rgb, width, height)];
  const out = [];
  for (let k = 0; k <= steps; k += 1) {
    const x0 = Math.round(((width - ww) * k) / steps);
    const sub = new Uint8Array(ww * height * 3);
    for (let y = 0; y < height; y += 1) {
      const from = (y * width + x0) * 3;
      sub.set(rgb.subarray(from, from + ww * 3), y * ww * 3);
    }
    out.push(frameScore(sub, ww, height));
  }
  return out;
}

/** The window position (0..1) with the highest total score over one or more frames. */
export function bestWindow(frames, width, height, opts = {}) {
  const list = Array.isArray(frames) ? frames : [frames];
  let total = null;
  for (const f of list) {
    const sc = windowScores(f, width, height, opts);
    total = total ? total.map((v, i) => v + sc[i]) : sc;
  }
  if (!total || total.length < 2) return 0.5;
  let k = 0;
  for (let i = 1; i < total.length; i += 1) if (total[i] > total[k]) k = i;
  return Number((k / (total.length - 1)).toFixed(3));
}

/**
 * The frame to use: an override (a step id or a time in seconds) wins;
 * otherwise the best scored candidate, ties to the earlier one. Returns
 * { t, id, reason }.
 */
export function pickFrame(scored, override) {
  if (override != null) {
    if (typeof override === 'number') return { t: override, id: null, reason: 'override time' };
    const hit = scored.find((c) => c.id === override);
    if (!hit) throw new Error(`thumbnail override step "${override}" is not in the timeline`);
    return { t: hit.t, id: hit.id, reason: 'override step' };
  }
  if (!scored.length) throw new Error('no candidate frames');
  let best = scored[0];
  for (const c of scored) if (c.score > best.score) best = c;
  return { t: best.t, id: best.id, reason: 'best score' };
}

const STOP_TAIL = /\s*\|.*$/;

/**
 * Thumbnail text from a title when the config gives none: the headline
 * before the colon (keeping a question mark), at most six words.
 */
export function thumbTextFromTitle(title) {
  const head = String(title || '').replace(STOP_TAIL, '').trim();
  const q = head.indexOf('?');
  const c = head.indexOf(':');
  let part = head;
  if (q > -1 && (c === -1 || q < c)) part = head.slice(0, q + 1);
  else if (c > -1) part = head.slice(0, c);
  const words = part.split(/\s+/).filter(Boolean);
  return words.length <= 6 ? words.join(' ') : words.slice(0, 5).join(' ');
}

export const wordCount = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

/** Lesson number from a key: lesson-qi-a3 -> 3, lesson-a1 -> 1. */
export function lessonNumber(key) {
  const m = String(key).match(/-[a-z](\d+)$/);
  return m ? Number(m[1]) : null;
}

/** Demo number from a key: qi-02 -> 2. */
export function demoNumber(key) {
  const m = String(key).match(/-(\d{2})$/);
  return m ? Number(m[1]) : null;
}

export const SERIES_STYLE = Object.freeze({
  demo: { accent: '#e8b923', tag: 'Demo' },
  lesson: { accent: '#4fd1c5', tag: 'Lesson' },
});

/**
 * Everything the template needs for one key. series is the allowlist entry;
 * entry is the thumbs config entry ({ text, chip, frame }).
 */
export function thumbSpec({ key, series, title, entry = {} }) {
  if (!series) throw new Error(`${key} is not on the public allowlist; no thumbnail is made for it`);
  const kind = series.kind === 'lesson' ? 'lesson' : 'demo';
  const text = (entry.text || thumbTextFromTitle(title)).trim();
  const n = wordCount(text);
  if (n < 3 || n > 6) throw new Error(`${key}: thumbnail text "${text}" has ${n} words; use 3 to 6`);
  if (/\u2014/.test(text)) throw new Error(`${key}: thumbnail text has an em dash`);
  const chip = entry.chip || (kind === 'demo' ? series.playlist : series.playlist.replace(/ with Petrolord$/, ''));
  const num = kind === 'lesson' ? lessonNumber(key) : demoNumber(key);
  const style = SERIES_STYLE[kind];
  return { key, kind, text, chip, tag: num ? `${style.tag} ${num}` : style.tag, accent: style.accent };
}
