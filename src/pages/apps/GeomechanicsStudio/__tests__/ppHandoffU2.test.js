/**
 * PP-U2-013 (fixes PP-U1-018): Geomechanics reads the published Pore
 * Pressure curves (and the raw logs) at TVD through the definitive
 * trajectory. Before, the MD grid was taken as TVD: on a deviated well the
 * MEM sat at MD and the mud window read every stress too deep.
 */
import { assembleBaseProfile, runMem, runWindow, mdToTvdOnTrajectory } from '../services/gmRun';
import { tvdAt } from '../../../../../packages/engines/engines/drilling/wellControl.js';

const G = 9.80665;
// vertical to 500 m, build to 40 degrees by 900 m, hold to 4,000 m MD
const stations = [
  { md: 0, inc: 0, azi: 0 }, { md: 500, inc: 0, azi: 0 }, { md: 700, inc: 20, azi: 90 }, { md: 900, inc: 40, azi: 90 }, { md: 4000, inc: 40, azi: 90 },
];
const md = []; for (let m = 130; m <= 3900; m += 10) md.push(m);
// a published set made on TVD (what Pore Pressure Studio computes since PP-U1-002): S and PP linear in TVD
const tv = md.map((m) => tvdAt(stations, m));
const published = { tvdM: md, obgPa: tv.map((t) => 2200 * G * t), ppPa: tv.map((t) => 1030 * G * t), dtAligned: md.map(() => 300) };

test('published curves are placed at TVD through the trajectory', () => {
  const base = assembleBaseProfile({ source: { ppSource: 'published' }, published, stations });
  expect(base.depthFrame).toBe('trajectory');
  expect(base.provenance).toMatch(/at TVD through the definitive trajectory/);
  const k = base.mdM.indexOf(3000);
  expect(base.tvdM[k]).toBeCloseTo(tvdAt(stations, 3000), 9);
  // the overburden gradient is the 2,200 kg/m3 of its making at every sample
  base.tvdM.forEach((t, i) => expect(base.svPa[i] / (G * t)).toBeCloseTo(2200, 6));
  // negative control: MD taken as TVD (the old reader) reads 2200 x TVD/MD, 17% light at 3,000 m MD
  const old = assembleBaseProfile({ source: { ppSource: 'published' }, published });
  expect(old.depthFrame).toBe('md-as-tvd');
  expect(old.provenance).toMatch(/MD taken as TVD/);
  expect(old.svPa[old.tvdM.indexOf(3000)] / (G * 3000)).toBeLessThan(2200 * 0.9);
});

test('the mud window along the well reads the stress of its own TVD', () => {
  const base = assembleBaseProfile({ source: { ppSource: 'published' }, published, stations });
  const mem = runMem({ base, params: { ucs: { correlation: 'constant', params: { ucsPa: 20e6 } }, nu: 0.25 } });
  const win = runWindow({ stations, mem, params: { stepMdM: 300 } });
  const row = win.rows.find((r) => r.md === 3000);
  expect(row.tvd).toBeCloseTo(tvdAt(stations, 3000), 9);
  expect(row.ppEmwKgM3).toBeCloseTo(1030, 3); // EMW = PP / (g TVD) on the TVD the PP was made on
  // negative control: the MD-as-TVD MEM gives a pore pressure EMW 1030 x TVD/MD
  const old = runMem({ base: assembleBaseProfile({ source: { ppSource: 'published' }, published }), params: { ucs: { correlation: 'constant', params: { ucsPa: 20e6 } }, nu: 0.25 } });
  const oldRow = runWindow({ stations, mem: old, params: { stepMdM: 300 } }).rows.find((r) => r.md === 3000);
  expect(Math.abs(oldRow.ppEmwKgM3 - 1030)).toBeGreaterThan(60);
});

test('computed path: logs on MD go to TVD below the mudline through the trajectory; samples past TD are dropped', () => {
  const depthM = [...md, 4100];
  const logs = { depthM, dtUsPerM: depthM.map(() => 400), rhoKgM3: depthM.map(() => 2300) };
  const base = assembleBaseProfile({ source: { ppSource: 'hydrostatic', mudlineMdM: 130, waterDepthM: 100 }, logs, stations });
  expect(base.tvdM).toHaveLength(md.length);
  expect(base.provenance).toMatch(/1 samples off the trajectory/);
  const last = base.tvdM[base.tvdM.length - 1];
  expect(last).toBeCloseTo(tvdAt(stations, 3900), 9);
  const t = mdToTvdOnTrajectory([100, 200, 150], null);
  expect(t.tvdM).toEqual([100, 200]);
  expect(t.dropped).toBe(1);
});
