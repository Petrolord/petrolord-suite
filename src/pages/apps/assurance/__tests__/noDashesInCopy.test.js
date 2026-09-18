/**
 * AS13 hardening: no em or en dash, and no " -- ", in the text the
 * Assurance apps show. The owner's copy rule; placeholders for an empty
 * cell use a plain hyphen, as the MOC and risk pages already did.
 *
 * Comments are not shown to anybody and are skipped. Tests are skipped.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../../..');
const ROOT = path.resolve(SRC, '..');
const TREES = [
  'pages/apps/assurance',
  'pages/apps/risk-register',
  'components/assurance',
  'data/assuranceHelp',
].map((t) => path.join(SRC, t));

const walk = (dir, out = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(full, out);
    } else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  });
  return out;
};

// Blank out comments but keep line numbers.
export const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

export const DASH = /[—–]| -- /;

describe('no em or en dashes in Assurance app copy', () => {
  it('the guard sees a dash in copy and ignores one in a comment (negative control)', () => {
    expect(DASH.test(stripComments("placeholder=\"Delay — cost\""))).toBe(true);
    expect(DASH.test(stripComments("value={x ?? '–'}"))).toBe(true);
    expect(DASH.test(stripComments("title: 'a -- b'"))).toBe(true);
    expect(DASH.test(stripComments('// AS6 — a note'))).toBe(false);
    expect(DASH.test(stripComments('/**\n * AS6 — a note\n */'))).toBe(false);
  });

  it('no app, component or help file shows one', () => {
    const offenders = [];
    TREES.flatMap((t) => walk(t)).forEach((file) => {
      stripComments(fs.readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        if (DASH.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      });
    });
    expect(offenders).toEqual([]);
  });
});
