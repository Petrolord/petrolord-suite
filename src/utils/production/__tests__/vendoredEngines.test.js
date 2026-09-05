/**
 * R6, AND THE HALF OF IT N4 ASKED FOR. The Suite does not carry its own
 * copy of a production engine: `packages/engines` is a git subtree of
 * the central @petrolord/engines repo, and every engine reaches the
 * Suite through a two-line re-export shim under
 * `src/utils/production/engine/`.
 *
 * The decision behind R6 asked for a check that the vendored copies
 * cannot silently drift. Shims cannot drift, because there is nothing
 * in them to drift: what CAN happen, and did, is that an engine gets
 * added to the central repo and never gets a shim, so the Suite goes on
 * running an older implementation of its own and every fix in the engine
 * is invisible to users. That is exactly how `surveillance`,
 * `allocation`, `liftScreening` and `liftAdvisor` sat two waves behind
 * while eleven decided items were live in the engine and dead in the
 * app. A check that only looked for divergence would have passed.
 *
 * So this gate asserts BOTH halves:
 *   1. every production engine in the subtree has a shim, and
 *   2. every shim is a shim: it re-exports from the subtree and holds
 *      no math of its own.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ENGINE_DIR = path.join(ROOT, 'packages', 'engines', 'engines', 'production');
const SHIM_DIR = path.join(ROOT, 'src', 'utils', 'production', 'engine');

const engineFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return engineFiles(full);
    return e.isFile() && e.name.endsWith('.js') ? [full] : [];
  });

describe('every production engine reaches the Suite through a shim', () => {
  const engines = engineFiles(ENGINE_DIR).sort();
  const shims = fs.readdirSync(SHIM_DIR).filter((f) => f.endsWith('.js')).sort();

  it('the subtree has engines to shim in the first place', () => {
    expect(engines.length).toBeGreaterThan(20);
    expect(shims.length).toBeGreaterThan(20);
  });

  it.each(engines.map((f) => [path.basename(f), f]))(
    '%s has a shim',
    (base) => {
      const shim = path.join(SHIM_DIR, base);
      expect(fs.existsSync(shim)).toBe(true);
    },
  );

  it.each(shims.map((f) => [f]))('%s is a shim and points at the subtree', (base) => {
    const text = fs.readFileSync(path.join(SHIM_DIR, base), 'utf8');
    const lines = text.split('\n').filter((l) => l.trim());
    // a comment and one re-export, and nothing else
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(
      new RegExp(`^export \\* from '\\.\\./\\.\\./\\.\\./\\.\\./packages/engines/engines/production/(data/)?${base.replace('.', '\\.')}';$`),
    );
    // nothing that could be math
    expect(text).not.toMatch(/\bfunction\b|=>|Math\./);
  });

  it('no shim points at a file the subtree does not have', () => {
    const names = new Set(engines.map((f) => path.basename(f)));
    shims.forEach((base) => expect(names.has(base)).toBe(true));
  });

  it('the four that were missing are there, by name', () => {
    // Named rather than counted, because the count is what let them go
    // missing: 22 shims for 22 engines looked complete while the four
    // extracted later had no shim at all.
    ['surveillance', 'allocation', 'liftScreening', 'liftAdvisor'].forEach((name) => {
      expect(fs.existsSync(path.join(SHIM_DIR, `${name}.js`))).toBe(true);
    });
  });

  it('the Suite-side modules for those four hold no math either', () => {
    // They are doors onto the engine. `liftAdvisor` assembles the four
    // design chains the engine takes as an injected dependency, which is
    // wiring and not math, so it is allowed its imports; the other three
    // are bare re-exports.
    ['surveillance', 'allocation', 'liftScreening'].forEach((name) => {
      const text = fs.readFileSync(
        path.join(ROOT, 'src', 'utils', 'production', `${name}.js`), 'utf8',
      );
      expect(text).toMatch(new RegExp(`export \\* from '\\./engine/${name}\\.js';`));
      expect(text).not.toMatch(/\bfunction\b|Math\./);
    });
    const advisor = fs.readFileSync(
      path.join(ROOT, 'src', 'utils', 'production', 'liftAdvisor.js'), 'utf8',
    );
    expect(advisor).toMatch(/SUITE_CHAIN/);
    expect(advisor).toMatch(/from '\.\/engine\/liftAdvisor\.js'/);
    expect(advisor).not.toMatch(/Math\./);
  });
});
