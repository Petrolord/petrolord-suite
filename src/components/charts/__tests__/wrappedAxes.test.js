// Guard (senior test T1, Wave 2 #33): Recharts finds XAxis / YAxis among a
// chart's direct children by element type. An axis wrapped in a component of
// our own (const XAx = () => <XAxis .../>, used as <XAx />) is silently never
// drawn; Data Quality Studio's six charts had no axes for that reason. Build
// axes inline or with a factory called in place ({xAx(title)}).
import fs from 'fs';
import path from 'path';

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === 'node_modules' || d.name === '__tests__' ? [] : walk(p);
  return /\.jsx?$/.test(d.name) ? [p] : [];
});

test('no component wraps a Recharts XAxis or YAxis', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const re = /const\s+[A-Z]\w*\s*=\s*\([^)]*\)\s*=>\s*\(?\s*<(XAxis|YAxis|ZAxis)\b/;
  const offenders = walk(root).filter((f) => re.test(fs.readFileSync(f, 'utf8')));
  expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
});
