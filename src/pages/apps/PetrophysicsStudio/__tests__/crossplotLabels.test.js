/**
 * PETRO-U1-015 (PL6): the density-neutron lithology labels stay inside the
 * plot. Before, each name was drawn just past the line's end point, and on
 * the default axes (NPHI -0.05..0.5, RHOB 1.9..3.0) Sandstone fell off the
 * top edge and Limestone off the right edge (screenshot 1440 light).
 * Negative control: anchoring at the end point puts both outside the box.
 */
import { overlayLabelAnchor } from '../components/Crossplot';
import { ND_LITHOLOGY_LINES } from '../engine/crossplot';

const box = { l: 52, t: 12, r: 1068, b: 700 };
const X = (x) => box.l + ((x + 0.05) / 0.55) * (box.r - box.l);
const Y = (y) => box.t + ((y - 1.9) / 1.1) * (box.b - box.t);

test.each(ND_LITHOLOGY_LINES.map((l) => [l.name, l]))('%s label is inside the plot with room for its text', (name, line) => {
  const w = 50;
  const at = overlayLabelAnchor(line.pts, X, Y, box, w);
  expect(at).not.toBeNull();
  expect(at.y).toBeGreaterThanOrEqual(box.t + 10);
  expect(at.y).toBeLessThanOrEqual(box.b);
  const left = at.align === 'left' ? at.x : at.x - w;
  expect(left).toBeGreaterThanOrEqual(box.l);
  expect(left + w).toBeLessThanOrEqual(box.r);
});

test('the old end-point anchor was outside for Sandstone and Limestone', () => {
  const end = (l) => l.pts[l.pts.length - 1];
  const s = ND_LITHOLOGY_LINES.find((l) => l.name === 'Sandstone');
  const lm = ND_LITHOLOGY_LINES.find((l) => l.name === 'Limestone');
  expect(Y(end(s).y) - 3).toBeLessThan(box.t + 10);
  expect(X(end(lm).x) + 3 + 50).toBeGreaterThan(box.r);
});
