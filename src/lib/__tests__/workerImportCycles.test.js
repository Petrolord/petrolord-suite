// Guard (Wave 1 zip cut, 2026-09-26): a module worker must not import,
// directly or through other modules, the file that spawns it. Mapping's
// gridWorker imported gridRunner, which imports the worker factory; the
// Vite 4 production build exits early on that cycle ("Unexpected early
// exit ... vite:worker-import-meta-url") while the dev server and jest
// never notice, so main stopped building for production unseen.

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const EXT = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx'];

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) yield p;
  }
}

function resolve(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const e of EXT) { const p = base + e; if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; }
  return null;
}

function closure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = resolve(f, m[1] || m[2]);
      if (r) stack.push(r);
    }
  }
  return seen;
}

test('no module worker imports the file that spawns it', () => {
  const cycles = [];
  let workers = 0;
  for (const f of files(SRC)) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/new\s+(?:Shared)?Worker\(\s*new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g)) {
      const w = resolve(f, m[1].startsWith('.') ? m[1] : `./${m[1]}`);
      if (!w) continue;
      workers += 1;
      if (closure(w).has(f)) cycles.push(`${path.relative(SRC, w)} -> ... -> ${path.relative(SRC, f)}`);
    }
  }
  expect(workers).toBeGreaterThan(5);
  expect(cycles).toEqual([]);
});
