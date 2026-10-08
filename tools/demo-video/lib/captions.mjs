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
  const cues = [];
  for (const step of steps) {
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      cues.push({ start: step.offset + cur[0].start, end: step.offset + cur[cur.length - 1].end, text: wrap2(cur.map((w) => w.text).join(' '), maxChars) });
      cur = [];
    };
    for (const w of step.words) {
      const next = [...cur, w];
      const len = next.map((x) => x.text).join(' ').length;
      const dur = w.end - (cur[0]?.start ?? w.start);
      if (cur.length && (len > maxChars * 2 || dur > maxDur)) flush();
      cur.push(w);
      if (/[.!?]$/.test(w.text)) flush();
    }
    flush();
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start - minGap) cues[i].end = Math.max(cues[i].start + 0.2, cues[i + 1].start - minGap);
  }
  return cues;
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
