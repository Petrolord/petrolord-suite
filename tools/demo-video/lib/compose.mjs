// Joins separately recorded scenes into one long module video with a music bed.
//
// A module definition (storyboards/<id>.mjs, `kind: 'module'`) lists a
// sequence of scenes (each an ordinary storyboard recorded by make.mjs, with
// its own raw.mkv and timeline.json) and title cards. Each scene is trimmed,
// its worker waits are cut, and neighbours are joined with a short cross
// fade. Narration clips land at their recorded times on the joined clock.
//
// Music is track-agnostic: `music.file` is any audio file the licence note
// (music/LICENSE.md) covers. The bed sits `underVoiceDb` (about -20 dB) below
// the narration's loudness while someone speaks, rises to `gapDb` between
// lines and to `openDb` where no one speaks for a while (the cold open), with
// short ramps, and fades in and out at the ends and dips at each join.
//
// Outputs in /root/demo-videos/<id>/:
//   youtube.mp4  3840x2160, narration + music, captions as a soft track
//   youtube.srt / youtube.vtt / chapters.txt (one chapter per scene)
//   nape.mp4     3840x2160, music low, no voice, large burned-in subtitles,
//                starting and ending on the same card so the loop is seamless
//   review.mp4   1920x1080 small copy for the review page
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cutTime, cutFilter, cutTotal } from './cuts.mjs';
import { wordsFromAlignment, wordsFromText, buildCues, toSrt, toVtt, chaptersText } from './captions.mjs';
import { renderCard } from './assemble.mjs';
import { OUT_ROOT } from './env.mjs';

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 26 });
const probeDur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
/** Integrated loudness (LUFS) of an audio file. */
export function integratedLufs(f) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], { maxBuffer: 1 << 28 });
  const txt = String(r.stderr);
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(txt.slice(txt.lastIndexOf('Summary')));
  return m ? Number(m[1]) : -23;
}

/**
 * Lays the sequence out on the finished clock.
 * @returns {{ items: Array, total: number }} items carry `at` (start on the
 *   finished clock), `dur`, and for scenes the trimmed source window.
 */
export function layout(sequence, { xfade = 0.6, cardSeconds = 4.5 } = {}) {
  const items = []; let t = 0;
  sequence.forEach((it, k) => {
    const dur = it.card ? (it.seconds ?? cardSeconds) : it.dur;
    const at = k === 0 ? 0 : t - xfade;
    items.push({ ...it, at, dur });
    t = at + dur;
  });
  return { items, total: t };
}

/** Gain envelope (dB, relative to the music file's own loudness) as an ffmpeg volume expression. */
export function musicVolumeExpr({ speech, total, musicLufs, voiceLufs = -14, underVoiceDb = -20, gapDb = -13, openDb = -9, openAfter = 4, ramp = 0.5, joins = [], joinDipDb = 4, fadeIn = 2, fadeOut = 4 }) {
  // levels as gain applied to the music file
  const gSpeech = voiceLufs + underVoiceDb - musicLufs;
  const gGap = voiceLufs + gapDb - musicLufs;
  const gOpen = voiceLufs + openDb - musicLufs;
  const trap = (s, e, r) => `clip((t-${(s - r).toFixed(2)})/${r},0,1)*clip((${(e + r).toFixed(2)}-t)/${r},0,1)`;
  // speaking: 1 inside a line (ramps either side)
  const sp = speech.length ? `min(1,${speech.map((x) => trap(x.from, x.to, ramp)).join('+')})` : '0';
  // long silences (no line within openAfter s): the bed opens up further
  const quiet = [];
  let last = 0;
  for (const x of [...speech, { from: total, to: total }]) {
    if (x.from - last > openAfter * 2) quiet.push({ from: last + openAfter, to: x.from - openAfter / 2 });
    last = Math.max(last, x.to);
  }
  const op = quiet.length ? `min(1,${quiet.map((x) => trap(x.from, x.to, 1.5)).join('+')})` : '0';
  const dip = joins.length ? `min(1,${joins.map((j) => trap(j - 0.4, j + 0.4, 0.5)).join('+')})` : '0';
  const db = `(${gGap.toFixed(2)}+(${(gSpeech - gGap).toFixed(2)})*${sp}+(${(gOpen - gGap).toFixed(2)})*${op}*(1-${sp})-${joinDipDb}*${dip})`;
  const fades = `clip(t/${fadeIn},0,1)*clip((${total.toFixed(2)}-t)/${fadeOut},0,1)`;
  return `pow(10,${db}/20)*${fades}`;
}

/** Builds the module video from recorded scenes. */
export async function composeModule(mod, scenes, { outDir }) {
  const work = path.join(outDir, 'work'); fs.mkdirSync(work, { recursive: true });
  const XF = mod.xfade ?? 0.6;

  // 1. scene windows (trimmed, cuts removed) and cards
  const seq = [];
  for (const it of mod.sequence) {
    if (it.card) {
      const png = path.join(work, `card-${it.card}.png`);
      await renderCard(png, it.fields);
      seq.push({ ...it, png });
      continue;
    }
    const sc = scenes[it.scene];
    const dir = path.join(OUT_ROOT, sc.sb.id);
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
    const raw = path.join(dir, 'raw.mkv');
    const cuts = rec.cuts || [];
    const head = it.trimHead ?? Math.max(0, (rec.timeline[0]?.start ?? 1) - 0.4);
    const rawDur = probeDur(raw);
    const tail = Math.min(rawDur, (rec.timeline[rec.timeline.length - 1]?.end ?? rawDur) + (it.tailPad ?? 0.6));
    // cut-clock times of the window
    const a = cutTime(head, cuts); const b = cutTime(tail, cuts);
    seq.push({ ...it, raw, cuts, rec, clips: sc.clips, sb: sc.sb, winA: a, dur: b - a, cutsTotal: cutTotal(cuts) });
  }
  const { items, total } = layout(seq, { xfade: XF });

  // 2. narration and caption cues on the finished clock
  const said = []; const cueSteps = []; const chapters = [];
  for (const it of items) {
    if (it.card) { if (it.chapter) chapters.push({ title: it.chapter, start: it.at }); continue; }
    if (it.chapter) chapters.push({ title: it.chapter, start: it.at });
    it.rec.timeline.forEach((t, i) => {
      const c = it.clips[i]; if (!c) return;
      const at = it.at + cutTime(t.sayAt, it.cuts) - it.winA;
      said.push({ mp3: c.mp3, at, dur: c.duration });
      const spoken = wordsFromAlignment(c.alignment);
      const s = it.sb.steps[i];
      const words = s?.sub && spoken.length ? wordsFromText(s.sub, spoken[0].start, spoken[spoken.length - 1].end) : spoken;
      cueSteps.push({ offset: at, words });
    });
  }
  if (chapters.length && chapters[0].start > 0) chapters.unshift({ title: mod.firstChapter || 'Opening', start: 0 });
  const cues = buildCues(cueSteps);
  fs.writeFileSync(path.join(outDir, 'youtube.srt'), toSrt(cues));
  fs.writeFileSync(path.join(outDir, 'youtube.vtt'), toVtt(cues));
  fs.writeFileSync(path.join(outDir, 'chapters.txt'), `${chaptersText(chapters)}\n`);

  // narration track, loudness -14 LUFS like the single demos
  const narration = path.join(work, 'narration.wav');
  const batch = 40; const parts = [];
  for (let k = 0; k < said.length; k += batch) {
    // amix with many inputs is slow and fragile; mix in batches, then sum
    const grp = said.slice(k, k + batch); const part = path.join(work, `narr-${k}.wav`);
    const inputs = grp.flatMap((x) => ['-i', x.mp3]);
    const delays = grp.map((x, j) => `[${j}:a]aresample=48000,adelay=${Math.round(x.at * 1000)}:all=1[a${j}]`).join(';');
    ff([...inputs, '-filter_complex', `${delays};${grp.map((_, j) => `[a${j}]`).join('')}amix=inputs=${grp.length}:normalize=0:dropout_transition=0,apad,atrim=0:${total.toFixed(3)}[o]`, '-map', '[o]', '-ar', '48000', '-ac', '2', part]);
    parts.push(part);
  }
  ff([...parts.flatMap((p) => ['-i', p]), '-filter_complex', `${parts.map((_, j) => `[${j}:a]`).join('')}amix=inputs=${parts.length}:normalize=0,loudnorm=I=-14:TP=-2:LRA=11[o]`, '-map', '[o]', '-ar', '48000', narration]);

  // music bed (any licensed file; looped if shorter than the video)
  const m = mod.music;
  let bed = null; let napeBed = null;
  if (m?.file) {
    const musicLufs = integratedLufs(m.file);
    const speech = said.map((x) => ({ from: x.at, to: x.at + x.dur }));
    const joins = items.slice(1).map((it) => it.at + XF / 2);
    const expr = musicVolumeExpr({ speech, total, musicLufs, underVoiceDb: m.underVoiceDb ?? -20, gapDb: m.gapDb ?? -13, openDb: m.openDb ?? -9, joins });
    fs.writeFileSync(path.join(work, 'music-volume.txt'), expr);
    bed = path.join(work, 'music-bed.wav');
    ff(['-stream_loop', '-1', '-i', m.file, '-af', `atrim=0:${total.toFixed(3)},aresample=48000,volume='${expr}':eval=frame`, '-ac', '2', bed]);
    // booth: constant low level, no voice to duck under
    const g = (m.napeLufs ?? -30) - musicLufs;
    napeBed = path.join(work, 'music-nape.wav');
    ff(['-stream_loop', '-1', '-i', m.file, '-af', `atrim=0:${total.toFixed(3)},aresample=48000,volume=${g.toFixed(2)}dB,afade=t=in:d=2,afade=t=out:st=${(total - 3).toFixed(2)}:d=3`, '-ac', '2', napeBed]);
  }
  const mixWav = path.join(work, 'mix.wav');
  if (bed) ff(['-i', narration, '-i', bed, '-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0,alimiter=limit=0.89:level=false[o]', '-map', '[o]', mixWav]);
  else fs.copyFileSync(narration, mixWav);

  // 3. picture: each item as a stream at 2560x1440 30 fps, joined with cross fades, upscaled
  const inputs = []; const chains = [];
  items.forEach((it, k) => {
    if (it.card) {
      inputs.push('-loop', '1', '-t', it.dur.toFixed(3), '-i', it.png);
      chains.push(`[${k}:v]fps=30,scale=2560:1440:flags=lanczos,format=yuv420p,setsar=1,trim=duration=${it.dur.toFixed(3)},setpts=PTS-STARTPTS[v${k}]`);
    } else {
      inputs.push('-i', it.raw);
      chains.push(`[${k}:v]fps=30${cutFilter(it.cuts)},trim=start=${it.winA.toFixed(3)}:duration=${it.dur.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[v${k}]`);
    }
  });
  let last = 'v0'; let acc = items[0].dur;
  for (let k = 1; k < items.length; k++) {
    const off = acc - XF;
    chains.push(`[${last}][v${k}]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[x${k}]`);
    last = `x${k}`; acc = off + items[k].dur;
  }
  const ass = path.join(work, 'booth.ass'); fs.writeFileSync(ass, boothAss(cues, mod.boothFontSize ?? 104));
  // Serial passes keep memory low (a one-pass three-output 4K encode was
  // OOM-killed on the 15 GB host): join at capture size first, then one
  // encode per output.
  const joined = path.join(work, 'joined.mkv');
  fs.writeFileSync(path.join(work, 'graph.txt'), `${chains.join(';')};[${last}]null[j]`);
  ff([...inputs, '-filter_complex_script', path.join(work, 'graph.txt'), '-map', '[j]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '30', joined]);
  const lowmem = ['-x264-params', 'rc-lookahead=20', '-threads', '4'];
  const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-level', '5.1', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', ...lowmem];
  const up = 'scale=3840:2160:flags=lanczos,setsar=1';
  ff(['-i', joined, '-i', mixWav, '-i', path.join(outDir, 'youtube.srt'), '-vf', up, '-map', '0:v', '-map', '1:a', '-map', '2:s', ...enc,
    '-c:a', 'aac', '-b:a', '192k', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-shortest', path.join(outDir, 'youtube.mp4')]);
  ff(['-i', joined, ...(napeBed ? ['-i', napeBed] : []), '-vf', `${up},subtitles=${ass}:fontsdir=/usr/share/fonts`, '-map', '0:v',
    ...(napeBed ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '128k'] : ['-an']), ...enc, path.join(outDir, 'nape.mp4')]);
  ff(['-i', joined, '-i', mixWav, '-vf', 'scale=1920:1080:flags=lanczos', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(mod.reviewCrf ?? 30),
    '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', ...lowmem, '-c:a', 'aac', '-b:a', '96k', '-shortest', path.join(outDir, 'review.mp4')]);

  fs.writeFileSync(path.join(outDir, 'module.json'), JSON.stringify({ id: mod.id, total, items: items.map(({ rec, clips, sb, ...x }) => x), chapters }, null, 2));
  return { total, cues: cues.length, chapters };
}

/** Large booth subtitles (two short lines, lower third, dark box). */
export function boothAss(cues, size = 104) {
  const t = (s) => { const cs = Math.max(0, Math.round(s * 100)); const h = Math.floor(cs / 360000); const m = Math.floor((cs % 360000) / 6000); const x = Math.floor((cs % 6000) / 100); return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: 3840\nPlayResY: 2160\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Booth,Inter,${size},&H00FFFFFF,&H00FFFFFF,&H00190F0B,&H33190F0B,1,0,0,0,100,100,0,0,3,28,0,2,240,240,120,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return head + cues.map((c) => `Dialogue: 0,${t(c.start)},${t(c.end)},Booth,,0,0,0,,${c.text.replace(/\n/g, '\\N')}`).join('\n') + '\n';
}
