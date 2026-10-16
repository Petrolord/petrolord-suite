// Pure helpers for YouTube Shorts cut from the demo masters: reading the
// captions, turning a run of storyboard steps into a clip window that starts
// and ends on whole sentences, re-chunking the captions for a phone screen,
// the burned-in subtitle file, the vertical layout and the description.
// No file system or ffmpeg here; shorts.mjs does that. Unit tested in
// __tests__/shorts.test.js.
import { finalTime, INTRO_SECONDS } from './thumbs.mjs';

export const SHORT = Object.freeze({
  width: 1080,
  height: 1920,
  hookSeconds: 2,
  outroSeconds: 3,
  minTotal: 30,
  maxTotal: 60,
  panelTop: 350, // below the wordmark band; YouTube's own top controls sit above about 220 px
  captionTop: 1316, // keeps captions above the title and channel strip YouTube draws at the bottom
  captionMarginL: 70,
  captionMarginR: 170, // the like, comment and share column sits on the right
});

const T = (s) => {
  const m = String(s).trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : NaN;
};

/** youtube.srt to [{ start, end, text }] (text on one line). */
export function parseSrt(text) {
  return String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map((block) => {
    const lines = block.trim().split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return null;
    const [a, b] = lines[i].split('-->');
    const cue = { start: T(a), end: T(b), text: lines.slice(i + 1).join(' ').replace(/\s+/g, ' ').trim() };
    return Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.text ? cue : null;
  }).filter(Boolean);
}

/** Each storyboard step on the finished youtube.mp4 clock: [{ id, chapter, a, b }]. */
export function stepTimes(rec, intro = INTRO_SECONDS) {
  return (rec?.timeline || []).map((s) => ({ id: s.id, chapter: s.chapter || null, a: finalTime(s.start, rec, intro), b: finalTime(s.end, rec, intro) }));
}

/**
 * The clip for steps from..to: it starts just before the first caption that
 * begins inside the first step and ends just after the last caption that
 * begins inside the last step, so the Short opens and closes on whole
 * sentences. Returns { start, end, duration, total } where total adds the
 * closing card. Throws when the steps are unknown or out of order.
 */
export function clipWindow(steps, cues, { from, to, lead = 0.25, tail = 0.6 } = {}) {
  const i = steps.findIndex((s) => s.id === from);
  const j = steps.findIndex((s) => s.id === to);
  if (i < 0) throw new Error(`step "${from}" is not in the timeline`);
  if (j < 0) throw new Error(`step "${to}" is not in the timeline`);
  if (j < i) throw new Error(`step "${to}" comes before "${from}"`);
  const a = steps[i].a; const b = steps[j].b;
  const inside = cues.filter((c) => c.start >= a - 0.05 && c.start < b);
  if (!inside.length) throw new Error(`no narration between "${from}" and "${to}"`);
  const start = Math.max(0, inside[0].start - lead);
  const end = inside[inside.length - 1].end + tail;
  const duration = Number((end - start).toFixed(3));
  return { start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), duration, total: Number((duration + SHORT.outroSeconds).toFixed(3)) };
}

/** Whether a clip's total length is a Short we publish (30 to 60 s with the closing card). */
export function lengthProblem(win) {
  if (win.total < SHORT.minTotal) return `${win.total.toFixed(1)} s is under ${SHORT.minTotal} s`;
  if (win.total > SHORT.maxTotal) return `${win.total.toFixed(1)} s is over ${SHORT.maxTotal} s`;
  return null;
}

function wrapLines(words, maxChars) {
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= maxChars) cur = `${cur} ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Captions for the clip, on the clip's clock, re-chunked for a phone: at most
 * maxLines lines of maxChars. A long cue is split into parts that share its
 * time by character count. Cues outside the window are dropped and cues
 * crossing an edge are clipped to it.
 */
export function shortCues(cues, { start, end }, { maxChars = 22, maxLines = 2 } = {}) {
  const out = [];
  for (const c of cues) {
    if (c.end <= start || c.start >= end) continue;
    const s = Math.max(c.start, start) - start;
    const e = Math.min(c.end, end) - start;
    const lines = wrapLines(c.text.split(/\s+/).filter(Boolean), maxChars);
    const parts = [];
    for (let k = 0; k < lines.length; k += maxLines) parts.push(lines.slice(k, k + maxLines));
    const total = parts.reduce((n, p) => n + p.join(' ').length, 0) || 1;
    let at = s;
    for (const p of parts) {
      const d = ((e - s) * p.join(' ').length) / total;
      out.push({ start: Number(at.toFixed(3)), end: Number((at + d).toFixed(3)), lines: p });
      at += d;
    }
  }
  return out;
}

const assTime = (s) => {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000); const m = Math.floor((cs % 360000) / 6000); const x = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

/** The burned-in subtitle file: large white Inter on a dark box, top-aligned at captionTop. */
export function shortAss(cues, { fontSize = 62 } = {}) {
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${SHORT.width}\nPlayResY: ${SHORT.height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n`
    + '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
    + `Style: Short,Inter,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00140D0B,&H00140D0B,-1,0,0,0,100,100,0,0,3,18,0,8,${SHORT.captionMarginL},${SHORT.captionMarginR},${SHORT.captionTop},1\n\n`
    + '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  const clean = (l) => l.replace(/[{}\\]/g, '');
  return head + cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Short,,0,0,0,,${c.lines.map(clean).join('\\N')}`).join('\n') + '\n';
}

/** The app panel: a crop of w (fraction of the source width, full height) whose left edge is at focus of the free width. */
export function panelGeometry({ w = 0.75, focus = 0.5 } = {}) {
  const width = Math.min(1, Math.max(0.4, w));
  const x0 = Math.min(1, Math.max(0, focus)) * (1 - width);
  const panelHeight = 2 * Math.round((SHORT.width * 9) / (16 * width) / 2);
  return { w: width, x0: Number(x0.toFixed(4)), panelHeight, panelTop: SHORT.panelTop };
}

export const PARENT_URL_TOKEN = '{{parent_url}}';

/**
 * youtube-description.txt for a Short, in the kit's format: title, blank
 * line, body, Tags line. The parent's watch URL is filled in when the
 * parent has been uploaded; until then the placeholder stays and execute
 * resolves it at upload time.
 */
export function shortDescriptionFile({ hook, title, parentTitle, appName, tags = [] }) {
  const t = `${title} #Shorts`;
  const body = [
    hook,
    '',
    `A clip from the ${appName} demo "${parentTitle.replace(/\s*\|.*$/, '')}".`,
    `Full demo: ${PARENT_URL_TOKEN}`,
  ].join('\n');
  return `${t}\n\n${body}\n\nTags: ${[...tags, 'Shorts', 'Petrolord Suite'].join(', ')}\n`;
}
