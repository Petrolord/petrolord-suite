/**
 * Wave 0A: the cold-load path list is one file per rollout batch
 * (src/design/rollout/<batch>.js), aggregated by rollout/index.js. A batch
 * edits only its own file; this test keeps the aggregation honest:
 *   - every file in the folder is aggregated, and nothing else is;
 *   - each batch file default-exports an array of route prefixes;
 *   - a prefix is an absolute path with no trailing slash, is a route (or
 *     the start of one) in App.jsx, and is registered once across batches;
 *   - isThemedPath() is true for every registered prefix and its sub-paths.
 */
import fs from 'fs';
import path from 'path';
import { ROLLOUT_BATCHES, THEMED_APP_PREFIXES } from '@/design/rollout/index.js';
import { isThemedPath, THEMED_APP_PREFIXES as FROM_COLD_LOAD } from '@/design/coldLoad';

const DIR = path.resolve(__dirname, '../rollout');
const APP = fs.readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf8');

const entries = () => Object.entries(ROLLOUT_BATCHES).flatMap(([batch, list]) => list.map((p) => ({ batch, p })));

describe('the per-batch rollout files', () => {
  it('every file in src/design/rollout is aggregated, and every aggregated batch has a file', () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3));
    expect(files.sort()).toEqual(Object.keys(ROLLOUT_BATCHES).sort());
    const index = fs.readFileSync(path.join(DIR, 'index.js'), 'utf8');
    for (const b of files) expect(index).toContain(`import ${b} from './${b}.js';`);
  });

  it('there is one file for each rollout batch, 1A to 6G, plus the pilots', () => {
    const want = ['pilots'];
    for (const [wave, last] of [[1, 'e'], [2, 'f'], [3, 'f'], [4, 'f'], [5, 'f'], [6, 'g']]) {
      for (let c = 'a'.charCodeAt(0); c <= last.charCodeAt(0); c += 1) want.push(`w${wave}${String.fromCharCode(c)}`);
    }
    expect(Object.keys(ROLLOUT_BATCHES).sort()).toEqual(want.sort());
  });

  it('each batch default-exports an array of strings', () => {
    for (const [batch, list] of Object.entries(ROLLOUT_BATCHES)) {
      expect({ batch, isArray: Array.isArray(list) }).toEqual({ batch, isArray: true });
      list.forEach((p) => expect({ batch, type: typeof p }).toEqual({ batch, type: 'string' }));
    }
  });

  it('coldLoad uses the aggregated list', () => {
    expect(FROM_COLD_LOAD).toBe(THEMED_APP_PREFIXES);
    expect(THEMED_APP_PREFIXES).toEqual(entries().map((e) => e.p));
  });

  it('every prefix is well formed and registered once', () => {
    const seen = new Map();
    for (const { batch, p } of entries()) {
      expect({ batch, p, ok: /^\/[a-z0-9][a-z0-9/_-]*[a-z0-9]$/i.test(p) && !p.includes('//') }).toEqual({ batch, p, ok: true });
      expect({ p, alsoIn: seen.get(p) }).toEqual({ p, alsoIn: undefined });
      seen.set(p, batch);
    }
  });

  it('every prefix starts a route in App.jsx', () => {
    for (const { batch, p } of entries()) {
      const rel = p.startsWith('/dashboard/') ? p.slice('/dashboard/'.length) : null;
      const found = (rel !== null && APP.includes(`path="${rel}`)) || APP.includes(`path="${p}`);
      expect({ batch, p, found }).toEqual({ batch, p, found: true });
    }
  });

  it('isThemedPath is true for every prefix and the paths under it', () => {
    for (const { p } of entries()) {
      expect({ p, themed: isThemedPath(p) }).toEqual({ p, themed: true });
      expect({ p, themed: isThemedPath(`${p}/`) }).toEqual({ p, themed: true });
      expect({ p, themed: isThemedPath(`${p}/help`) }).toEqual({ p, themed: true });
    }
  });
});
