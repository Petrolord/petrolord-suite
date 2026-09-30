// W7F: success toasts painted themselves with raw green classes
// (className: "bg-green-600 text-white"), which ignore the theme and read
// as a status colour the toast kit does not own. Write handlers use the
// standard toast. This scans src for a toast className carrying green, lime
// or emerald, with no exceptions (W10 moved PaymentVerification over too).
// Negative control: the second test runs the same scan on a green toast
// line and expects a hit.
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const PATTERN = /className:\s*["'`][^"'`]*\b(?:bg|border)-(?:green|lime|emerald)-/;

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
};

test('no toast paints itself green', () => {
  const hits = [];
  for (const f of walk(SRC)) {
    const rel = path.relative(SRC, f).split(path.sep).join('/');
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (PATTERN.test(l)) hits.push(`${rel}:${i + 1}`);
    });
  }
  expect(hits).toEqual([]);
});

test('negative control: the scan catches a green toast', () => {
  expect(PATTERN.test('toast({ title: "Saved", className: "bg-green-600 text-white" });')).toBe(true);
});
