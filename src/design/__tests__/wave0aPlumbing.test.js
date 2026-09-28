/**
 * Wave 0A plumbing guards:
 *   - the multi-app dev harnesses add no colours and no theme scope of their
 *     own, so a migrated app shows there as on its route and no batch has to
 *     edit them;
 *   - the test-only helpers and fixture under src/design/testing are never
 *     imported by application code (they would ship in the bundle).
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('multi-app dev harnesses', () => {
  it.each(['StudiosHarness', 'ProductionHarness', 'FacilitiesHarness', 'AssuranceHarness'])('%s has no colour wrapper and no ThemedApp of its own', (name) => {
    const src = read(`dev/${name}.jsx`);
    expect(src).not.toMatch(/<ThemedApp|import \{[^}]*ThemedApp/);
    expect(src).not.toMatch(/const THEMED\b/);
    // the one wrapper around the app is colourless
    expect(src).toContain('<div className="min-h-screen">');
    expect(src).not.toMatch(/min-h-screen bg-/);
  });
});

describe('src/design/testing stays test-only', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' || d.name === 'testing' || d.name === '__mocks__' ? [] : walk(full);
    return /\.(jsx?|tsx?)$/.test(d.name) && !/\.test\./.test(d.name) ? [full] : [];
  });

  it('no application file imports it', () => {
    const offenders = walk(SRC).filter((f) => /design\/testing\//.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
