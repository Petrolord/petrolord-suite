#!/usr/bin/env node
// node tools/demo-video/r2.mjs <command>
//
//   upload <id...> | --all   copy finished masters to R2 under <id>/ and write r2.json
//   verify <id...> | --all   check r2.json, the local files and the bucket agree
//   get <id> [file...]       download masters back into the video folder
//   ls [prefix]              list what the bucket holds
//
// make.mjs uploads automatically after assembling when /root/.r2.env exists.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, OUT_ROOT } from './lib/env.mjs';
import { r2Config, uploadVideo, head, get, list, MASTER_FILES, MANIFEST } from './lib/r2.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const cfg = r2Config(loadEnv());
if (!cfg) { console.error('R2 is not configured: /root/.r2.env needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET'); process.exit(2); }

const finished = () => fs.readdirSync(OUT_ROOT).filter((d) => fs.existsSync(path.join(OUT_ROOT, d, 'youtube.mp4'))).sort();
const ids = () => (rest.includes('--all') ? finished() : rest);
let failed = 0;

if (cmd === 'upload') {
  for (const id of ids()) {
    console.log(`[${id}]`);
    try { await uploadVideo(cfg, path.join(OUT_ROOT, id)); } catch (e) { failed++; console.error(`  FAILED: ${e.message}`); }
  }
} else if (cmd === 'verify') {
  for (const id of ids()) {
    const mf = path.join(OUT_ROOT, id, MANIFEST);
    if (!fs.existsSync(mf)) { failed++; console.log(`[${id}] not uploaded`); continue; }
    const { files } = JSON.parse(fs.readFileSync(mf, 'utf8'));
    for (const [name, f] of Object.entries(files)) {
      const r = await head(cfg, f.key);
      const ok = r && r.etag === f.md5 && r.size === f.size;
      if (!ok) failed++;
      const local = fs.existsSync(path.join(OUT_ROOT, id, name)) ? 'local copy kept' : 'bucket only';
      console.log(`[${id}] ${name}: ${ok ? 'OK' : 'MISMATCH OR MISSING'} (${local})`);
    }
  }
} else if (cmd === 'get') {
  const [id, ...names] = rest;
  if (!id) { console.error('usage: r2.mjs get <id> [file...]'); process.exit(2); }
  const dir = path.join(OUT_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names.length ? names : MASTER_FILES) {
    try { console.log(`  ${id}/${name}: ${(await get(cfg, `${id}/${name}`, path.join(dir, name)) / 1e6).toFixed(1)} MB`); } catch (e) { if (names.length) { failed++; console.error(`  ${e.message}`); } }
  }
} else if (cmd === 'ls') {
  let total = 0;
  for (const k of await list(cfg, rest[0] || '')) { total += k.size; console.log(`${(k.size / 1e6).toFixed(1).padStart(8)} MB  ${k.modified.slice(0, 10)}  ${k.key}`); }
  console.log(`${(total / 1e9).toFixed(2)} GB in ${cfg.bucket}`);
} else {
  console.error('usage: r2.mjs upload|verify <id...>|--all, get <id> [file...], ls [prefix]');
  process.exit(2);
}
process.exit(failed ? 1 : 0);
