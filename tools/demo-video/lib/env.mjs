// Secrets and account details for the demo-video tools. Never committed:
// the files live outside the repo (mode 600) and only their paths are here.
import fs from 'node:fs';

export function readEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export function loadEnv() {
  return {
    ...readEnvFile(process.env.DEMO_ENV_FILE || '/root/.demo-video.env'),
    ...readEnvFile(process.env.ELEVENLABS_ENV_FILE || '/root/.elevenlabs.env'),
    ...readEnvFile(process.env.R2_ENV_FILE || '/root/.r2.env'),
    ...process.env,
  };
}

// Where finished and intermediate media go (outside git).
export const OUT_ROOT = process.env.DEMO_VIDEO_OUT || '/root/demo-videos';
