// Writes the Seismolord hostile SEG-Y set (SEIS-U1, PL2) next to this
// file: `node e2e/fixtures/seis/hostile/generate.mjs`. The jest suite
// (src/pages/apps/Seismolord/__tests__/upgradeU1Door.test.js) builds the
// same files in memory from segyWriter.mjs; the e2e imports these.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSegy, HOSTILE_SEGY } from './segyWriter.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const [name, { options, note }] of Object.entries(HOSTILE_SEGY)) {
  const bytes = writeSegy(options);
  fs.writeFileSync(path.join(dir, name), bytes);
  console.log(`${name.padEnd(32)} ${String(bytes.byteLength).padStart(7)} B  ${note}`);
}
