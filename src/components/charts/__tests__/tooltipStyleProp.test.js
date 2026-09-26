// Guard (senior test T1, Wave 2 #31): TOOLTIP_STYLE is a CSS object for the
// tooltip box. Spread onto <Tooltip {...TOOLTIP_STYLE}> it becomes a set of
// unknown props that Recharts ignores, so 48 tooltips in 35 files rendered the default
// tooltip. It belongs in contentStyle.
import fs from 'fs';
import path from 'path';

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === 'node_modules' || d.name === '__tests__' ? [] : walk(p);
  return /\.(jsx?|tsx?)$/.test(d.name) ? [p] : [];
});

test('no chart spreads TOOLTIP_STYLE onto a Tooltip', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const offenders = walk(root).filter((f) => /\{\.\.\.TOOLTIP_STYLE\}/.test(fs.readFileSync(f, 'utf8')));
  expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
});
