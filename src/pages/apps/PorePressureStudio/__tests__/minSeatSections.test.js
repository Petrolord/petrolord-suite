// The window per section after a user's shallowest seat (2026-10-14): the
// sections follow the seats as set. Found on the Ekene copy: with "Shallowest
// seat at least 4,500 ft bml" the first shoe moved to 4,697 ft MD while the
// first section still ended at the replaced 4,107 ft shoe.
import fs from 'fs';
import path from 'path';
import { computeProfile } from '../engine/profile';
import { casingSeatsBottomUp } from '../engine/casingSeats';
import { casingDesign, sectionsFromSeats, DEFAULT_MARGINS } from '../services/drillingWindow';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure');
const W = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8')).well;
const P = W.params;
const PARAMS = {
  waterDepthM: P.water_depth_m, rhoSeawaterKgM3: P.rho_seawater, rhoFluidKgM3: P.rho_fluid, mudlineMdM: 130,
  nct: { dtMlUsPerM: P.dt_ml_us_per_m, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: P.c_nct_per_m }, method: 'eaton', eatonN: P.eaton_n, nu: P.nu,
};
const SEAT_PARAMS = { ...PARAMS, nu: 0.25 };
const RESULT = computeProfile({ zBmlM: W.z_bml_m, dtUsPerM: W.dt_us_per_m, rhoKgM3: W.rho_kg_m3, params: SEAT_PARAMS });
const withMin = (m) => casingDesign(RESULT, W.z_bml_m, { ...SEAT_PARAMS, margins: { ...DEFAULT_MARGINS, minShallowSeatBmlM: m } });

describe('sections follow the seats', () => {
  const plain = casingDesign(RESULT, W.z_bml_m, SEAT_PARAMS);

  test('on the engine\'s own seats the recomputed sections are the engine\'s sections', () => {
    const again = sectionsFromSeats(plain.zBmlM, plain.mudPpg, plain.designFgPpg, plain.seats.map((s) => s.zBmlM));
    expect(again).toHaveLength(plain.sections.length);
    again.forEach((s, k) => {
      expect(s.top).toBeCloseTo(plain.sections[k].topBmlM, 9);
      expect(s.base).toBeCloseTo(plain.sections[k].baseBmlM, 9);
      expect(s.mud).toBeCloseTo(plain.sections[k].mudPpg, 9);
    });
  });

  test('a deeper minimum moves the first section\'s base to the new shoe, and the next section starts there', () => {
    const first = plain.seats[0].zBmlM;
    const second = plain.seats[1] ? plain.seats[1].zBmlM : plain.zBmlM[plain.zBmlM.length - 1];
    const m = first + 0.5 * (second - first);
    const c = withMin(m);
    expect(c.seats[0].zBmlM).toBeCloseTo(m, 9);
    expect(c.seats[0].driver).toBe('minimum shallow seat');
    expect(c.sections[0].baseBmlM).toBeCloseTo(m, 9);
    expect(c.sections[1].topBmlM).toBeCloseTo(m, 9);
    // contiguous from the top to TD
    for (let k = 1; k < c.sections.length; k++) expect(c.sections[k].topBmlM).toBeCloseTo(c.sections[k - 1].baseBmlM, 9);
    // the longer top section drills deeper, so it needs at least as much mud as before
    expect(c.sections[0].mudPpg).toBeGreaterThanOrEqual(plain.sections[0].mudPpg - 1e-12);
  });

  test('negative control: the engine alone keeps the replaced shoe as the first section base', () => {
    const first = plain.seats[0].zBmlM;
    const second = plain.seats[1] ? plain.seats[1].zBmlM : plain.zBmlM[plain.zBmlM.length - 1];
    const m = first + 0.5 * (second - first);
    const r = casingSeatsBottomUp({ depths: plain.zBmlM, ppEmw: plain.mudPpg.map((v) => v - plain.tripPpg), fgEmw: plain.designFgPpg.map((v) => v + plain.kickPpg), tripMargin: plain.tripPpg, kickMargin: plain.kickPpg, minShallowSeat: m });
    expect(r.seats[0].depth).toBeCloseTo(m, 9);
    expect(Math.abs(r.sections[0].base - m)).toBeGreaterThan(1);
  });
});
