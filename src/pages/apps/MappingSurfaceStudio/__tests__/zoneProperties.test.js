/**
 * PETRO-U2-008: zone HCPV and net pay from Petrophysics Studio reach Mapping
 * as named sources; thicknesses keep their metre unit; bookkeeping
 * (pipeline_version) is not offered as a map.
 * Chain: the Studio's own publish payload (zonePublishProperties) is what
 * Mapping grids, and a well's control point is that zone's HCPV.
 * Negative control (run 2026-09-29): with orderZoneKeys returning the raw
 * list, pipeline_version is offered and the first test fails.
 */
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';
import { computeWellZoned, DEFAULT_PARAMS } from '@/pages/apps/PetrophysicsStudio/engine/pipeline';
import { zonePublishProperties } from '@/pages/apps/PetrophysicsStudio/services/zoneAverages';
import { zoneAttrToPoints } from '../engine/surface';
import { orderZoneKeys, zoneKeyLabel, isLengthKey } from '../services/zoneProperties';

test('named, volumetric first, bookkeeping dropped, unknown keys kept at the end', () => {
  const keys = orderZoneKeys(['phi_avg', 'pipeline_version', 'ntg', 'hcpv_m', 'my_custom', 'net_m', 'hcpv_tvt_m']);
  expect(keys).toEqual(['hcpv_tvt_m', 'hcpv_m', 'net_m', 'ntg', 'phi_avg', 'my_custom']);
  expect(zoneKeyLabel('hcpv_m')).toBe('HCPV, hydrocarbon pore thickness (MD) (m) [hcpv_m]');
  expect(zoneKeyLabel('my_custom')).toBe('my_custom');
  expect(isLengthKey('net_tvt_m')).toBe(true);
  expect(isLengthKey('phi_avg')).toBe(false);
});

test('chain: the Studio publish payload grids as HCPV per well', () => {
  const curves = {};
  for (const [k, v] of Object.entries(typewell.curves)) curves[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
  const [top, base] = typewell.params.zones.SAND_A;
  const zone = { id: 'zA', name: 'SAND A', top_md_m: top, base_md_m: base, properties: {} };
  const { outputs } = computeWellZoned(curves, DEFAULT_PARAMS, []);
  const props = zonePublishProperties({ curves, outputs, params: DEFAULT_PARAMS, zone, meta: { projectId: 'p', publishedAt: '2026-09-29' } });
  expect(props.hcpv_m).toBeGreaterThan(0);
  const wells = [{ name: 'W1', surface_x: 1000, surface_y: 2000, zones: [{ ...zone, properties: props }] }];
  const pts = zoneAttrToPoints(wells, 'SAND A', 'hcpv_m');
  expect(pts).toHaveLength(1);
  expect(pts[0]).toMatchObject({ x: 1000, y: 2000, z: props.hcpv_m, well: 'W1' });
  expect(orderZoneKeys(Object.keys(props).filter((k) => Number.isFinite(props[k])))).toContain('hcpv_m');
  expect(orderZoneKeys(Object.keys(props).filter((k) => Number.isFinite(props[k])))).not.toContain('pipeline_version');
});
