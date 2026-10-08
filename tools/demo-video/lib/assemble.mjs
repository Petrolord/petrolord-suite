// Turns a recording into the two finished videos.
//   youtube.mp4  3840x2160 30 fps, narration (loudness -14 LUFS), with
//                youtube.srt / .vtt captions and chapters.txt for the description
//   nape.mp4     3840x2160 30 fps, silent, large burned-in subtitles, ending on
//                a branded card so it loops cleanly on the booth screens
// The screen capture (2560x1440) is upscaled with lanczos; the title cards
// are rendered natively at 4K.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { wordsFromAlignment, buildCues, toSrt, toVtt, chaptersText } from './captions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 26 });
const probeDur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

export async function renderCard(outPng, fields) {
  const mark = `data:image/png;base64,${fs.readFileSync(path.join(REPO, 'public/petrolord-suite-wordmark.png')).toString('base64')}`;
  const hash = new URLSearchParams({ ...fields, mark }).toString();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await p.goto(`file://${path.join(HERE, '../cards/card.html')}#${hash}`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: outPng });
  await b.close();
}

function assStyle(cues, offset) {
  const t = (s) => { const cs = Math.round(s * 100); const h = Math.floor(cs / 360000); const m = Math.floor((cs % 360000) / 6000); const x = Math.floor((cs % 6000) / 100); return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: 3840\nPlayResY: 2160\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Booth,Inter,92,&H00FFFFFF,&H00FFFFFF,&H00190F0B,&H33190F0B,0,0,0,0,100,100,0,0,3,26,0,2,240,240,120,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return head + cues.map((c) => `Dialogue: 0,${t(c.start + offset)},${t(c.end + offset)},Booth,,0,0,0,,${c.text.replace(/\n/g, '\\N')}`).join('\n') + '\n';
}

export async function assemble(sb, clips, rec, { outDir }) {
  const raw = path.join(outDir, 'raw.mkv');
  const rawDur = probeDur(raw);
  const INTRO = sb.introSeconds ?? 4.5; const OUTRO = sb.outroSeconds ?? 5;
  const work = path.join(outDir, 'work'); fs.mkdirSync(work, { recursive: true });

  // 1. title cards
  await renderCard(path.join(work, 'intro.png'), { eyebrow: sb.eyebrow, title: sb.title, sub: sb.subtitle || '', footL: sb.app });
  await renderCard(path.join(work, 'outro.png'), { eyebrow: 'Petrolord Suite', title: sb.outroTitle || 'Try it on *your own wells*', sub: sb.outroSub || 'Book a demo or get an instant quote at petrolord.com', footL: sb.app });

  // 2. narration track: each clip at its recorded start, shifted by the intro
  const said = rec.timeline.map((t, i) => ({ t, c: clips[i] })).filter((x) => x.c);
  const inputs = said.flatMap((x) => ['-i', x.c.mp3]);
  const delays = said.map((x, k) => `[${k}:a]adelay=${Math.round((x.t.sayAt + INTRO) * 1000)}:all=1[a${k}]`).join(';');
  const mix = `${delays};${said.map((_, k) => `[a${k}]`).join('')}amix=inputs=${said.length}:normalize=0:dropout_transition=0,apad,atrim=0:${(INTRO + rawDur + OUTRO).toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11[out]`;
  const narration = path.join(work, 'narration.wav');
  ff([...inputs, '-filter_complex', mix, '-map', '[out]', '-ar', '48000', narration]);

  // 3. captions and chapters (times on the finished video)
  const cues = buildCues(said.map((x) => ({ offset: x.t.sayAt, words: wordsFromAlignment(x.c.alignment) })));
  const shifted = cues.map((c) => ({ ...c, start: c.start + INTRO, end: c.end + INTRO }));
  fs.writeFileSync(path.join(outDir, 'youtube.srt'), toSrt(shifted));
  fs.writeFileSync(path.join(outDir, 'youtube.vtt'), toVtt(shifted));
  const chapters = [{ title: 'Introduction', start: 0 }, ...rec.timeline.filter((t) => t.chapter).map((t) => ({ title: t.chapter, start: t.start + INTRO }))];
  fs.writeFileSync(path.join(outDir, 'chapters.txt'), `${chaptersText(chapters)}\n`);
  const ass = path.join(work, 'booth.ass'); fs.writeFileSync(ass, assStyle(cues, INTRO));

  // 4. picture: intro card, upscaled screen, outro card
  const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-level', '5.1', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart'];
  const pic = (sub) => `[0:v]loop=loop=-1:size=1:start=0,trim=duration=${INTRO},fps=30,format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${INTRO - 0.5}:d=0.5,setsar=1[i];`
    + `[1:v]fps=30,scale=3840:2160:flags=lanczos,format=yuv420p,setsar=1${sub}[s];`
    + `[2:v]loop=loop=-1:size=1:start=0,trim=duration=${OUTRO},fps=30,format=yuv420p,fade=t=in:st=0:d=0.6,setsar=1[o];[i][s][o]concat=n=3:v=1:a=0[v]`;
  const vin = ['-i', path.join(work, 'intro.png'), '-i', raw, '-i', path.join(work, 'outro.png')];
  // one pass, two outputs, so the booth cut is not a second-generation encode
  const graph = `${pic('')};[v]split[v1][v2];[v2]subtitles=${ass}:fontsdir=/usr/share/fonts[vn]`;
  ff([...vin, '-i', narration, '-filter_complex', graph,
    '-map', '[v1]', '-map', '3:a', ...enc, '-c:a', 'aac', '-b:a', '192k', '-shortest', path.join(outDir, 'youtube.mp4'),
    '-map', '[vn]', '-an', ...enc, path.join(outDir, 'nape.mp4')]);

  return { duration: INTRO + rawDur + OUTRO, cues: cues.length, chapters };
}
