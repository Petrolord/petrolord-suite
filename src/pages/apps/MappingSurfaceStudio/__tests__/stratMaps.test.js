// Stratigraphic maps in Mapping & Surface Studio (Stratigraphy ST4): the
// sample wells carry lithology and environment logs, the engine grids net
// sand between the two tops from them, facies and paleogeography polygons
// are polygon kinds with their own fill, and the launchers build the deep
// link the workstation consumes.

import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { thicknessPoints, environmentPoints } from '@/lib/stratigraphy/stratMaps';
import { POLYGON_KINDS, POLYGON_STYLE, POLYGON_KIND_LABEL, STRAT_POLYGON_KINDS, isPolygonLayer, polygonPayload } from '../services/polygonTools';
import { mapNetHref, parseNetParam } from '@/components/wells/appLinks';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

test('sample wells carry a lithology log; net sand between the tops equals the seeded net-to-gross', async () => {
  const b = makeInMemoryBackend();
  const wells = await b.listWells();
  expect(wells.every((w) => w.intervals?.length === 4)).toBe(true);
  const byWell = Object.fromEntries(wells.map((w) => [w.id, w.intervals]));
  const net = thicknessPoints(wells, 'Top Dome', 'Base Sand', { intervalsByWell: byWell, measure: 'net' });
  expect(net.skipped).toEqual([]);
  expect(net.points).toHaveLength(5);
  const keta1 = net.points.find((p) => p.well === 'KETA-1');
  expect(keta1.gross_m).toBe(160);
  expect(keta1.z).toBe(Math.round(160 * 0.72));   // the seeded ntg 0.72
  const ratio = thicknessPoints(wells, 'Top Dome', 'Base Sand', { intervalsByWell: byWell, measure: 'ratio' });
  expect(ratio.points.find((p) => p.well === 'KETA-3').z).toBeCloseTo(Math.round(142 * 0.8) / 142, 9);
  const env = environmentPoints(wells, 'Top Dome', 'Base Sand', { intervalsByWell: byWell });
  expect(env.points.map((p) => [p.well, p.code])).toEqual([['KETA-1', 'shoreface'], ['KETA-2', 'shoreface'], ['KETA-3', 'shoreface'], ['KETA-4', 'shelf'], ['KETA-5', 'shelf']]);
});

test('facies and paleogeography are polygon kinds with fills; a named polygon takes a colour override', () => {
  expect(POLYGON_KINDS.facies).toBe('facies');
  expect(POLYGON_KINDS.paleo).toBe('paleogeography');
  expect(STRAT_POLYGON_KINDS).toEqual(['facies', 'paleogeography']);
  expect(POLYGON_STYLE.facies.fill_opacity).toBe(0.35);
  expect(POLYGON_KIND_LABEL.paleogeography).toBe('paleogeography');
  expect(isPolygonLayer({ kind: 'facies' })).toBe(true);
  expect(isPolygonLayer({ kind: 'license_block' })).toBe(false);
  const ring = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const p = polygonPayload({ name: 'Channel sand', kind: POLYGON_KINDS.facies, vertices: ring, color: '#f4d03f' });
  expect(p.style).toEqual({ color: '#f4d03f', weight: 1, fill_opacity: 0.35 });
  expect(p.kind).toBe('facies');
  expect(polygonPayload({ name: 'x', kind: POLYGON_KINDS.paleo, vertices: ring }).style.color).toBe('#38bdf8');
  expect(() => polygonPayload({ name: 'x', kind: 'lease', vertices: ring })).toThrow(/Unknown polygon kind/);
});

test('the net-thickness launcher and its parser round-trip', () => {
  const href = mapNetHref('Mid Shale', 'Base Sand', ['w1', 'w2'], { measure: 'gross', path: '/dev/mapping-surface-studio' });
  expect(href).toBe('/dev/mapping-surface-studio?net=Mid+Shale%7CBase+Sand&measure=gross&wells=w1%2Cw2');
  const q = new URLSearchParams(href.split('?')[1]);
  expect(parseNetParam(q.get('net'))).toEqual({ upper: 'Mid Shale', lower: 'Base Sand' });
  expect(parseNetParam('nope')).toBeNull();
  expect(mapNetHref('A', 'B')).toBe('/dashboard/apps/geoscience/mapping-surface-studio?net=A%7CB&measure=net');
});
