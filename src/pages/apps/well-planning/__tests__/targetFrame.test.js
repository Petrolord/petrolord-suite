// Targets are absolute site-CRS metres; charts and solvers need
// wellhead-relative offsets in the wellbore unit. These pin the one
// conversion and the two loud refusals (no wellhead, wrong frame).

import {
  resolveWellhead, targetToLocal, targetsToChart, assertLocalDelta, MAX_TARGET_REACH_M, NO_WELLHEAD_MESSAGE,
} from '../services/targetFrame';
import { M_TO_FT } from '../engine/surveyMath';

const HEAD = { x: 25000, y: 21000 };
const wellbore = { head_x: 25000, head_y: 21000, kb_elev_m: 30, depth_unit: 'ft' };
const T = { id: 't1', name: 'Amber', center_x: 25300, center_y: 21400, tvdss_m: 5000 };

test('resolveWellhead: explicit head wins, then slot plus pad origin, else null', () => {
  expect(resolveWellhead(wellbore)).toEqual({ x: 25000, y: 21000, source: 'wellbore' });
  const site = { origin_x: 1000, origin_y: 2000, slots: [{ name: 'S1', dx_m: 5, dy_m: -5 }] };
  expect(resolveWellhead({ slot_name: 'S1' }, site)).toEqual({ x: 1005, y: 1995, source: 'slot' });
  expect(resolveWellhead({ slot_name: 'S1' }, { slots: site.slots })).toBeNull();
  expect(resolveWellhead({ head_x: null, head_y: null })).toBeNull();
  expect(resolveWellhead(null)).toBeNull();
});

test('targetToLocal converts to wellhead-relative offsets in the wellbore unit, TVD below KB', () => {
  const m = targetToLocal(T, { wellhead: HEAD, mdUnit: 'm', kbM: 30 });
  expect(m).toMatchObject({ ok: true, dE: 300, dN: 400, dTvd: 5030, tvdss: 5000, unit: 'm', frame: 'local' });
  expect(m.reachM).toBeCloseTo(Math.hypot(300, 400, 5030), 9);
  const ft = targetToLocal(T, { wellhead: HEAD, mdUnit: 'ft', kbM: 30 });
  expect(ft.dE).toBeCloseTo(300 * M_TO_FT, 9);
  expect(ft.dN).toBeCloseTo(400 * M_TO_FT, 9);
  expect(ft.dTvd).toBeCloseTo(5030 * M_TO_FT, 9);
  expect(ft.unit).toBe('ft');
  // rebased on a current design end given in the same unit
  const app = targetToLocal(T, { wellhead: HEAD, mdUnit: 'm', kbM: 30, from: { e: 100, n: 100, tvd: 1000 } });
  expect(app).toMatchObject({ dE: 200, dN: 300, dTvd: 4030 });
});

test('no wellhead and a target in another frame are refused with a reason, never placed at 0/0', () => {
  const noHead = targetToLocal(T, { wellhead: null, mdUnit: 'ft' });
  expect(noHead).toEqual({ ok: false, error: NO_WELLHEAD_MESSAGE });
  // the tester's case: a local pad wellhead against a UTM-easting target
  const utm = { id: 't2', name: 'UTM pick', center_x: 269000, center_y: 4700000, tvdss_m: 5000 };
  const bad = targetToLocal(utm, { wellhead: HEAD, mdUnit: 'ft' });
  expect(bad.ok).toBe(false);
  expect(bad.error).toMatch(/244,000 m east/);
  expect(bad.error).toMatch(/not in the same coordinate frame/);
  expect(bad.error).toMatch(/25,000 E, 21,000 N/);
  // just inside the reach limit is a well, not a mismatch
  const far = { ...T, center_x: HEAD.x + MAX_TARGET_REACH_M - 6000, tvdss_m: 0 };
  expect(targetToLocal(far, { wellhead: HEAD, mdUnit: 'm' }).ok).toBe(true);
  expect(targetToLocal({ ...T, center_x: null }, { wellhead: HEAD }).error).toMatch(/no usable position/);
});

test('targetsToChart keeps placeable targets in offsets and lists the rest as problems', () => {
  const utm = { id: 't2', name: 'UTM pick', center_x: 269000, center_y: 4700000, tvdss_m: 5000, geometry: { radius_m: 50 } };
  const poly = { id: 't3', name: 'Poly', center_x: 25100, center_y: 21100, tvdss_m: 100, geometry: { points: [[25000, 21000], [25200, 21000], [25200, 21200]] } };
  const r = targetsToChart([T, utm, poly], { wellhead: HEAD, mdUnit: 'ft', kbM: 0 });
  expect(r.rows.map((x) => x.id)).toEqual(['t1', 't3']);
  expect(r.rows[0].e).toBeCloseTo(300 * M_TO_FT, 9);
  expect(r.rows[1].geometry.points[1][0]).toBeCloseTo(200 * M_TO_FT, 9);
  expect(r.problems).toHaveLength(1);
  expect(r.problems[0]).toMatchObject({ id: 't2', name: 'UTM pick' });
  expect(targetsToChart([T], { wellhead: null }).problems[0].error).toBe(NO_WELLHEAD_MESSAGE);
  expect(targetsToChart([T], { wellhead: null }).rows).toEqual([]);
});

test('assertLocalDelta is the loud boundary: frame, unit and finiteness', () => {
  const ok = { dE: 1, dN: 2, dTvd: 3, unit: 'ft', frame: 'local' };
  expect(assertLocalDelta(ok, 'ft')).toBe(ok);
  expect(() => assertLocalDelta(ok, 'm')).toThrow(/in ft but the solver runs in m/);
  expect(() => assertLocalDelta({ ...ok, frame: 'grid' }, 'ft')).toThrow(/not wellhead-relative/);
  expect(() => assertLocalDelta({ ...ok, dTvd: NaN }, 'ft')).toThrow(/dTvd is not a number/);
  expect(() => assertLocalDelta(null, 'ft')).toThrow(/no displacement/);
});
