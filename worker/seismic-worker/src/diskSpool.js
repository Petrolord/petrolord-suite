// A brick spool on the worker's scratch disk: the same interface as the
// browser's OPFS and memory spools (Seismolord services/brickSpool.js), so
// convertToSpool and the two-stage upload run unchanged. Keys keep their
// '/' as '~' in file names, as the OPFS spool does.
import fs from 'node:fs/promises';
import path from 'node:path';

const flat = (key) => key.replace(/\//g, '~');
const unflat = (name) => name.replace(/~/g, '/');

export async function diskSpool(dir) {
  const bricks = path.join(dir, 'bricks');
  const json = path.join(dir, 'json');
  await fs.mkdir(bricks, { recursive: true });
  await fs.mkdir(json, { recursive: true });
  const safe = (name) => {
    if (!/^[A-Za-z0-9._~-]+$/.test(name)) throw new Error(`Bad spool key: ${name}`);
    return name;
  };
  return {
    kind: 'disk',
    dir,
    async put(key, bytes) {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      await fs.writeFile(path.join(bricks, safe(flat(key))), u8);
    },
    async get(key) {
      try {
        return new Uint8Array(await fs.readFile(path.join(bricks, safe(flat(key)))));
      } catch (e) {
        if (e.code === 'ENOENT') throw new Error(`The local copy of ${key} is missing.`);
        throw e;
      }
    },
    async has(key) {
      try { await fs.access(path.join(bricks, safe(flat(key)))); return true; } catch { return false; }
    },
    async keys() {
      return (await fs.readdir(bricks)).map(unflat);
    },
    async putJson(name, value) {
      await fs.writeFile(path.join(json, `${safe(name)}.json`), JSON.stringify(value));
    },
    async getJson(name) {
      try {
        return JSON.parse(await fs.readFile(path.join(json, `${safe(name)}.json`), 'utf8'));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async bytes() {
      let total = 0;
      for (const name of await fs.readdir(bricks)) total += (await fs.stat(path.join(bricks, name))).size;
      return total;
    },
    async destroy() {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
