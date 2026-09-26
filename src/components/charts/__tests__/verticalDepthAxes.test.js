// Guard (Senior Testing Wave 1, 2026-09-26): in a recharts chart with
// layout="vertical" the numeric Y axis already runs top-down, so depth
// increases downward without help. Adding `reversed` turns every depth
// log, pressure-depth and ECD plot upside down. It shipped that way in
// 23 charts across Geoscience, Drilling and Production before this guard.

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', '..');

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) yield p;
  }
}

test('no vertical-layout chart reverses its Y axis', () => {
  const offenders = [];
  for (const p of files(SRC)) {
    const s = fs.readFileSync(p, 'utf8');
    const re = /<(ComposedChart|LineChart|AreaChart|ScatterChart|BarChart)\b[^>]*?layout="vertical"/g;
    let m;
    while ((m = re.exec(s))) {
      const end = s.indexOf(`</${m[1]}>`, re.lastIndex);
      const block = s.slice(re.lastIndex, end < 0 ? undefined : end);
      const y = /<YAxis\b([\s\S]*?)(\/>|>)/g;
      let a;
      while ((a = y.exec(block))) {
        if (/\breversed\b(?!=\{false\})/.test(a[1])) {
          offenders.push(`${path.relative(SRC, p)}:${s.slice(0, re.lastIndex + a.index).split('\n').length}`);
        }
      }
    }
  }
  expect(offenders).toEqual([]);
});
