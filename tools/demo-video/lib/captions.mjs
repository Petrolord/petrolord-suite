// Subtitles from the narration itself. ElevenLabs returns a start and end
// time for every character, so cues are exact without speech recognition.
//
// wordsFromAlignment: characters -> words with times (seconds, clip-relative).
// buildCues: words of every step, shifted by the step's start on the video
// timeline, grouped into cues of at most two lines of maxChars each. A cue
// breaks early at sentence ends and never runs longer than maxDur seconds.

export function wordsFromAlignment(al) {
  const { characters, character_start_times_seconds: st, character_end_times_seconds: en } = al;
  const words = [];
  let cur = null;
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (/\s/.test(c)) { if (cur) { words.push(cur); cur = null; } continue; }
    if (!cur) cur = { text: '', start: st[i], end: en[i] };
    cur.text += c;
    cur.end = en[i];
  }
  if (cur) words.push(cur);
  return words;
}

// Words of a caption text that differs from the spoken words (numbers as
// digits, "Rw" for "R w"), spread over the clip by character position. The
// clip's own timing still bounds the cue: it starts when the voice starts
// and ends when it ends.
export function wordsFromText(text, startSec, endSec) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const total = Math.max(1, words.reduce((a, w) => a + w.length, 0) + words.length - 1);
  const span = Math.max(0.1, endSec - startSec);
  let at = 0;
  return words.map((w) => {
    const s = startSec + (at / total) * span;
    const e = startSec + ((at + w.length) / total) * span;
    at += w.length + 1;
    return { text: w, start: s, end: e };
  });
}

function wrap2(text, maxChars) {
  if (text.length <= maxChars) return text;
  const words = text.split(' ');
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '); const b = words.slice(k).join(' ');
    const score = Math.max(a.length, b.length);
    if (!best || score < best.score) best = { score, s: `${a}\n${b}` };
  }
  return best.s;
}

export function buildCues(steps, { maxChars = 42, maxDur = 6, minGap = 0.04 } = {}) {
  // Each sentence is split into the fewest cues that keep to two lines and
  // maxDur, and the words are shared out evenly between them, so a long
  // sentence never leaves a one-word tail ("API.") on a cue of its own.
  const cues = [];
  const textLen = (ws) => ws.map((w) => w.text).join(' ').length;
  for (const step of steps) {
    const sentences = [];
    let cur = [];
    for (const w of step.words) { cur.push(w); if (/[.!?]$/.test(w.text)) { sentences.push(cur); cur = []; } }
    if (cur.length) sentences.push(cur);
    for (const sent of sentences) {
      const dur = sent[sent.length - 1].end - sent[0].start;
      const k = Math.min(sent.length, Math.max(1, Math.ceil(textLen(sent) / (maxChars * 2)), Math.ceil(dur / maxDur)));
      const target = textLen(sent) / k;
      let chunk = [];
      let made = 0;
      for (let i = 0; i < sent.length; i++) {
        chunk.push(sent[i]);
        const left = sent.length - i - 1;
        const need = k - made - 1;
        if (need > 0 && (textLen(chunk) >= target || left === need)) {
          cues.push(chunk); chunk = []; made += 1;
        }
      }
      if (chunk.length) cues.push(chunk);
    }
    for (let i = cues.length - 1; i >= 0 && !cues[i].offset; i--) cues[i].offset = step.offset;
  }
  const out = cues.map((ws) => ({ start: ws.offset + ws[0].start, end: ws.offset + ws[ws.length - 1].end, text: wrap2(ws.map((w) => w.text).join(' '), maxChars) }));
  out.sort((x, y) => x.start - y.start);
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start - minGap) out[i].end = Math.max(out[i].start + 0.2, out[i + 1].start - minGap);
  }
  return out;
}

function ts(sec, sep) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000); const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

export const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
export const toVtt = (cues) => `WEBVTT\n\n${cues.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n')}`;

// YouTube chapter list: "0:00 Title" lines; the first must be 0:00.
export function chaptersText(chapters) {
  const f = (s) => { const t = Math.max(0, Math.floor(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  return chapters.map((c, i) => `${i === 0 ? '0:00' : f(c.start)} ${c.title}`).join('\n');
}
