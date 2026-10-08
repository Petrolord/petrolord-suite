// Narration with ElevenLabs, one clip per storyboard step.
// Uses /with-timestamps so subtitles come from exact character times, passes
// the neighbouring lines as previous_text/next_text so the delivery flows
// across steps, and caches every clip by a hash of everything that shapes it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const DEFAULT_VOICE = { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' }; // owner's pick, 2026-10-08
export const MODEL = 'eleven_multilingual_v2';
export const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1.0 };

export async function synthStep({ text, prev = '', next = '', voiceId = DEFAULT_VOICE.id, apiKey, cacheDir }) {
  const key = crypto.createHash('sha256').update(JSON.stringify({ text, prev, next, voiceId, MODEL, VOICE_SETTINGS })).digest('hex').slice(0, 20);
  fs.mkdirSync(cacheDir, { recursive: true });
  const mp3 = path.join(cacheDir, `${key}.mp3`);
  const meta = path.join(cacheDir, `${key}.json`);
  if (!fs.existsSync(mp3) || !fs.existsSync(meta)) {
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set (expected in /root/.elevenlabs.env).');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_192`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: VOICE_SETTINGS, previous_text: prev || undefined, next_text: next || undefined }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    fs.writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
    fs.writeFileSync(meta, JSON.stringify({ text, alignment: j.alignment }));
  }
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString().trim());
  return { mp3, duration, alignment: JSON.parse(fs.readFileSync(meta, 'utf8')).alignment };
}

export async function synthStoryboard(storyboard, { apiKey, cacheDir }) {
  const steps = storyboard.steps;
  const out = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.say) { out.push(null); continue; }
    out.push(await synthStep({ text: s.say, prev: steps[i - 1]?.say || '', next: steps[i + 1]?.say || '', voiceId: storyboard.voiceId, apiKey, cacheDir }));
  }
  return out;
}
