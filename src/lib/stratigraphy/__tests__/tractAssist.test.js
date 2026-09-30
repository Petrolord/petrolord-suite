/**
 * STRAT-U2-016 suggest-only sequence surfaces: the gate calls the shipped
 * functions on logs with known turning points. Negative controls: a flat log,
 * and a wiggle smaller than the swing, give no suggestion.
 */
import { suggestSurfaces, turningPoints, smoothLog } from '../tractAssist';

const log = (f, from = 1000, to = 1400, step = 0.5) => {
  const depth = []; const gr = [];
  for (let d = from; d <= to + 1e-9; d += step) { depth.push(d); gr.push(f(d)); }
  return { depth, gr };
};
// coarsening-upward to a sand at 1300 (GR min), fining-upward to a shale at 1150 (GR max), coarsening-upward above
const tri = (d) => (d <= 1150 ? 100 - (1150 - d) * 0.4 : d <= 1300 ? 100 - (d - 1150) * 0.4 : 40 + (d - 1300) * 0.4);

test('a log with a GR maximum at 1150 m and a minimum at 1300 m proposes an MFS and an MRS within one sample', () => {
  const s = suggestSurfaces({ ...log(tri), tops: [] }, { smoothM: 0 });
  expect(s.map((x) => [x.kind, x.code])).toEqual([['new', 'MFS'], ['new', 'MRS']]);
  expect(Math.abs(s[0].md - 1150)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(s[1].md - 1300)).toBeLessThanOrEqual(0.5);
  expect(s[0].reason).toMatch(/GR rises upward to 100 API .* maximum flooding surface/);
  expect(s[1].reason).toMatch(/maximum regressive surface/);
});

test('an untyped formation top near a turning point is proposed for typing; a surface already typed there is left alone', () => {
  const tops = [{ id: 't1', name: 'Shale X', md_m: 1152, surface_type: 'formation_top' }, { id: 't2', name: 'Sand Y', md_m: 1299, surface_type: 'MRS' }];
  const s = suggestSurfaces({ ...log(tri), tops }, { smoothM: 0 });
  expect(s).toHaveLength(1);
  expect(s[0]).toMatchObject({ kind: 'type', code: 'MFS', topId: 't1', topName: 'Shale X' });
  expect(s[0].reason).toMatch(/Shale X is 2\.0 m from it/);
});

test('negative controls: a flat log and a wiggle below the swing give nothing', () => {
  expect(suggestSurfaces({ ...log(() => 60), tops: [] })).toEqual([]);
  expect(suggestSurfaces({ ...log((d) => 60 + 8 * Math.sin(d / 7)), tops: [] })).toEqual([]);
});

test('a flat shale is reported at its middle; smoothing keeps the turning points of a noisy log', () => {
  const plateau = (d) => (d < 1100 ? 40 : d <= 1200 ? 100 : 40);
  const t = turningPoints(smoothLog(log(plateau).depth.map((d, i) => [d, log(plateau).gr[i]]), 0), 20);
  expect(t.map((x) => x.kind)).toEqual(['max']);
  expect(Math.abs(t[0].md - 1150)).toBeLessThanOrEqual(0.5);
  const noisy = log((d) => tri(d) + 3 * Math.sin(d * 3.1));
  const s = suggestSurfaces({ ...noisy, tops: [] });
  expect(s.map((x) => x.code)).toEqual(['MFS', 'MRS']);
  expect(Math.abs(s[0].md - 1150)).toBeLessThan(3);
});
