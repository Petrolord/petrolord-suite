/**
 * Pore Pressure Studio upgrade U2 (docs/upgrade/PorePressureStudio-UPGRADE.md,
 * Step 2 build). Every test calls the shipped functions; numeric tests carry
 * an in-test negative control.
 */

import fs from 'fs';
import path from 'path';
import { computeProfile } from '../engine/profile';
import { seatHolds } from '../engine/casingSeats';
import {
  casingDesign, marginsOf, DEFAULT_MARGINS, KG_M3_PER_PPG_DOCK, WINDOW_FROM_BML_M,
} from '../services/drillingWindow';
import { reviewerLines } from '../services/report';
import { emwPpg, emwReferenceDepthM } from '../services/units';
import { casingSeatsOnWindow } from '../../well-planning/services/ppfg';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure');
const W = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8')).well;
const P = W.params;
export const PARAMS = {
  waterDepthM: P.water_depth_m,
  rhoSeawaterKgM3: P.rho_seawater,
  rhoFluidKgM3: P.rho_fluid,
  mudlineMdM: 130,
  nct: { dtMlUsPerM: P.dt_ml_us_per_m, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: P.c_nct_per_m },
  method: 'eaton',
  eatonN: P.eaton_n,
  nu: P.nu,
};
const INPUT = { zBmlM: W.z_bml_m, dtUsPerM: W.dt_us_per_m, rhoKgM3: W.rho_kg_m3 };
// nu 0.25 (K 1/3) brings the fracture line close enough for the ramp below
// 2,500 m to need a protective string; nu 0.4 (the goldens) needs none
const SEAT_PARAMS = { ...PARAMS, nu: 0.25 };
const RESULT = computeProfile({ ...INPUT, params: SEAT_PARAMS });
const RESULT_04 = computeProfile({ ...INPUT, params: PARAMS });

describe('U2-003 kick and trip margins and casing seats', () => {
  test('defaults are 0.5 ppg each; the seats follow the engine on the prognosis in ppg EMW', () => {
    expect(DEFAULT_MARGINS.tripKgM3 / KG_M3_PER_PPG_DOCK).toBeCloseTo(0.5, 12);
    const c = casingDesign(RESULT, W.z_bml_m, SEAT_PARAMS);
    expect(c.error).toBeUndefined();
    expect(c.tripPpg).toBeCloseTo(0.5, 12);
    expect(c.zBmlM[0]).toBeGreaterThanOrEqual(WINDOW_FROM_BML_M);
    // the lines are PP + trip and FG - kick at each depth, in ppg against the window's datum
    const k = c.zBmlM.indexOf(3500);
    const ref = emwReferenceDepthM(3500, PARAMS);
    const i = W.z_bml_m.indexOf(3500);
    expect(c.mudPpg[k]).toBeCloseTo(emwPpg(RESULT.porePressurePa[i], ref) + 0.5, 10);
    expect(c.designFgPpg[k]).toBeCloseTo(emwPpg(RESULT.fracPressurePa[i], ref) - 0.5, 10);
    // the overpressure ramp below 2,500 m needs a protective string, and every
    // seat holds the mud that drills below it to the next one (engine's own check)
    expect(c.seats.length).toBeGreaterThanOrEqual(1);
    const ppg = (arr) => c.zBmlM.map((z) => { const j = W.z_bml_m.indexOf(z); return emwPpg(arr[j], emwReferenceDepthM(z, PARAMS)); });
    const design = { depths: c.zBmlM, ppEmw: ppg(RESULT.porePressurePa), fgEmw: ppg(RESULT.fracPressurePa), tripMargin: 0.5, kickMargin: 0.5 };
    const bases = [...c.seats.map((s) => s.zBmlM).slice(1), c.zBmlM[c.zBmlM.length - 1]];
    c.seats.forEach((s, n) => expect(seatHolds(design, s.zBmlM, bases[n])).toBe(true));
    // sections join up from the cut-off to TD
    expect(c.sections[0].topBmlM).toBe(c.zBmlM[0]);
    expect(c.sections[c.sections.length - 1].baseBmlM).toBe(c.zBmlM[c.zBmlM.length - 1]);
    // negative control: no margins lets the open hole reach higher (fewer or shallower seats)
    const none = casingDesign(RESULT, W.z_bml_m, { ...SEAT_PARAMS, margins: { tripKgM3: 0, kickKgM3: 0 } });
    const deepest = (x) => (x.seats.length ? x.seats[x.seats.length - 1].zBmlM : 0);
    expect(none.seats.length < c.seats.length || deepest(none) < deepest(c) - 1).toBe(true);
  });

  test('margins too large close the window and say where; a minimum shallow seat is honoured', () => {
    const big = casingDesign(RESULT, W.z_bml_m, { ...SEAT_PARAMS, margins: { tripKgM3: 3 * KG_M3_PER_PPG_DOCK, kickKgM3: 3 * KG_M3_PER_PPG_DOCK } });
    expect(big.closedAtBmlM).not.toBeNull();
    const min = casingDesign(RESULT, W.z_bml_m, { ...SEAT_PARAMS, margins: { ...DEFAULT_MARGINS, minShallowSeatBmlM: 800 } });
    expect(min.seats[0].zBmlM).toBeGreaterThanOrEqual(800);
    expect(marginsOf({}).kickKgM3).toBe(DEFAULT_MARGINS.kickKgM3);
    expect(casingDesign(RESULT, [0, 100], PARAMS).error).toMatch(/below 300 m/);
    // the goldens' own well (nu 0.4) holds its TD mud to the cut-off: no string
    const easy = casingDesign(RESULT_04, W.z_bml_m, PARAMS);
    expect(easy.seats).toHaveLength(0);
    expect(easy.sections).toHaveLength(1);
    expect(easy.sections[0].marginPpg).toBeGreaterThan(0);
  });

  test('the reviewer block carries the margins and the seats', () => {
    const casing = casingDesign(RESULT, W.z_bml_m, SEAT_PARAMS);
    const lines = reviewerLines({
      wellName: 'ORACLE PP-1', params: SEAT_PARAMS, units: { depth: 'm', pressure: 'MPa' }, input: INPUT, result: RESULT, casing,
    });
    const line = lines.find((l) => l.startsWith('Casing seats'));
    expect(line).toMatch(/trip margin 0.50 ppg, kick margin 0.50 ppg/);
    expect(line).toMatch(/shoe 1 at least/);
  });

  test('Well Design mud window: the same engine on trajectory rows, seats in TVD and MD', () => {
    // rows as buildMudWindow gives them on a vertical hole (MD = TVD + 0)
    const rows = W.z_bml_m.filter((z) => z >= 300).map((z) => {
      const i = W.z_bml_m.indexOf(z);
      const tvd = z + 130;
      const ppg = (pa) => pa / (9.80665 * tvd) / 119.82642731689663;
      return { md: tvd, tvd, ppPpg: ppg(RESULT.porePressurePa[i]), fpPpg: ppg(RESULT.fracPressurePa[i]) };
    });
    const s = casingSeatsOnWindow(rows, { tripPpg: 0.5, kickPpg: 0.5 });
    expect(s.seats.length).toBeGreaterThanOrEqual(1);
    s.seats.forEach((q) => expect(q.md).toBeCloseTo(q.tvd, 9));
    // the same seats as the Pore Pressure app within the 0.1% ppg convention gap (PP-U1-019)
    const c = casingDesign(RESULT, W.z_bml_m, SEAT_PARAMS);
    expect(s.seats.length).toBe(c.seats.length);
    s.seats.forEach((q, k) => expect(Math.abs(q.tvd - (c.seats[k].zBmlM + 130))).toBeLessThan(15));
    // negative control: margins 0 move the deepest seat
    const z0 = casingSeatsOnWindow(rows, { tripPpg: 0, kickPpg: 0 });
    expect(z0.seats.length < s.seats.length || z0.seats[z0.seats.length - 1].tvd < s.seats[s.seats.length - 1].tvd - 1).toBe(true);
    expect(casingSeatsOnWindow([], {})).toBeNull();
  });
});
