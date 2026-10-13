/**
 * 2026-10-13: the mud window from an offset well's prognosis, by TVDSS.
 * A planned well has no logs to run Pore Pressure Studio on; the window
 * takes the PP/FP/OBG another registry well carries at equal subsea depth.
 * Gates call the shipped functions; gate 2 has a negative control that
 * samples by MD instead and must fail.
 */
import {
  readyCurve, buildMudWindow, curvesByTvdss, buildMudWindowByTvdss, ppfgSourceCandidates,
  casingSeatsOnWindow, sampleCurve,
} from '../services/ppfg';
import { computeWellPath, positionAtMd } from '../engine/surveyMath';
import { KG_M3_PER_PPG } from '@/lib/ppfgUnits';

const G = 9.80665;
const KB = 25;
// a smooth synthetic prognosis in MPa as a function of TVDSS (m)
const ppAt = (tvdss) => 0.0102 * tvdss + (tvdss > 1300 ? 2e-6 * (tvdss - 1300) ** 2 : 0);
const fpAt = (tvdss) => 0.0155 * tvdss;
const obgAt = (tvdss) => 0.0215 * tvdss;

/** registry-shaped MPa logs on a well's own MD grid, from TVDSS truth */
function logsOn(stations, kb, { step = 5, unit = 'MPa', conv = (v) => v } = {}) {
  const path = computeWellPath(stations, { kb });
  const mdMax = stations[stations.length - 1].md;
  const n = Math.floor(mdMax / step) + 1;
  const mk = (mn, f) => {
    const values = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pos = positionAtMd(stations, path, i * step);
      values[i] = pos && pos.tvdss > 0 ? conv(f(pos.tvdss), pos.tvd) : NaN;
    }
    return readyCurve({ mnemonic: mn, unit, start_md_m: 0, step_m: step, n_samples: n }, Float64Array.from(values));
  };
  return { PP: mk('PP', ppAt), FP: mk('FP', fpAt), OBG: mk('OBG', obgAt) };
}

const vertical = [{ md: 0, inc: 0, azi: 0 }, { md: 2300, inc: 0, azi: 0 }];
const deviated = [
  { md: 0, inc: 0, azi: 0 }, { md: 400, inc: 0, azi: 0 }, { md: 700, inc: 25, azi: 32 }, { md: 2300, inc: 25, azi: 32 },
];
const plan = [
  { md: 0, inc: 0, azi: 75 }, { md: 400, inc: 0, azi: 75 }, { md: 670, inc: 22.5, azi: 75 }, { md: 2100, inc: 22.5, azi: 75 },
];
const well = (dev, kb = KB) => ({ name: 'Offset', kb_m: kb, deviation: dev, td_md_m: dev[dev.length - 1].md });

test('identity to 1e-9: a vertical plan reading its own vertical well by TVDSS equals the bridged reader', () => {
  const curves = logsOn(vertical, KB);
  const bridged = buildMudWindow(curves, vertical, { kbElevM: KB });
  const byTvdss = buildMudWindowByTvdss(curvesByTvdss(curves, well(vertical)).curves, vertical, { kbElevM: KB });
  expect(byTvdss.length).toBe(bridged.length);
  byTvdss.forEach((r, i) => {
    for (const k of ['md', 'tvd', 'tvdss', 'ppMpa', 'fpMpa', 'obgMpa', 'ppPpg', 'fpPpg']) expect(Math.abs(r[k] - bridged[i][k])).toBeLessThan(1e-9);
  });
});

test('identity: a vertical offset with the same KB reproduces the bridged reader on the plan', () => {
  const curves = logsOn(plan, KB);                              // the plan's own logs, as if bridged
  const bridged = buildMudWindow(curves, plan, { kbElevM: KB });
  // the same prognosis on a vertical well with the same KB, applied by TVDSS
  const off = curvesByTvdss(logsOn(vertical, KB), well(vertical));
  const byTvdss = buildMudWindowByTvdss(off.curves, plan, { kbElevM: KB });
  expect(byTvdss.length).toBeGreaterThan(50);
  // compare on the shared rows (the bridged reader stops where the plan's logs do)
  const at = new Map(bridged.map((r) => [r.md, r]));
  let n = 0;
  for (const r of byTvdss) {
    const b = at.get(r.md);
    if (!b) continue;
    n += 1;
    // both linear interpolations of the same smooth truth on a 5 m grid
    expect(r.ppMpa).toBeCloseTo(b.ppMpa, 3);
    expect(r.fpMpa).toBeCloseTo(b.fpMpa, 3);
    expect(r.tvd).toBe(b.tvd);
  }
  expect(n).toBeGreaterThan(50);
});

test('a deviated offset: pressure at equal TVDSS is the offset pressure there (negative control by MD fails)', () => {
  const offCurves = logsOn(deviated, KB);
  const off = curvesByTvdss(offCurves, well(deviated));
  const rows = buildMudWindowByTvdss(off.curves, plan, { kbElevM: KB });
  const deep = rows.filter((r) => r.tvdss > 1500);
  expect(deep.length).toBeGreaterThan(10);
  for (const r of deep) expect(Math.abs(r.ppMpa - ppAt(r.tvdss))).toBeLessThan(2e-3);
  // negative control: the same curves read at the plan's MD (the bridged reader) miss by far more
  const byMd = buildMudWindow(offCurves, plan, { kbElevM: KB });
  const worst = Math.max(...byMd.filter((r) => r.tvdss > 1500).map((r) => Math.abs(r.ppMpa - ppAt(r.tvdss))));
  expect(worst).toBeGreaterThan(0.1); // 50x the tolerance above
});

test('a KB difference: same pressure at a TVDSS, EMW at this well own TVD below KB', () => {
  const off = curvesByTvdss(logsOn(vertical, 10), well(vertical, 10));
  const rows = buildMudWindowByTvdss(off.curves, plan, { kbElevM: KB });
  const r = rows.find((x) => x.tvdss > 1600);
  expect(Math.abs(r.ppMpa - ppAt(r.tvdss))).toBeLessThan(2e-3);
  expect(r.tvd - r.tvdss).toBeCloseTo(KB, 9);
  expect(r.ppPpg).toBeCloseTo((r.ppMpa * 1e6) / (G * r.tvd) / KG_M3_PER_PPG, 12);
});

test('mud-weight curves convert to pressure at the offset own TVD', () => {
  // a ppg curve: value = P / (g * tvd_offset) / KGM3_PER_PPG
  const toPpg = (mpa, tvd) => (mpa * 1e6) / (G * tvd) / KG_M3_PER_PPG;
  const offCurves = logsOn(deviated, 10, { unit: 'ppg', conv: toPpg });
  const off = curvesByTvdss(offCurves, well(deviated, 10));
  const rows = buildMudWindowByTvdss(off.curves, plan, { kbElevM: KB });
  for (const r of rows.filter((x) => x.tvdss > 1000)) expect(Math.abs(r.ppMpa - ppAt(r.tvdss))).toBeLessThan(2e-3);
});

test('an offset with no depth reference is refused with the reason', () => {
  const w = { name: 'NoDatum', kb_m: null, depth_ref_elev_m: null, depth_ref_kind: null, deviation: vertical };
  const r = curvesByTvdss(logsOn(vertical, KB), w);
  expect(r.error).toMatch(/no depth reference elevation/);
  expect(r.curves).toEqual({});
});

test('casing seats come out on this trajectory MD', () => {
  const off = curvesByTvdss(logsOn(vertical, KB), well(vertical));
  const rows = buildMudWindowByTvdss(off.curves, plan, { kbElevM: KB });
  const seats = casingSeatsOnWindow(rows, { fromTvdM: 300 });
  expect(seats && !seats.error).toBeTruthy();
  for (const s of seats.seats) {
    const md = sampleCurve(rows.map((x) => x.tvd), rows.map((x) => x.md), s.tvd);
    expect(s.md).toBeCloseTo(md, 6);
  }
});

test('source candidates: readable PP or FP only, bridged first, then nearest, same CRS', () => {
  const wells = [
    { id: 'a', name: 'Far', crs: 'EPSG:32632', surface_x: 1000, surface_y: 0 },
    { id: 'b', name: 'Near', crs: 'EPSG:32632', surface_x: 10, surface_y: 0 },
    { id: 'c', name: 'Bridged', crs: 'EPSG:32632', surface_x: 0, surface_y: 0 },
    { id: 'd', name: 'Other CRS', crs: 'EPSG:32631', surface_x: 0, surface_y: 0 },
    { id: 'e', name: 'Logs only', crs: 'EPSG:32632', surface_x: 0, surface_y: 0 },
    { id: 'f', name: 'Bad unit', crs: 'EPSG:32632', surface_x: 0, surface_y: 0 },
  ];
  const meta = [
    { well_id: 'a', mnemonic: 'PP', unit: 'MPa' }, { well_id: 'b', mnemonic: 'FP', unit: 'psi' },
    { well_id: 'c', mnemonic: 'PP', unit: 'MPa' }, { well_id: 'd', mnemonic: 'PP', unit: 'MPa' },
    { well_id: 'e', mnemonic: 'GR', unit: 'API' }, { well_id: 'f', mnemonic: 'PP', unit: 'API' },
  ];
  const c = ppfgSourceCandidates(wells, meta, { bridgedId: 'c', siteCrs: 'EPSG:32632', wellhead: { x: 0, y: 0 } });
  expect(c.map((x) => x.name)).toEqual(['Bridged', 'Near', 'Far']);
  expect(c[0].bridged).toBe(true);
});
