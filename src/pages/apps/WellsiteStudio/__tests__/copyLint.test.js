// Spec section 41 and the owner copy rule, enforced over the app source:
// no em or en dashes, and none of the words that claim the app decides.
// The app detects, highlights, presents and records.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const FORBIDDEN = [
  { re: /[—–]/, why: 'an em or en dash' },
  { re: /\b(kick detected|oil determined|oil confirmed|gas determined|set casing now|missed sample)\b/i, why: 'a phrase that claims a determination' },
  { re: /\b(determined|confirmed oil|autonomous(ly)?)\b/i, why: 'a word that claims a determination' },
];

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== '__tests__') walk(p, out); } else if (/\.(jsx?|ts)$/.test(f)) out.push(p);
  }
  return out;
}

/** Only strings the user can see: JSX text and quoted literals, not comments. */
function userFacing(src) {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const literals = [...noComments.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
  const jsxText = [...noComments.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  return [...literals, ...jsxText];
}

test('Wellsite Studio copy carries no dashes and never claims to decide', () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const text of userFacing(src)) {
      for (const { re, why } of FORBIDDEN) if (re.test(text)) offenders.push(`${path.relative(ROOT, file)}: ${why} in "${text.trim().slice(0, 60)}"`);
    }
  }
  expect(offenders).toEqual([]);
});
