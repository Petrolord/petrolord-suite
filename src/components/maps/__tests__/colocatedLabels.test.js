/**
 * Wells at one location (a pad, a re-entry, a copy) stack their labels one
 * line apart in the shared map painter instead of overprinting.
 */
import { paintWells } from '../mapPainter';

function fakeCtx() {
  const texts = [];
  return {
    texts,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, closePath() {}, rect() {}, fillRect() {}, strokeRect() {}, setLineDash() {},
    strokeText() {}, fillText(t, x, y) { texts.push({ t, x, y }); }, measureText: (t) => ({ width: t.length * 6 }),
  };
}
const transform = { worldToScreen: (x, y) => ({ x: x / 10, y: -y / 10 }) };

test('two wells at the same spot get labels one line apart', () => {
  const ctx = fakeCtx();
  paintWells(ctx, { transform, wells: [
    { name: 'Ekene-1', surface_x: 1000, surface_y: -1000 },
    { name: 'PPS demo: Ekene-1', surface_x: 1001, surface_y: -1001 },
    { name: 'Ekene-2', surface_x: 3000, surface_y: -1000 },
  ] });
  const y = Object.fromEntries(ctx.texts.map((x) => [x.t, x.y]));
  expect(y['PPS demo: Ekene-1'] - y['Ekene-1']).toBeGreaterThanOrEqual(10);
  expect(y['Ekene-2']).toBe(y['Ekene-1']);
});

test('wells apart keep their labels at the wellhead', () => {
  const ctx = fakeCtx();
  paintWells(ctx, { transform, wells: [
    { name: 'A', surface_x: 0, surface_y: 0 },
    { name: 'B', surface_x: 500, surface_y: 0 },
  ] });
  expect(ctx.texts.map((x) => x.y)).toEqual([3, 3]);
});
