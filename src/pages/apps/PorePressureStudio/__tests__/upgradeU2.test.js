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

// ---- U2-002 calibration imports (hostile file set) ---------------------------
import {
  parseCalibrationTable, convertCalibration, missingChoices, comparesTo,
} from '../services/calibrationImport';
import { calibrationMisfit, inputNotes } from '../services/honesty';
import { makeDepthFrame } from '../../../../../packages/engines/engines/welldata/checkshots';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'porepressure', 'hostile');
const readFix = (f) => fs.readFileSync(path.join(HOSTILE, f), 'utf8');
const CTX = { frame: null, kbM: 30, mudlineMdM: 130, waterDepthM: 100 };
const ppAt = (z) => W.pore_pressure_pa[W.z_bml_m.indexOf(z)] / 1e6;

describe('U2-002 calibration imports', () => {
  test('RFT/MDT: semicolons, comma decimals, TVDSS in m, psi, a -999.25 null and a lost-seal row', () => {
    const t = parseCalibrationTable(readFix('rft_mdt_tvdss_psi_semicolon_comma.csv'));
    expect(t.delim).toBe(';');
    expect(t.commaDecimal).toBe(true);
    expect(t.guess).toMatchObject({ depthRef: 'tvdss', depthUnit: 'm', valueUnit: 'psi', kind: 'rft' });
    expect(t.columns[t.guess.kindCol]).toBe('Type');
    const { points, skipped } = convertCalibration(t, t.guess, CTX);
    expect(points).toHaveLength(4);
    // TVDSS 3100 m + KB 30 = TVD 3130 m = 3000 m below the 130 m mudline
    expect(points[2].z).toBeCloseTo(3000, 9);
    expect(points[2].pMpa).toBeCloseTo(ppAt(3000), 3);
    expect(skipped.map((s) => s.reason)).toEqual(['vendor null (-999)', 'not a number']);
    // the points compare with the pore pressure at the digit the file carries
    const mis = calibrationMisfit(points, W.z_bml_m, W.pore_pressure_pa);
    expect(mis.rmsMpa).toBeLessThan(0.001);
    // negative control: TVDSS read as TVD below RKB puts every point 30 m shallow
    const wrong = convertCalibration(t, { ...t.guess, depthRef: 'tvd' }, CTX).points;
    expect(points[2].z - wrong[2].z).toBeCloseTo(30, 9);
  });

  test('LOT/FIT/XLOT: tabs, units in a second header line, MD, EMW in ppg', () => {
    const t = parseCalibrationTable(readFix('lot_fit_md_ppg_tab_units_row.txt'));
    expect(t.delim).toBe('tab');
    expect(t.headerLines).toBe(2);
    expect(t.guess).toMatchObject({ depthRef: 'md', depthUnit: 'm', valueUnit: 'ppg', kind: 'lot' });
    const { points } = convertCalibration(t, t.guess, CTX);
    expect(points.map((p) => p.kind)).toEqual(['lot', 'fit', 'xlot']);
    points.forEach((p) => expect(comparesTo(p)).toBe('fg'));
    // EMW converts at the TVD below RKB (ppfgUnits): 13.382 ppg at 1,130 m
    expect(points[0].pMpa).toBeCloseTo((13.382 * 119.82642731689663 * 9.80665 * 1130) / 1e6, 9);
    // they are left out of the pore pressure misfit and compared with FG
    expect(calibrationMisfit(points, W.z_bml_m, W.pore_pressure_pa).points).toHaveLength(0);
    const fg = calibrationMisfit(points, W.z_bml_m, W.frac_pressure_pa, 'fg');
    expect(fg.points).toHaveLength(3);
    expect(fg.rmsMpa).toBeLessThan(0.05); // 0.001 ppg file rounding
  });

  test('mud weights with no header: nothing is assumed until every choice is declared', () => {
    const t = parseCalibrationTable(readFix('mud_weights_md_sg_no_header.csv'));
    expect(t.columns).toEqual(['Column 1', 'Column 2']);
    expect(t.guess.depthRef).toBeNull();
    const m = { ...t.guess, kind: null };
    expect(missingChoices(m, CTX)).toEqual([
      'declare the depth reference (MD, TVD, TVDSS or below mudline)', 'declare the depth unit', 'declare the pressure unit',
      'choose what the values are (RFT/MDT, kick, LOT, FIT, XLOT or mud weight)',
    ]);
    expect(() => convertCalibration(t, m, CTX)).toThrow(/Before import: declare the depth reference/);
    const { points } = convertCalibration(t, { ...m, depthRef: 'md', depthUnit: 'm', valueUnit: 'sg', kind: 'mw' }, CTX);
    expect(points).toHaveLength(5);
    expect(points.every((p) => comparesTo(p) === 'mw')).toBe(true);
    expect(points[0].pMpa).toBeCloseTo((1.03 * 1000 * 9.80665 * 1130) / 1e6, 9);
  });

  test('kPa first, extra columns, units in brackets, an n/a row', () => {
    const t = parseCalibrationTable(readFix('rft_kpa_reordered_extra_columns.csv'));
    expect(t.columns[t.guess.valueCol]).toBe('Pressure [kPa]');
    expect(t.columns[t.guess.depthCol]).toBe('Depth MD [m]');
    expect(t.guess.valueUnit).toBe('kPa');
    const { points, skipped } = convertCalibration(t, t.guess, CTX);
    expect(points).toHaveLength(3);
    expect(skipped).toHaveLength(1);
    expect(points[1].pMpa).toBeCloseTo(ppAt(3000), 4);
    expect(points[1].z).toBeCloseTo(3000, 9);
  });

  test('TVD in feet; MD on a deviated well goes through the survey; TVDSS without a KB is refused', () => {
    const t = parseCalibrationTable(readFix('rft_tvd_ft_psi.csv'));
    expect(t.guess.depthRef).toBeNull(); // "Depth (ft)" does not say which depth
    const { points } = convertCalibration(t, { ...t.guess, depthRef: 'tvd', kind: 'rft' }, CTX);
    expect(points[0].z).toBeCloseTo(3000, 2);
    // a 45 degree well below 500 m MD: an MD point lands at its TVD
    const frame = makeDepthFrame({ deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 500, inc: 0, azi: 0 }, { md: 600, inc: 45, azi: 90 }, { md: 6000, inc: 45, azi: 90 }], kbM: 30 });
    const md = parseCalibrationTable('MD (m),P (MPa)\n3130,30\n');
    const dev = convertCalibration(md, { ...md.guess, valueUnit: 'MPa', kind: 'rft' }, { ...CTX, frame });
    const tvd = frame.mdToPosition(3130).tvd;
    expect(dev.points[0].z).toBeCloseTo(tvd - frame.mdToPosition(130).tvd, 6);
    expect(dev.points[0].z).toBeLessThan(2600); // negative control: MD as TVD would be 3000
    expect(missingChoices({ ...md.guess, depthRef: 'tvdss', valueUnit: 'MPa', kind: 'rft' }, { ...CTX, kbM: null }))
      .toContain("TVDSS needs the well's KB elevation, and this source has none");
    expect(() => parseCalibrationTable('  \n')).toThrow(/empty/);
  });

  test('notes: LOT/FIT compared with the fracture pressure, mud weights counted', () => {
    const lot = convertCalibration(parseCalibrationTable(readFix('lot_fit_md_ppg_tab_units_row.txt')), parseCalibrationTable(readFix('lot_fit_md_ppg_tab_units_row.txt')).guess, CTX).points;
    const res = computeProfile({ ...INPUT, params: PARAMS });
    const notes = inputNotes({ input: INPUT, result: res, params: PARAMS, calibration: [...lot, { z: 2000, pMpa: 21, kind: 'mw', source: 'x' }], nctFitted: true });
    expect(notes.find((n) => n.key === 'lot').text).toMatch(/LOT\/FIT: 3 tests against the fracture pressure/);
    expect(notes.find((n) => n.key === 'mw').text).toMatch(/Mud weights used: 1/);
    expect(notes.find((n) => n.key === 'calibration').text).toMatch(/Not calibrated/);
  });
});
