/**
 * PETRO-U1-015 (PL6): the density-neutron lithology labels stay inside the
 * plot. Before, each name was drawn just past the line's end point, and on
 * the default axes (NPHI -0.05..0.5, RHOB 1.9..3.0) Sandstone fell off the
 * top edge and Limestone off the right edge (screenshot 1440 light).
 * Negative control: anchoring at the end point puts both outside the box.
 */
import { overlayLabelAnchor, labelRect } from '../components/Crossplot';
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

// PETRO-U2 (2026-10-09, seen in the re-cut sales demo): on the Pickett plot the
// Sw 80 % label, the fitted water line's label and Sw 60 % stacked at the top.
// Labels already placed now push a new one down its own line.
// Negative control: without the placed rects the second label lands on the first.
describe('overlay labels do not overlap', () => {
  const b2 = { l: 50, t: 10, r: 900, b: 600 };
  const lin = (v) => v;
  // two steep, nearly coincident lines ending at the top edge
  const l1 = [{ x: 300, y: 600 }, { x: 420, y: 10 }];
  const l2 = [{ x: 310, y: 600 }, { x: 430, y: 10 }];
  const overlaps = (r1, r2) => !(r1.x1 < r2.x0 || r1.x0 > r2.x1 || r1.y1 < r2.y0 || r1.y0 > r2.y1);
  test('the second label moves clear of the first', () => {
    const w = 90;
    const a1 = overlayLabelAnchor(l1, lin, lin, b2, w, []);
    const taken = [labelRect(a1, w)];
    const a2 = overlayLabelAnchor(l2, lin, lin, b2, w, taken);
    expect(a2).not.toBeNull();
    expect(overlaps(labelRect(a2, w), taken[0])).toBe(false);
  });
  test('negative control: without the placed rects they overlap', () => {
    const w = 90;
    const a1 = overlayLabelAnchor(l1, lin, lin, b2, w);
    const a2 = overlayLabelAnchor(l2, lin, lin, b2, w);
    expect(overlaps(labelRect(a1, w), labelRect(a2, w))).toBe(true);
  });
});
