// The 3D view speaks the wellbore's depth unit (2026-10-13): the TD label
// and the TVDSS ticks follow a feet wellbore, E/N ticks stay site-CRS
// metres, and a TD label that would sit on its target's label moves below
// it. Negative control: the metre path is what it was before.

import { buildScene, tdLabel, TD_LABEL_DY } from '../services/wpMesh';
import { computeWellPath } from '../engine/surveyMath';

const FT = 0.3048;
const stations = [];
for (let i = 0; i <= 20; i++) {
  const md = i * 100;
  stations.push({ md, inc: Math.min(22.5, Math.max(0, (md - 400) / 20)), azi: 74.7 });
}
const well = { id: 'p', label: 'Ekene-11 (plan)', color: '#166534', kind: 'plan', stations, headX: 401705, headY: 521600, kbElevM: 25 };
const end = computeWellPath(stations, { surfaceX: 401705, surfaceY: 521600, kb: 25 }).at(-1);
const atTd = { id: 't1', name: 'T1 Oboro Sand', kind: 'point', center_x: end.x, center_y: end.y, tvdss_m: end.tvdss };
const away = { id: 't2', name: 'T2', kind: 'point', center_x: end.x + 400, center_y: end.y + 300, tvdss_m: end.tvdss - 300 };

const td = (s) => s.labels.find((l) => l.kind === 'td');
const tvdssTicks = (s) => s.axes.ticks.filter((t) => t.axis === 'TVDSS');

describe('wpMesh depth unit', () => {
  test('tdLabel: feet with grouping, metres as before', () => {
    expect(tdLabel(2003.3, 'ft')).toBe('TD 6,573 ft MD');
    expect(tdLabel(2003.3, 'm')).toBe('TD 2003m');
    expect(tdLabel(2003.3)).toBe('TD 2003m');
  });

  test('feet wellbore: TD label and TVDSS ticks in feet, E/N ticks unchanged', () => {
    const m = buildScene({ wells: [well], targets: [away] });
    const f = buildScene({ wells: [well], targets: [away] }, { depthUnit: 'ft' });
    expect(td(f).text).toBe(`TD ${Math.round(2000 / FT).toLocaleString('en-US')} ft MD`);
    // tick values are round feet, placed at the matching metre depth
    for (const t of tvdssTicks(f)) {
      const ft = Number(t.text);
      expect(ft % 1).toBe(0);
      const yAt = -((ft * FT - f.world.minT) / f.world.scale) * f.world.vexag;
      expect(t.pos[1]).toBeCloseTo(yAt, 9);
    }
    expect(f.axes.ticks.find((t) => t.axis === 'TVDSS-unit').text).toBe('TVDSS ft');
    const en = (s) => s.axes.ticks.filter((t) => t.axis === 'E' || t.axis === 'N').map((t) => t.text);
    expect(en(f)).toEqual(en(m));
  });

  test('negative control: the metre scene keeps its labels and ticks', () => {
    const m = buildScene({ wells: [well], targets: [away] });
    expect(td(m).text).toBe('TD 2000m');
    const ticks = tvdssTicks(m).map((t) => Number(t.text));
    // metre ticks, not feet: the deepest tick is below the 2000 m-ish TD in metres
    expect(Math.max(...ticks)).toBeLessThan(2500);
    expect(m.axes.ticks.find((t) => t.axis === 'TVDSS-unit').text).toBe('TVDSS m');
  });

  test('a TD label on its target moves below it; elsewhere it stays put', () => {
    const on = buildScene({ wells: [well], targets: [atTd] }, { depthUnit: 'ft' });
    expect(td(on).dy).toBe(TD_LABEL_DY);
    const off = buildScene({ wells: [well], targets: [away] }, { depthUnit: 'ft' });
    expect(td(off).dy).toBeUndefined();
    const target = on.labels.find((l) => l.kind === 'target');
    expect(target.dy).toBeUndefined();
  });
});
