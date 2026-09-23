// Production engineering for the Ekene kit: the design values and the
// derivations, shared by domains/production.mjs (which writes and asserts)
// and __tests__/domain.production.test.js (which reads the kit back through
// the applications' own parsers and engines).
//
// Nothing here is a free number unless it sits in DESIGN below with its
// reason. Everything else is read from the LOCKED spine, the generated
// production history (packages/engines/test-data/ekene-dynamic) or computed
// by the Suite's own engines.

import fs from 'fs';
import path from 'path';

import { LOCKED, LOCKED_WELLS } from '../../spine.mjs';
import { FACILITY_DESIGN } from '../../d8spine.mjs';

import { getModel, evaluateBuildup } from '../../../../packages/engines/engines/welltest/models/modelCatalog.js';
import { hornerAnalysis } from '../../../../packages/engines/engines/welltest/analysis.js';
import { logDecimate, trimSpikes } from '../../../../packages/engines/engines/welltest/derivative.js';
import { buildFluidModel, waterViscosity } from '../../../../src/utils/nodal/pvt.js';
import { buildTrajectory } from '../../../../src/utils/nodal/trajectory.js';
import { linearGeothermal } from '../../../../src/utils/nodal/temperature.js';
import { computeIpr, pwfAtRate } from '../../../../src/utils/nodal/ipr.js';
import { bhpFromWhp } from '../../../../src/utils/nodal/traverse.js';
import { chokeSize } from '../../../../src/utils/nodal/chokes.js';

// No import.meta here: jest loads this module through babel as CommonJS, so
// the caller hands in the repo root.
const loader = (root) => (f) => JSON.parse(
  fs.readFileSync(path.join(root, 'packages', 'engines', 'test-data', 'ekene-dynamic', f), 'utf8'),
);

export const FT_PER_M = 3.280839895013123;
export const FOLDER = '11-production-engineering';
export const PRODUCERS = ['Ekene-1', 'Ekene-3', 'Ekene-5', 'Ekene-6'];
export const INJECTORS = ['Ekene-2', 'Ekene-4'];

// ------------------------------------------------------------------ DESIGN --
// The only numbers in this domain that are chosen rather than derived.
export const DESIGN = {
  // Metered field totals sit below the sum of the well tests by these
  // factors. Oil and water are the separator meters; gas reads further low
  // because fuel gas is taken off upstream of the gas meter.
  meter_factor: { oil: 0.970, water: 0.980, gas: 0.950 },
  // Well tests: one per producer on the first of every flood month, twelve
  // hours on the test separator. Rates are read to 0.01 bbl/d and Mscf/d.
  test_duration_hours: 12,
  test_rate_decimals: 2,
  // Ekene-1's pressure buildup, run for the February 2025 static survey.
  buildup: {
    well: 'Ekene-1',
    flow_month: '2025-01',     // flowed at the January rate, shut in 2025-02-01
    skin: 5.0,                 // perforated only in the top of a thin oil column
    shut_in_hours: 72,
    points_per_decade: 25,
    first_dt_hours: 0.01,
    horner_window_hours: [1, 72],
  },
  // Completion and wellhead: 2-7/8 in tubing in 9-5/8 in casing, 12-1/4 in hole.
  tubing_id_in: 2.441,
  casing_id_in: 8.681,
  hole_diameter_in: 12.25,
  roughness_in: 0.0006,
  wellhead_temp_f: 90,        // a low-rate well arrives near sea temperature
  vlp_correlation: 'hagedornBrown', // the standard for vertical oil wells
  traverse_step_ft: 100,
  // ESP for Ekene-6 on the day it stops flowing. The water cut of that day
  // is not chosen: production.mjs finds it with the nodal solve.
  esp: {
    well: 'Ekene-6',
    design_liquid_stbd: 800,        // in situ near the 400 series best efficiency point
    pump_tvd_m: 1500,               // 46 m above the Ekene-6 top sand
    whp_psia: 200,                  // separator plus flowline, choke open
    annulus_grad_psi_ft: 0.1,       // gas vented up the annulus above the pump
    separator_efficiency_pct: 70,
    stage: 'ref-400-1000',
    hz: 60,
    motor: { id: 'm-60-1000', hp: 60, volts: 1000, amps: 38 },
    motor_efficiency_pct: 85,
    power_factor: 0.85,
    cable_temp_f: 135,
    max_drop_pct: 5,
  },
};

// ----------------------------------------------------------------- HISTORY --

export const daysIn = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** The dynamic fixture. */
export function fixture(root) {
  const load = loader(root);
  return {
    rates: load('rates.json'),
    flood: load('waterflood.json'),
    mbal: load('mbal.json'),
  };
}

/**
 * Reservoir pressure on the first of a month: the end of the previous month
 * on the waterflood pressure track, and the material balance survey of
 * 2023-01-01 for the first flood month.
 */
export function pressureAtMonthStart(fx, isoDate) {
  const month = isoDate.slice(0, 7);
  if (month === '2023-01') {
    const row = fx.mbal.inputs.production_data.find((d) => d.observation_date === '2023-01-01');
    return row.pressure_psia;
  }
  const [y, m] = month.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const t = fx.flood.pressure.track.find((r) => r.label === prev);
  if (!t) throw new Error(`no pressure track entry for ${prev}`);
  return t.p_end_psia;
}

// --------------------------------------------------------------------- PVT --

/** Linear interpolation on the lab table (bo and viscosity are linear in it). */
export function labPvtAt(fx, p) {
  const tab = [...fx.mbal.inputs.pvt_lab_table].sort((a, b) => a.pressure_psia - b.pressure_psia);
  let i = tab.findIndex((r) => r.pressure_psia >= p);
  if (i <= 0) i = 1;
  const a = tab[i - 1];
  const b = tab[i];
  const f = (p - a.pressure_psia) / (b.pressure_psia - a.pressure_psia);
  return {
    bo: a.bo_rb_stb + f * (b.bo_rb_stb - a.bo_rb_stb),
    mu: a.oil_viscosity_cp + f * (b.oil_viscosity_cp - a.oil_viscosity_cp),
    // undersaturated oil compressibility from the slope of the lab Bo line
    co: -(b.bo_rb_stb - a.bo_rb_stb) / (b.pressure_psia - a.pressure_psia)
      / (a.bo_rb_stb + f * (b.bo_rb_stb - a.bo_rb_stb)),
  };
}

// --------------------------------------------------------------- GEOMETRY --

export const DATUM_FT = LOCKED.owc_m * FT_PER_M;   // node and gauge at the 1560 m datum
/** Net oil pay at a well: sand top to the contact, times net to gross, in ft. */
export const netOilPayFt = (name) => {
  const w = LOCKED_WELLS.find((x) => x.name === name);
  return (LOCKED.owc_m - w.top_sand) * LOCKED.ntg * FT_PER_M;
};

// --------------------------------------------------------------- BUILDUP --

/**
 * Ekene-1's buildup, forward-modelled with the Well Test Analysis engine's
 * own homogeneous infinite-acting model. Every input is derived except the
 * skin.
 */
export function buildupDesign(fx) {
  const B = DESIGN.buildup;
  const e1 = fx.rates.wells.find((w) => w.name === B.well);
  const flowDate = `${B.flow_month}-01`;
  const q = e1.monthly.find((m) => m.date === flowDate).oil_bpd;
  // cumulative oil to the shut-in (monthly volume = rate x days)
  const np = e1.monthly.filter((m) => m.date <= flowDate).reduce((a, m) => a + m.oil_bpd * daysIn(m.date), 0);
  const pi = fx.flood.pressure.track.find((t) => t.label === B.flow_month).p_end_psia;
  const pvt = labPvtAt(fx, pi);
  const cf = fx.mbal.inputs.formation_compressibility_psi;
  const cw = fx.mbal.inputs.water_compressibility_psi;
  const ct = (1 - LOCKED.swi) * pvt.co + LOCKED.swi * cw + cf;
  // effective permeability to oil at Swi: the Corey endpoint times the rock
  const kEff = LOCKED.k_md * LOCKED.kr.kroMax;
  const h = netOilPayFt(B.well);
  const rw = DESIGN.hole_diameter_in / 24;
  // wellbore storage: the liquid-filled tubing, compressed at the oil's co
  const tubingBbl = ((DESIGN.tubing_id_in ** 2) / 1029.4) * DATUM_FT;
  const C = tubingBbl * pvt.co;
  const tp = (np / q) * 24;   // Horner's equivalent producing time, hours

  const reservoir = { h, phi: LOCKED.phi, rw, B: pvt.bo, mu: pvt.mu, ct, q, pi };
  const dts = [];
  const decades = Math.log10(B.shut_in_hours / B.first_dt_hours);
  const nPts = Math.round(decades * B.points_per_decade);
  for (let i = 0; i <= nPts; i += 1) dts.push(B.first_dt_hours * 10 ** ((decades * i) / nPts));
  const pts = evaluateBuildup({
    model: getModel('homogeneous'), params: { k: kEff, skin: B.skin, C }, reservoir, tp, dts,
  });
  return {
    q, np, tp, pi, pvt, ct, cf, cw, kEff, h, rw, C, tubingBbl, reservoir,
    skin: B.skin, points: pts.map((p) => ({ dt: p.dt, pws: p.pws })), pwfAtShutIn: pts.pwfAtShutIn,
  };
}

/**
 * What the Well Test Analysis Studio does to an oil buildup before a
 * straight line sees it (WellTestStudioContext.prepareTestData with its
 * defaults: spike filter on at 6, 15 points per decade). Mirrored here
 * because the generator cannot load the React context; the gate runs the
 * real one on the same file and checks the note against it.
 */
export function studioBuildupPoints(points, pwfShutIn) {
  const rows = points.map((p) => ({ t: p.dt, p: p.pws })).filter((r) => r.t > 0).sort((a, b) => a.t - b.t);
  const { kept } = trimSpikes(rows, { threshold: 6, yKey: 'p' });
  const dec = logDecimate(kept, { pointsPerDecade: 15, xKey: 't' });
  return dec.filter((r, i) => r.p - pwfShutIn > 0 || i === 0).map((r) => ({ dt: r.t, pws: r.p }));
}

/** Horner on a (dt, pws) window with the engine's analysis. */
export function hornerOn(bu, points, { lo, hi }, overrides = {}) {
  const r = { ...bu.reservoir, ...overrides };
  return hornerAnalysis({
    points: points.filter((p) => p.dt >= lo && p.dt <= hi),
    tp: overrides.tp ?? bu.tp,
    pwfShutIn: overrides.pwfShutIn ?? bu.pwfAtShutIn,
    ...r,
  });
}

// ------------------------------------------------------------------ NODAL --

export const fluidModel = () => buildFluidModel({
  api: LOCKED.api, gasSg: LOCKED.gas_sg, gor: LOCKED.rsi_scf_stb, salinityPpm: LOCKED.salinity_ppm,
});

/** The vertical well to the datum, as the Nodal Analysis Studio builds it. */
export function wellGeometry(depthFt) {
  const trajectory = buildTrajectory({ mode: 'vertical', depthFt });
  const tAt = linearGeothermal({ whtF: DESIGN.wellhead_temp_f, bhtF: LOCKED.temp_f, tvdMaxFt: trajectory.tvdMax });
  return { trajectory, tAt, nodeMd: trajectory.mdMax };
}

/**
 * Tubing head pressure at which the tubing delivers exactly `q` stb/d of oil
 * into the node pressure the inflow gives at that rate. Solved by bisection
 * on the studio's own downward traverse, so the Nodal Analysis Studio run at
 * this THP puts a crossing back on `q`.
 */
export function thpForRate({ ipr, q, wct, gor, depthFt, fm }) {
  const geo = wellGeometry(depthFt);
  const target = pwfAtRate(ipr, q);
  const vlp = {
    fluidModel: fm, trajectory: geo.trajectory, tAt: geo.tAt, idIn: DESIGN.tubing_id_in,
    roughnessIn: DESIGN.roughness_in, correlation: DESIGN.vlp_correlation, nodeMd: geo.nodeMd,
    stepFt: DESIGN.traverse_step_ft, rates: { wct, gor },
  };
  const f = (whp) => bhpFromWhp({ ...vlp, whp, rates: { ...vlp.rates, qo: q } }).pEnd - target;
  // Illinois false position: the node pressure is close to linear in the
  // wellhead pressure, so this converges in a handful of traverses.
  let a = 20;
  let b = 1500;
  let fa = f(a);
  let fb = f(b);
  if (!(fa < 0 && fb > 0)) throw new Error(`THP bracket failed at q ${q}`);
  let side = 0;
  let c = a;
  for (let i = 0; i < 60; i += 1) {
    c = (a * fb - b * fa) / (fb - fa);
    const fc = f(c);
    if (Math.abs(fc) < 1e-6 || b - a < 1e-6) break;
    if (fc > 0) {
      b = c; fb = fc;
      if (side === 1) fa /= 2;
      side = 1;
    } else {
      a = c; fa = fc;
      if (side === -1) fb /= 2;
      side = -1;
    }
  }
  return { thp: c, pwf: target };
}

export const compositeIpr = ({ pr, pi }) => computeIpr({ model: 'composite', pr, pb: LOCKED.pb_psia, pi });

/** Gilbert choke size (64ths) passing a liquid rate at a THP. */
export const gilbertChoke = ({ thp, liquid, glr }) => chokeSize({ pwh: thp, q: liquid, glr, correlation: 'gilbert' });

// -------------------------------------------------------------------- ESP --

/**
 * Oil productivity index at a surface water cut, from the LOCKED Corey set:
 * the water saturation at which the reservoir delivers that cut, and the
 * oil relative permeability there against its endpoint.
 */
export function oilPiAtWatercut({ jOilAtSwi, wct, p, fx }) {
  const { Swc, Sor, krwMax, kroMax, nw, no } = LOCKED.kr;
  const pvt = labPvtAt(fx, p);
  const muW = waterViscosity(p, LOCKED.temp_f, LOCKED.salinity_ppm);
  const bw = LOCKED.bw_rb_stb;
  const cutAt = (sw) => {
    const sn = (sw - Swc) / (1 - Swc - Sor);
    const krw = krwMax * sn ** nw;
    const kro = kroMax * (1 - sn) ** no;
    const qw = krw / (muW * bw);
    const qo = kro / (pvt.mu * pvt.bo);
    return { cut: qw / (qw + qo), kro, krw };
  };
  let a = Swc + 1e-9;
  let b = 1 - Sor - 1e-9;
  for (let i = 0; i < 80; i += 1) {
    const m = (a + b) / 2;
    if (cutAt(m).cut < wct) a = m; else b = m;
  }
  const sw = (a + b) / 2;
  const at = cutAt(sw);
  return { sw, kro: at.kro, krw: at.krw, muW, jOil: jOilAtSwi * (at.kro / kroMax) };
}

export const SEPARATOR_PSIA = FACILITY_DESIGN.separator_pressure_psig + 14.7;
