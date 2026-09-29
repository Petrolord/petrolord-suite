/**
 * AppUpgrade WC-U2-008: Petrophysics pay and zones, Stratigraphy units as
 * strips beside the section logs (pure). Negative control: on origin/main
 * there is no petroStrips module and the section draws raw logs only.
 */
import { payRuns, zoneLabel, unitIntervals, wellStrips } from '../petroStrips';

test('PAY runs from the published flag; NaN breaks a run', () => {
  const depth = [100, 101, 102, 103, 104, 105, 106];
  const pay = [0, 1, 1, 0, 1, NaN, 1];
  expect(payRuns(depth, pay)).toEqual([{ top_md_m: 101, base_md_m: 102 }]);
  expect(payRuns([1, 2, 3], [1, 1, 1])).toEqual([{ top_md_m: 1, base_md_m: 3 }]);
});

test('a zone label carries its published summary in the display unit, or says it is not published', () => {
  const z = { name: 'Dome Sand', properties: { net_m: 30.48, phi_avg: 0.214, sw_avg: 0.31, published_at: 'x' } };
  expect(zoneLabel(z, 'm')).toBe('Dome Sand: net 30.5 m, PHIE 0.21, Sw 0.31');
  expect(zoneLabel(z, 'ft')).toBe('Dome Sand: net 100.0 ft, PHIE 0.21, Sw 0.31');
  expect(zoneLabel({ name: 'Cut from tops', properties: { from_tops: ['A', 'B'] } })).toBe('Cut from tops: not published');
});

test('a top linked to a unit starts it; the unit runs to the next deeper top', () => {
  const units = [{ id: 'u1', name: 'Dome Sand', colour: '#d97706' }];
  const tops = [{ name: 'Base', md_m: 1600 }, { name: 'Top Dome', md_m: 1500, unit_id: 'u1' }, { name: 'Mid', md_m: 1580 }];
  expect(unitIntervals(tops, units)).toEqual([{ top_md_m: 1500, base_md_m: 1580, colour: '#d97706', label: 'Dome Sand' }]);
  expect(unitIntervals([{ name: 'Last', md_m: 1, unit_id: 'u1' }], units)).toEqual([]);
});

test('strips per well say when the data is missing', () => {
  const s = wellStrips({ depth: [1, 2], curves: {}, zones: [], tops: [] }, { pay: true, zones: true, units: true });
  expect(s.map((x) => [x.key, x.note])).toEqual([['pay', 'no published PAY'], ['zones', 'no zones'], ['units', 'no tops linked to units']]);
});
