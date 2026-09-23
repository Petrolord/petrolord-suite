// Wave D8 domain: PRODUCTION ENGINEERING (episodes 21 to 25).
// ============================================================================
// Five applications on the field the earlier episodes built:
//   21 Production Surveillance Studio   the ledger and the well tests
//   22 Production Allocation Studio     metered totals against the tests
//   23 Well Test Analysis Studio        Ekene-1's February 2025 buildup
//   24 Nodal Analysis Studio            Ekene-1 at the end of history
//   25 ESP Design Studio                Ekene-6 on the day it stops flowing
//
// The ledger is the 08-production history, reshaped. The tests are that
// history on the test separator. The buildup is forward-modelled with the
// Well Test Analysis engine from the LOCKED rock and PVT. The tubing head
// pressures come from the Nodal Analysis Studio's own traverse. Every claim
// a note makes is asserted here, and domain.production.test.js reads the
// files back through the applications' parsers.
// ============================================================================

import fs from 'fs';
import path from 'path';

import { LOCKED } from '../spine.mjs';
import {
  DESIGN, FOLDER, PRODUCERS, INJECTORS, FT_PER_M, DATUM_FT, SEPARATOR_PSIA,
  fixture, daysIn, pressureAtMonthStart, netOilPayFt, buildupDesign, hornerOn,
  fluidModel, wellGeometry, thpForRate, compositeIpr, gilbertChoke, oilPiAtWatercut, studioBuildupPoints,
} from './production/engineering.mjs';

import { computeAllocation, validateWellTests } from '../../../packages/engines/engines/production/allocation.js';
import { buildWellSeries } from '../../../packages/engines/engines/production/surveillance.js';
import { solveOperatingPoint } from '../../../src/utils/nodal/system.js';
import { bhpFromWhp } from '../../../src/utils/nodal/traverse.js';
import { pwfAtRate } from '../../../src/utils/nodal/ipr.js';
import { buildWellModel } from '../../../src/utils/production/wellModel.js';
import { runEspDesign, solveEspOperatingPoint, buildStageCurve } from '../../../src/utils/production/esp.js';

const f2 = (v) => v.toFixed(2);
const f4 = (v) => v.toFixed(4);
const num = (s) => Number(s);
const splitCsv = (text) => {
  const [head, ...lines] = text.trim().split('\n');
  const h = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [h[i], v])));
};
const sheet = (rows) => `${['section,field,value,unit,source',
  ...rows.map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))].join('\n')}\n`;

export async function build(ctx) {
  const { write, csv, say, assertClose, OUT, ROOT } = ctx;
  const fx = fixture(ROOT);
  const rel = (f) => `${FOLDER}/${f}`;

  // =========================================================================
  // 1. The ledger: 08-production reshaped into the po_* daily schema.
  // =========================================================================
  // One row per well per month, dated the first. Under the kit's monthly
  // convention (the rate on the first held flat for the month) that row IS the
  // volume of one producing day, so the file is a daily ledger sampled
  // monthly. The full daily history would be about 10,800 rows, and the
  // studio reads the ledger back in one unpaginated select, which the API caps
  // (1,000 rows by default); 345 rows load whole.
  const monthly = splitCsv(fs.readFileSync(path.join(OUT, '08-production', 'ekene-production-monthly.csv'), 'utf8'));
  const ledgerRows = monthly.map((r) => ({
    date: r.date, well: r.well,
    oil: r.oil_rate_bopd, water: r.water_rate_bwpd, gas: r.gas_rate_mscfd, inj: r.injection_rate_bwpd,
  }));
  if (ledgerRows.length >= 1000) throw new Error(`ASSERT ledger has ${ledgerRows.length} rows; the studio reads 1,000.`);
  write(rel('ekene-daily-production.csv'), csv(
    ['date', 'well', 'oil_stb', 'water_stb', 'gas_mscf', 'winj_stb', 'hours_on'],
    ledgerRows.map((r) => [r.date, r.well, r.oil, r.water, r.gas, r.inj, '24']),
  ));

  // Monthly totals reproduce the kit's volumes: every flood month against the
  // VRR ledger, every primary month against the planted declines.
  {
    const byMonth = new Map();
    for (const r of ledgerRows) {
      const d = daysIn(r.date);
      const m = byMonth.get(r.date) ?? { oil: 0, water: 0, gas: 0, inj: 0 };
      m.oil += num(r.oil) * d; m.water += num(r.water) * d; m.gas += num(r.gas) * d; m.inj += num(r.inj) * d;
      byMonth.set(r.date, m);
    }
    for (const p of fx.flood.ledger_periods) {
      const m = byMonth.get(`${p.label}-01`);
      assertClose(`ledger oil ${p.label}`, m.oil, p.Np, 0.01);
      assertClose(`ledger water ${p.label}`, m.water, p.Wp, 0.01);
      assertClose(`ledger gas ${p.label}`, m.gas, p.Gp, 0.01);
      assertClose(`ledger injection ${p.label}`, m.inj, p.Wi, 0.01);
    }
    for (const w of fx.rates.wells) {
      for (const mo of w.monthly.filter((x) => x.date < LOCKED.flood_start)) {
        const row = ledgerRows.find((r) => r.well === w.name && r.date === mo.date);
        assertClose(`ledger ${w.name} ${mo.date}`, num(row.oil) * daysIn(mo.date), mo.oil_bpd * daysIn(mo.date), 1e-3);
      }
    }
  }
  const floodMonths = fx.flood.ledger_periods.map((p) => `${p.label}-01`);
  say(`  production engineering: ledger ${ledgerRows.length} rows, monthly volumes match the VRR ledger for all ${floodMonths.length} flood months`);

  // =========================================================================
  // 2. The buildup (Episode 23): the engine's forward model, then Horner.
  // =========================================================================
  const bu = buildupDesign(fx);
  {
    // the flow rate is the ledger's January 2025 rate
    const led = ledgerRows.find((r) => r.well === DESIGN.buildup.well && r.date === `${DESIGN.buildup.flow_month}-01`);
    assertClose('buildup rate is the ledger rate', num(led.oil), bu.q, 1e-6);
    // Independent closed form (no storage, semilog radial flow):
    //   pwf(tp) = pi - m [ log tp + log(k/(phi mu ct rw^2)) - 3.2275 + 0.8686 s ]
    //   pws(dt) = pi - m log((tp + dt)/dt)   once storage is over
    const r = bu.reservoir;
    const m = (162.6 * r.q * r.B * r.mu) / (bu.kEff * r.h);
    const pwfCf = r.pi - m * (Math.log10(bu.tp) + Math.log10(bu.kEff / (r.phi * r.mu * r.ct * r.rw ** 2)) - 3.2275 + 0.8686 * bu.skin);
    assertClose('buildup pwf at shut-in against the closed form', bu.pwfAtShutIn, pwfCf, 0.05);
    for (const p of bu.points.filter((x) => x.dt >= 5)) {
      assertClose(`buildup pws at ${p.dt.toFixed(2)} h against the closed form`, p.pws, r.pi - m * Math.log10((bu.tp + p.dt) / p.dt), 0.02);
    }
  }
  const gaugeRows = bu.points.map((p) => [p.dt.toPrecision(6), p.pws.toFixed(3)]);
  write(rel('ekene-1-buildup-2025-02.csv'), csv(['shut_in_hours', 'pressure_psia'], gaugeRows));
  const pwfShutInStr = bu.pwfAtShutIn.toFixed(3);
  // Horner on the file as written (three decimals), prepared as the studio
  // prepares it, in the note's window.
  const filePts = gaugeRows.map(([t, p]) => ({ dt: num(t), pws: num(p) }));
  const [lo, hi] = DESIGN.buildup.horner_window_hours;
  const wtIn = {
    h: f2(bu.h), phi: String(LOCKED.phi), rw: f4(bu.rw), B: f4(bu.pvt.bo), mu: f4(bu.pvt.mu),
    ct: bu.ct.toExponential(4), q: f2(bu.q), pi: f2(bu.pi), tp: bu.tp.toFixed(0), pwfShutIn: pwfShutInStr,
  };
  const horner = hornerOn(bu, studioBuildupPoints(filePts, num(wtIn.pwfShutIn)), { lo, hi }, {
    h: num(wtIn.h), rw: num(wtIn.rw), B: num(wtIn.B), mu: num(wtIn.mu), ct: num(wtIn.ct), q: num(wtIn.q),
    tp: num(wtIn.tp), pwfShutIn: num(wtIn.pwfShutIn),
  });
  assertClose('Horner k within 2 percent', horner.k / bu.kEff, 1, 0.02);
  assertClose('Horner skin within 0.3', horner.skin, bu.skin, 0.3);
  assertClose('Horner p* is the reservoir pressure at the test', horner.pStar, bu.pi, 0.5);
  // Productivity index from the test itself: rate over (p* - pwf at shut-in).
  const buildupRise = filePts[filePts.length - 1].pws - bu.pwfAtShutIn;
  if (!(buildupRise > 0 && buildupRise < 30)) throw new Error(`ASSERT the buildup rises ${buildupRise} psi; the note calls that small.`);
  const j1Swi = bu.q / (horner.pStar - bu.pwfAtShutIn);
  const j1SwiStr = f4(j1Swi);
  say(`  buildup: Horner k ${horner.k.toFixed(1)} md (ko ${bu.kEff}), skin ${horner.skin.toFixed(2)} (${bu.skin}), `
    + `p* ${horner.pStar.toFixed(2)} psia (survey ${bu.pi.toFixed(2)}), PI ${j1SwiStr} stb/d/psi`);

  // =========================================================================
  // 3. Well tests (Episode 21): the ledger on the test separator, with the
  //    tubing head pressure the Nodal Analysis Studio's traverse needs.
  // =========================================================================
  const fm = fluidModel();
  const depthStr = f2(DATUM_FT);
  const h1 = netOilPayFt('Ekene-1');
  // A producer's oil PI: Ekene-1's buildup PI scaled by net oil pay, then by
  // the oil relative permeability at the water cut it is producing.
  const oilPi = (well, wct, pr) => {
    const jSwi = num(j1SwiStr) * (netOilPayFt(well) / h1);
    return oilPiAtWatercut({ jOilAtSwi: jSwi, wct, p: pr, fx });
  };
  const tests = [];
  for (const date of floodMonths) {
    const pr = num(f2(pressureAtMonthStart(fx, date)));
    for (const well of PRODUCERS) {
      const led = ledgerRows.find((r) => r.well === well && r.date === date);
      const oil = num(num(led.oil).toFixed(DESIGN.test_rate_decimals));
      const water = num(num(led.water).toFixed(DESIGN.test_rate_decimals));
      const gas = num(num(led.gas).toFixed(DESIGN.test_rate_decimals));
      const wctPct = num(((100 * water) / (oil + water)).toFixed(4));
      const J = num(f4(oilPi(well, wctPct / 100, pr).jOil));
      const ipr = compositeIpr({ pr, pi: J });
      const { thp, pwf } = thpForRate({ ipr, q: oil, wct: wctPct / 100, gor: LOCKED.rsi_scf_stb, depthFt: num(depthStr), fm });
      const liquid = oil + water;
      const choke = gilbertChoke({ thp: num(f2(thp)), liquid, glr: (gas * 1000) / liquid });
      tests.push({ date, well, oil, water, gas, wctPct, pr, J, thp: num(f2(thp)), pwf, choke: num(choke.toFixed(1)) });
    }
  }
  write(rel('ekene-well-tests.csv'), csv(
    ['test_date', 'well', 'duration_hours', 'oil_rate_stbd', 'water_rate_stbd', 'gas_rate_mscfd', 'thp_psia', 'choke_64ths'],
    tests.map((t) => [t.date, t.well, DESIGN.test_duration_hours, f2(t.oil), f2(t.water), f2(t.gas), f2(t.thp), t.choke.toFixed(1)]),
  ));
  for (const t of tests) {
    const led = ledgerRows.find((r) => r.well === t.well && r.date === t.date);
    assertClose(`test oil ${t.well} ${t.date}`, t.oil, num(led.oil), 0.005 + 1e-9);
    assertClose(`test water ${t.well} ${t.date}`, t.water, num(led.water), 0.005 + 1e-9);
    assertClose(`test gas ${t.well} ${t.date}`, t.gas, num(led.gas), 0.005 + 1e-9);
  }
  // A flowing well's tubing head pressure has to clear the separator.
  for (const t of tests) {
    if (!(t.thp > SEPARATOR_PSIA)) throw new Error(`ASSERT ${t.well} ${t.date} THP ${t.thp} is below the ${SEPARATOR_PSIA} psia separator.`);
  }
  const thps = tests.map((t) => t.thp);
  const chokes = tests.map((t) => t.choke);
  const critical = tests.filter((t) => SEPARATOR_PSIA / t.thp <= 0.55).length;
  say(`  well tests: ${tests.length} (${PRODUCERS.length} producers x ${floodMonths.length} months), `
    + `THP ${Math.min(...thps).toFixed(0)} to ${Math.max(...thps).toFixed(0)} psia, chokes ${Math.min(...chokes)} to ${Math.max(...chokes)}/64, `
    + `${critical} of them in critical flow against the ${SEPARATOR_PSIA.toFixed(1)} psia separator`);

  // =========================================================================
  // 4. Field totals (Episode 22): the meters read below the well sum.
  // =========================================================================
  const MF = DESIGN.meter_factor;
  const totals = floodMonths.map((date) => {
    const rows = ledgerRows.filter((r) => r.date === date && PRODUCERS.includes(r.well));
    const sum = (k) => rows.reduce((a, r) => a + num(r[k]), 0);
    return { date, oil: sum('oil') * MF.oil, water: sum('water') * MF.water, gas: sum('gas') * MF.gas };
  });
  write(rel('ekene-field-totals.csv'), csv(
    ['date', 'oil_stb', 'water_stb', 'gas_mscf'],
    totals.map((t) => [t.date, t.oil.toFixed(3), t.water.toFixed(3), t.gas.toFixed(3)]),
  ));
  // Allocation through the engine: the factor that falls out is the meter's.
  let allocationSummary;
  {
    const wells = [...PRODUCERS, ...INJECTORS].map((name) => ({
      id: name, name, well_type: INJECTORS.includes(name) ? 'injector' : 'producer',
    }));
    const ledger = ledgerRows.map((r) => ({
      well_id: r.well, prod_date: r.date, oil_stb: num(r.oil), water_stb: num(r.water), gas_mscf: num(r.gas),
      winj_stb: num(r.inj), hours_on: 24, well: wells.find((w) => w.id === r.well),
    }));
    const t = tests.map((x, i) => ({
      id: `t${i}`, well_id: x.well, test_date: x.date, duration_hours: DESIGN.test_duration_hours,
      oil_rate_stbd: x.oil, water_rate_stbd: x.water, gas_rate_mscfd: x.gas, thp_psia: x.thp,
    }));
    const tot = totals.map((x) => ({
      total_date: x.date, oil_stb: num(x.oil.toFixed(3)), water_stb: num(x.water.toFixed(3)), gas_mscf: num(x.gas.toFixed(3)),
    }));
    const alloc = computeAllocation({ wells, tests: t, ledger, totals: tot });
    if (alloc.diagnostics.length) throw new Error(`ASSERT allocation diagnostics: ${alloc.diagnostics[0].message}`);
    for (const d of alloc.days) {
      assertClose(`oil factor ${d.date}`, d.factors.oil, MF.oil, 0.001);
      assertClose(`gas factor ${d.date}`, d.factors.gas, MF.gas, 0.001);
      // Water starts at a few hundredths of a barrel a day, where the tests'
      // 0.01 bbl/d resolution is itself a few percent: the bound says so.
      if (d.factors.water != null) {
        const bound = (MF.water * PRODUCERS.length * 0.005) / d.theoretical.water + 1e-4;
        assertClose(`water factor ${d.date}`, d.factors.water, MF.water, bound);
      }
    }
    const qc = validateWellTests(t, buildWellSeries(ledger));
    if (qc.length) throw new Error(`ASSERT well test QC flags ${qc.length} tests: ${qc[0].issues[0].message}`);
    // As imported, before the note's retyping step, every well is a producer:
    // the injectors carry no test, so they take no share and say so.
    const asImported = computeAllocation({
      wells: wells.map((w) => ({ ...w, well_type: 'producer' })), tests: t, ledger, totals: tot,
    });
    const flagged = new Set(asImported.diagnostics.map((d) => `${d.code}|${d.wellName}`));
    if (flagged.size !== INJECTORS.length || !INJECTORS.every((w) => flagged.has(`no_test_in_force|${w}`))) {
      throw new Error(`ASSERT untyped injectors should only raise no_test_in_force: ${[...flagged].join(', ')}`);
    }
    asImported.days.forEach((d, i) => {
      assertClose(`untyped oil factor ${d.date}`, d.factors.oil, alloc.days[i].factors.oil, 1e-12);
    });
    allocationSummary = {
      firstWater: alloc.days.find((d) => d.factors.water != null).date,
      days: alloc.days.length,
      oil: alloc.totals.measured.oil / alloc.totals.theoretical.oil,
      water: alloc.totals.measured.water / alloc.totals.theoretical.water,
      gas: alloc.totals.measured.gas / alloc.totals.theoretical.gas,
      waterDays: alloc.days.filter((d) => d.factors.water != null).length,
    };
  }
  assertClose('period water factor', allocationSummary.water, MF.water, 0.0005);
  say(`  allocation: ${allocationSummary.days} metered days, factors oil ${allocationSummary.oil.toFixed(4)}, `
    + `water ${allocationSummary.water.toFixed(4)}, gas ${allocationSummary.gas.toFixed(4)}; all ${tests.length} tests pass QC`);

  // =========================================================================
  // 5. Nodal (Episode 24): Ekene-1 on its December 2025 test.
  // =========================================================================
  const dec = tests.find((t) => t.well === 'Ekene-1' && t.date === LOCKED.history_end);
  const nodalIn = {
    api: String(LOCKED.api), gasSg: String(LOCKED.gas_sg), gor: String(LOCKED.rsi_scf_stb), salinityPpm: String(LOCKED.salinity_ppm),
    pr: f2(dec.pr), pb: String(LOCKED.pb_psia), pi: f4(dec.J),
    depthFt: depthStr, whtF: String(DESIGN.wellhead_temp_f), bhtF: String(LOCKED.temp_f),
    idIn: String(DESIGN.tubing_id_in), roughnessIn: String(DESIGN.roughness_in), whp: f2(dec.thp),
    wctPct: dec.wctPct.toFixed(4), prodGor: String(LOCKED.rsi_scf_stb), stepFt: String(DESIGN.traverse_step_ft),
  };
  const nodal = (() => {
    const geo = wellGeometry(num(nodalIn.depthFt));
    const ipr = compositeIpr({ pr: num(nodalIn.pr), pi: num(nodalIn.pi) });
    const vlp = {
      fluidModel: fm, trajectory: geo.trajectory, tAt: geo.tAt, idIn: num(nodalIn.idIn), roughnessIn: num(nodalIn.roughnessIn),
      correlation: DESIGN.vlp_correlation, whp: num(nodalIn.whp), nodeMd: geo.nodeMd, stepFt: num(nodalIn.stepFt),
      rates: { wct: num(nodalIn.wctPct) / 100, gor: num(nodalIn.prodGor) },
    };
    return { ipr, vlp, sol: solveOperatingPoint({ ipr, vlp, nGrid: 25 }) };
  })();
  // The studio lists every crossing; the December test must be one of them.
  const testCrossing = nodal.sol.intersections.find((x) => Math.abs(x.q / dec.oil - 1) < 0.05);
  if (!testCrossing) throw new Error('ASSERT the nodal solve has no crossing within 5 percent of the December test rate.');
  if (nodal.sol.status !== 'flowing') throw new Error(`ASSERT nodal status ${nodal.sol.status}`);
  const others = nodal.sol.intersections.filter((x) => x !== testCrossing);
  const opQ = nodal.sol.op.q;
  // The headline is the highest stable balance, and it is not the test.
  if (!(opQ > 5 * dec.oil)) throw new Error(`ASSERT expected the studio headline far above the test; got ${opQ}`);
  // Every psi at the wellhead moves the test crossing by more than a barrel a day.
  const crossingAt = (whp) => solveOperatingPoint({ ipr: nodal.ipr, vlp: { ...nodal.vlp, whp }, nGrid: 25 })
    .intersections.map((x) => x.q).sort((a, b) => Math.abs(a - dec.oil) - Math.abs(b - dec.oil))[0];
  const dqPerPsi = Math.abs(crossingAt(num(nodalIn.whp) + 1) - testCrossing.q);
  if (!(dqPerPsi > 1)) throw new Error(`ASSERT WHP sensitivity ${dqPerPsi} bopd per psi`);
  const kroDec = oilPi('Ekene-1', dec.wctPct / 100, dec.pr);
  say(`  nodal: Ekene-1 at THP ${nodalIn.whp} psia crosses at ${testCrossing.q.toFixed(2)} bopd `
    + `(${testCrossing.stable ? 'stable' : 'heading branch'}; test ${dec.oil}), `
    + `others ${others.map((x) => `${x.q.toFixed(0)} ${x.stable ? 'stable' : 'heading'}`).join(', ')}, `
    + `studio headline ${opQ.toFixed(0)} bopd, ${dqPerPsi.toFixed(2)} bopd per psi of THP`);

  // =========================================================================
  // 6. ESP (Episode 25): Ekene-6 on the day it stops flowing.
  // =========================================================================
  const E = DESIGN.esp;
  const e6Dec = tests.find((t) => t.well === E.well && t.date === LOCKED.history_end);
  // The ESP well model at a water cut: this sheet's well, with the oil PI the
  // relative permeability leaves at that cut, at the December 2025 pressure.
  const espInputsAt = (wctPct) => ({
    well: { phase: 'oil', mode: 'vertical', depthFt: depthStr, surveyText: '', whtF: String(DESIGN.wellhead_temp_f), bhtF: String(LOCKED.temp_f) },
    fluid: { api: String(LOCKED.api), gasSg: String(LOCKED.gas_sg), gor: String(LOCKED.rsi_scf_stb), salinityPpm: String(LOCKED.salinity_ppm) },
    inflow: { model: 'composite', pr: f2(dec.pr), pb: String(LOCKED.pb_psia), calMode: 'pi', pi: f4(oilPi(E.well, wctPct / 100, dec.pr).jOil), qmax: '', testQ: '', testPwf: '' },
    gasInflow: {},
    completion: {
      idIn: String(DESIGN.tubing_id_in), casingIdIn: String(DESIGN.casing_id_in), roughnessIn: String(DESIGN.roughness_in),
      correlation: DESIGN.vlp_correlation, stepFt: String(DESIGN.traverse_step_ft),
    },
  });
  const naturalAt = (wctPct) => {
    const m = buildWellModel(espInputsAt(wctPct));
    return solveOperatingPoint({ ipr: m.ipr, vlp: { ...m.vlp, whp: E.whp_psia, rates: { wct: wctPct / 100, gor: LOCKED.rsi_scf_stb } }, nGrid: 25 });
  };
  // Why a pump, and when: the water cut at which Ekene-6 stops flowing into
  // the design wellhead pressure, on a 5 percent ladder from today's cut.
  let designWct = null;
  let lastFlowing = null;
  for (let w = 5 * Math.ceil(e6Dec.wctPct / 5); w <= 95; w += 5) {
    const sol = naturalAt(w);
    if (sol.status === 'dead') { designWct = w; break; }
    lastFlowing = { w, q: sol.op.q };
  }
  if (designWct == null || lastFlowing == null) throw new Error('ASSERT no water cut on the ladder where Ekene-6 stops flowing.');
  const wctD = designWct / 100;
  const piD = oilPi(E.well, wctD, dec.pr);
  const espIn = espInputsAt(designWct);
  const pumpTvdStr = (E.pump_tvd_m * FT_PER_M).toFixed(0);
  const duty = {
    designRateStbd: (E.design_liquid_stbd * (1 - wctD)).toFixed(0), wctPct: String(designWct), whp: String(E.whp_psia),
    pumpTvdFt: pumpTvdStr, annulusGradPsiPerFt: String(E.annulus_grad_psi_ft), separatorEfficiencyPct: String(E.separator_efficiency_pct),
    gvfStandardMaxPct: '10', gvfHandlerMaxPct: '25',
  };
  const pump = { curveSource: 'reference', referenceStageId: E.stage, curveRefHz: '60', curveText: '', hz: String(E.hz) };
  const motor = {
    motorFrameId: E.motor.id, nameplateHp: String(E.motor.hp), nameplateVolts: String(E.motor.volts), nameplateAmps: String(E.motor.amps),
    motorEfficiencyPct: String(E.motor_efficiency_pct), powerFactor: String(E.power_factor),
    cableLengthFt: (Math.ceil((num(pumpTvdStr) + 100) / 100) * 100).toFixed(0), cableTempF: String(E.cable_temp_f), maxDropPct: String(E.max_drop_pct),
  };
  const espModel = buildWellModel(espIn);
  const form = { ...duty, ...pump, ...motor, gorScfStb: espIn.fluid.gor, perfTvdFt: String(espModel.tvdMax) };
  const esp = runEspDesign({ form, model: espModel });
  if (!esp.ok) throw new Error(`ASSERT ESP design refused: ${esp.errors.join(' ')}`);
  const D = esp.design;
  if (D.duty.intake.gas.verdict !== 'standard') throw new Error(`ASSERT gas through the pump needs ${D.duty.intake.gas.verdict}`);
  if (!(D.duty.pumpIntakeBpd > 500 && D.duty.pumpIntakeBpd < 1450)) throw new Error('ASSERT the duty is off the 400 series curve.');
  // Where the sized stack actually runs.
  const espOp = solveEspOperatingPoint({
    model: espModel, curve: buildStageCurve(form), stages: D.sized.stages, hz: E.hz, wct: wctD, gorScfStb: LOCKED.rsi_scf_stb,
    pumpTvdFt: num(pumpTvdStr), pumpMd: D.pumpMd, perfTvdFt: espModel.tvdMax, annulusGradPsiPerFt: E.annulus_grad_psi_ft,
    separatorEfficiency: E.separator_efficiency_pct / 100, whp: E.whp_psia, gasLimits: D.gasLimits,
  });
  if (!espOp) throw new Error('ASSERT the sized ESP has no operating point on this well.');
  assertClose('the sized ESP runs at its design rate', espOp.qoStbd / num(duty.designRateStbd), 1, 0.05);
  // Why not gas lift: the least gas that lets the column flow at the design
  // rate, injected at the perforations (the best case), against the field's gas.
  const gasLiftFloor = (() => {
    const q = num(duty.designRateStbd);
    const target = pwfAtRate(espModel.ipr, q);
    const bhp = (gor) => bhpFromWhp({ ...espModel.vlp, whp: E.whp_psia, rates: { qo: q, wct: wctD, gor } }).pEnd;
    // The gradient falls as gas is added until friction takes over, so walk
    // up a ladder of total GOR to the first that flows, then bisect.
    let a = LOCKED.rsi_scf_stb;
    if (!(bhp(a) > target)) return null;
    let b = null;
    for (let g = a * 1.25; g <= 40000; g *= 1.25) {
      if (bhp(g) < target) { b = g; break; }
      a = g;
    }
    if (b == null) return Infinity;   // no amount of gas lifts it: the stronger case
    for (let i = 0; i < 30; i += 1) { const m = (a + b) / 2; if (bhp(m) > target) a = m; else b = m; }
    return ((b - LOCKED.rsi_scf_stb) * q) / 1000;   // Mscf/d of lift gas
  })();
  const fieldGasDec = ledgerRows.filter((r) => r.date === LOCKED.history_end).reduce((a, r) => a + num(r.gas), 0);
  if (!Number.isFinite(gasLiftFloor)) throw new Error('ASSERT the gas lift floor is not a number; the note quotes one.');
  if (!(gasLiftFloor > fieldGasDec)) throw new Error(`ASSERT gas lift floor ${gasLiftFloor} should exceed the field's gas ${fieldGasDec}.`);
  say(`  ESP: Ekene-6 flows ${lastFlowing.q.toFixed(0)} bopd at ${lastFlowing.w} percent water cut and stops at ${designWct}; ${D.sized.stages} stages, `
    + `TDH ${D.duty.tdhFt.toFixed(0)} ft, shaft ${D.sized.shaftHp.toFixed(1)} hp, runs at ${espOp.qoStbd.toFixed(1)} bopd; `
    + `gas lift would need at least ${gasLiftFloor.toFixed(0)} Mscf/d against ${fieldGasDec.toFixed(1)} produced`);


  // Numbers the notes quote, each read off what was built above.
  const decRows = ledgerRows.filter((r) => r.date === LOCKED.history_end);
  const decOil = decRows.reduce((a, r) => a + num(r.oil), 0);
  const decInj = decRows.reduce((a, r) => a + num(r.inj), 0);
  const decCuts = tests.filter((t) => t.date === LOCKED.history_end).sort((a, b) => b.wctPct - a.wctPct);
  if (decCuts[0].well !== 'Ekene-6') throw new Error('ASSERT Ekene-6 should carry the highest December water cut.');
  const e6Tests = tests.filter((t) => t.well === E.well);
  const e6Peak = e6Tests.reduce((a, t) => (t.thp > a.thp ? t : a), e6Tests[0]);
  const monthName = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const warnCodes = D.warnings.map((w) => w.code);
  const pctBelow = (f) => Math.round((1 - f) * 100);

  // =========================================================================
  // 7. Input sheets, in each application's own labels.
  // =========================================================================
  const src = {
    locked: 'LOCKED spine (tools/demo-dataset/spine.mjs)',
    lab: 'PVT lab table at the test pressure (09-reservoir/ekene-pvt-lab-table.csv)',
    track: 'waterflood pressure track (packages/engines/test-data/ekene-dynamic/waterflood.json)',
  };
  write(rel('well-test-analysis-studio-inputs.csv'), sheet([
    ['Test setup', 'Well name', 'Ekene-1', '', 'the hero well'],
    ['Test setup', 'Unit system', 'Oilfield (psi, ft, STB/D)', '', 'field units throughout'],
    ['Test setup', 'Test type', 'Pressure buildup', '', 'shut in for the February 2025 static survey'],
    ['Test setup', 'Producing time tp', wtIn.tp, 'hr', `Horner equivalent time: cumulative ${bu.np.toFixed(0)} stb over ${wtIn.q} stb/d, times 24`],
    ['Test setup', 'Flowing pressure at shut-in', wtIn.pwfShutIn, 'psi', 'the gauge at the instant of shut-in; type it, because the file starts at 0.01 hr'],
    ['Gauge data', 'Import CSV', rel('ekene-1-buildup-2025-02.csv'), '', 'shut-in hours and gauge pressure at the 1560 m datum'],
    ['Reservoir and fluid', 'Fluid', 'Oil (slightly compressible)', '', ''],
    ['Reservoir and fluid', 'Net thickness h', wtIn.h, 'ft', 'Ekene-1 oil column 1548 to 1560 m times net to gross 0.8'],
    ['Reservoir and fluid', 'Porosity', wtIn.phi, 'frac', src.locked],
    ['Reservoir and fluid', 'Wellbore radius rw', wtIn.rw, 'ft', '12-1/4 in hole across the reservoir'],
    ['Reservoir and fluid', 'Total ct', wtIn.ct, '1/psi', `So co + Sw cw + cf: co ${bu.pvt.co.toExponential(3)} from the lab Bo slope, cw ${bu.cw}, cf ${bu.cf}, Swi ${LOCKED.swi}`],
    ['Reservoir and fluid', 'Oil FVF B', wtIn.B, 'rb/stb', src.lab],
    ['Reservoir and fluid', 'Viscosity', wtIn.mu, 'cp', src.lab],
    ['Reservoir and fluid', 'Rate q', wtIn.q, 'STB/D', 'Ekene-1 January 2025 rate (08-production)'],
    ['Reservoir and fluid', 'Initial pressure pi', wtIn.pi, 'psia', `reservoir pressure at the end of January 2025, ${src.track}`],
    ['Horner window', 'From', String(lo), 'hr', 'Specialized tab; after wellbore storage'],
    ['Horner window', 'To', String(hi), 'hr', 'Specialized tab; the end of the shut-in'],
  ]));
  write(rel('nodal-analysis-studio-inputs.csv'), sheet([
    ['Inputs', 'Display units', 'Oilfield (psia, STB/D, ft)', '', ''],
    ['Fluid', 'Oil gravity', nodalIn.api, 'API', src.locked],
    ['Fluid', 'Gas specific gravity', nodalIn.gasSg, 'air = 1', src.locked],
    ['Fluid', 'Solution GOR at Pb', nodalIn.gor, 'scf/STB', src.locked],
    ['Fluid', 'Water salinity', nodalIn.salinityPpm, 'ppm', src.locked],
    ['Reservoir and inflow', 'Well type', 'Oil well', '', ''],
    ['Reservoir and inflow', 'Reservoir pressure', nodalIn.pr, 'psia', `1 December 2025, ${src.track}`],
    ['Reservoir and inflow', 'IPR model', 'Composite (Standing)', '', 'the reservoir sits just above the bubble point'],
    ['Reservoir and inflow', 'Bubble point', nodalIn.pb, 'psia', src.locked],
    ['Reservoir and inflow', 'Calibration', 'Enter PI (J)', '', ''],
    ['Reservoir and inflow', 'Productivity index J', nodalIn.pi, 'STB/D/psi',
      `buildup PI ${j1SwiStr} (Episode 23) times kro ${kroDec.kro.toFixed(4)} over the endpoint ${LOCKED.kr.kroMax} at the ${dec.wctPct.toFixed(2)} percent water cut`],
    ['Well and trajectory', 'Geometry', 'Vertical', '', 'Ekene-1 is vertical'],
    ['Well and trajectory', 'Node depth (MD = TVD)', nodalIn.depthFt, 'ft', 'the 1560 m datum the pressure track is quoted at'],
    ['Well and trajectory', 'Wellhead temperature', nodalIn.whtF, 'degF', 'design: a low-rate well arrives near sea temperature'],
    ['Well and trajectory', 'Bottomhole temperature', nodalIn.bhtF, 'degF', src.locked],
    ['Completion and rates', 'Tubing ID', nodalIn.idIn, 'in', '2-7/8 in tubing'],
    ['Completion and rates', 'Roughness', nodalIn.roughnessIn, 'in', ''],
    ['Completion and rates', 'Wellhead pressure', nodalIn.whp, 'psia', 'the December 2025 test THP (ekene-well-tests.csv); type both decimals'],
    ['Completion and rates', 'VLP correlation', 'Hagedorn & Brown (modified)', '', 'the vertical oil well correlation; every test THP in this kit uses it'],
    ['Completion and rates', 'Water cut', nodalIn.wctPct, '%', 'the December 2025 test'],
    ['Completion and rates', 'Producing GOR', nodalIn.prodGor, 'scf/STB', 'solution gas only: the reservoir is above the bubble point'],
    ['Completion and rates', 'Traverse step', nodalIn.stepFt, 'ft', 'the default'],
  ]));
  write(rel('esp-design-studio-inputs.csv'), sheet([
    ['Well Model', 'Trajectory', 'Vertical', '', 'Ekene-6 is vertical'],
    ['Well Model', 'Perforation depth (ft TVD)', espIn.well.depthFt, 'ft', 'the 1560 m datum'],
    ['Well Model', 'Wellhead temp (F)', espIn.well.whtF, 'degF', 'as Episode 24'],
    ['Well Model', 'Bottomhole temp (F)', espIn.well.bhtF, 'degF', src.locked],
    ['Well Model', 'Oil API', espIn.fluid.api, 'API', src.locked],
    ['Well Model', 'Gas gravity', espIn.fluid.gasSg, 'air = 1', src.locked],
    ['Well Model', 'Producing GOR (scf/stb)', espIn.fluid.gor, 'scf/stb', 'solution gas only'],
    ['Well Model', 'Salinity (ppm)', espIn.fluid.salinityPpm, 'ppm', src.locked],
    ['Well Model', 'IPR model', 'Composite (Vogel below bubble point)', '', 'the pump draws the well below 2000 psia'],
    ['Well Model', 'Reservoir pressure (psia)', espIn.inflow.pr, 'psia', 'as Episode 24: the flood holds the pressure'],
    ['Well Model', 'Bubble point (psia)', espIn.inflow.pb, 'psia', src.locked],
    ['Well Model', 'Calibration', 'Productivity index', '', ''],
    ['Well Model', 'PI (stb/d/psi)', espIn.inflow.pi, 'stb/d/psi',
      `oil PI at ${designWct} percent water cut: Ekene-1 buildup PI ${j1SwiStr} times net pay ${netOilPayFt(E.well).toFixed(2)} over ${h1.toFixed(2)} ft times kro ${piD.kro.toFixed(4)} over ${LOCKED.kr.kroMax}`],
    ['Well Model', 'Tubing ID (in)', espIn.completion.idIn, 'in', '2-7/8 in tubing'],
    ['Well Model', 'Casing ID (in)', espIn.completion.casingIdIn, 'in', '9-5/8 in casing'],
    ['Well Model', 'Roughness (in)', espIn.completion.roughnessIn, 'in', ''],
    ['Well Model', 'Traverse step (ft)', espIn.completion.stepFt, 'ft', ''],
    ['Well Model', 'Flow correlation', 'Modified Hagedorn-Brown', '', 'as Episode 24'],
    ['Duty', 'Design oil rate (stb/d)', duty.designRateStbd, 'stb/d', `${E.design_liquid_stbd} stb/d of liquid at ${designWct} percent water cut`],
    ['Duty', 'Water cut (%)', duty.wctPct, '%', 'the water cut at which Ekene-6 stops flowing (Nodal Analysis Studio, 5 percent steps)'],
    ['Duty', 'Wellhead pressure (psia)', duty.whp, 'psia', `design: the ${SEPARATOR_PSIA.toFixed(1)} psia separator plus the flowline, choke open`],
    ['Duty', 'Pump setting depth (ft TVD)', duty.pumpTvdFt, 'ft', `${E.pump_tvd_m} m, 46 m above the Ekene-6 top sand`],
    ['Duty', 'Annulus gradient (psi/ft)', duty.annulusGradPsiPerFt, 'psi/ft', 'gas vented up the annulus'],
    ['Duty', 'Intake separator efficiency (%)', duty.separatorEfficiencyPct, '%', 'the studio default'],
    ['Duty', 'Standard stage limit (% GVF)', duty.gvfStandardMaxPct, '%', 'default'],
    ['Duty', 'Gas handler limit (% GVF)', duty.gvfHandlerMaxPct, '%', 'default'],
    ['Pump', 'Stage curve from', 'A reference model stage', '', ''],
    ['Pump', 'Reference stage', 'Reference stage, 400 series, 1000 bbl/d BEP', '', 'the smallest series in the catalogue'],
    ['Pump', 'Drive frequency (Hz)', pump.hz, 'Hz', ''],
    ['Motor and Cable', 'Start from a motor frame', '60 hp, 1000 V, 38 A (4.56 in)', '', 'the smallest frame in the catalogue'],
    ['Motor and Cable', 'Motor efficiency (%)', motor.motorEfficiencyPct, '%', 'default'],
    ['Motor and Cable', 'Power factor', motor.powerFactor, '', 'default'],
    ['Motor and Cable', 'Cable length (ft)', motor.cableLengthFt, 'ft', 'pump depth plus the run to the wellhead'],
    ['Motor and Cable', 'Average cable temp (F)', motor.cableTempF, 'degF', 'between the wellhead and the bottomhole temperatures'],
    ['Motor and Cable', 'Max voltage drop (%)', motor.maxDropPct, '%', 'default'],
  ]));

  // =========================================================================
  // 8. README and episodes.
  // =========================================================================
  write(rel('README.md'), [
    '# Production engineering', '',
    'Episodes 21 to 25. This folder is the 08-production history seen by a production engineer, plus',
    'one pressure buildup. Every number here is checked by the generator and again by',
    '`tools/demo-dataset/__tests__/domain.production.test.js`, which reads these files through the',
    'applications\' own importers and engines.', '',
    '| File | Application |', '|---|---|',
    '| `ekene-daily-production.csv` | Production Surveillance Studio, Daily production ledger |',
    '| `ekene-well-tests.csv` | Production Surveillance Studio, Well tests (the Allocation Studio reads the same tests) |',
    '| `ekene-field-totals.csv` | Production Allocation Studio, field totals |',
    '| `ekene-1-buildup-2025-02.csv` | Well Test Analysis Studio, Import CSV |',
    '| `well-test-analysis-studio-inputs.csv` | the values to type for the buildup |',
    `| \`nodal-analysis-studio-inputs.csv\` | Ekene-1 on its December 2025 test |`,
    `| \`esp-design-studio-inputs.csv\` | Ekene-6 at ${designWct} percent water cut |`, '',
    '## Conventions', '',
    '- **The ledger is sampled monthly.** Each row is the first day of its month, one producing day, so the',
    '  volume in the row is also that month\'s daily rate. Rate times days in the month reproduces the VRR',
    '  ledger in 08-production to the barrel. A full daily file would be about 10,800 rows, and the studio',
    `  reads the ledger back in a single request, so this one stays at ${ledgerRows.length} rows.`,
    `- **Well tests** are one per producer on the first of every flood month, ${DESIGN.test_duration_hours} hours long, rates to`,
    '  0.01 bbl/d. Each test equals that month\'s ledger rate within 0.005 bbl/d, so every test passes QC.',
    '- **Tubing head pressure** in each test is the pressure at which the Nodal Analysis Studio\'s own',
    '  modified Hagedorn-Brown traverse delivers the test rate into the inflow at that month\'s reservoir',
    `  pressure. They run ${Math.min(...thps).toFixed(0)} to ${Math.max(...thps).toFixed(0)} psia, all above the ${SEPARATOR_PSIA.toFixed(1)} psia separator.`,
    '- **Productivity index** comes from the Episode 23 buildup, scaled by each well\'s net oil pay and by',
    '  the oil relative permeability at the water cut the well is producing (the LOCKED Corey set).',
    '- **Choke** is the Gilbert size (the Chokes tab correlation) at the test THP and liquid rate. Gilbert',
    `  assumes critical flow, which holds for ${critical} of the ${tests.length} tests; read the rest as a screening size.`,
    `- **Field totals** are the producers' sum times a meter factor: oil ${MF.oil}, water ${MF.water}, gas ${MF.gas}`,
    '  (fuel gas is taken off before the gas meter).',
    '- **Pressures** are at the 1560 m datum, the contact, where the waterflood pressure track and the',
    '  buildup gauge are both quoted.', '',
    '## What did not fit, said plainly', '',
    `The field's rates are low for its rock. The buildup gives Ekene-1 a productivity index of ${j1SwiStr} stb/d/psi,`,
    `so at its December wellhead pressure the tubing and the reservoir balance at ${opQ.toFixed(0)} bopd while the well`,
    `tests ${dec.oil}. The wells are held on small chokes (a thin oil column over water, and a voidage target),`,
    'and the Nodal Analysis Studio has no choke in its outflow, so its headline is the unchoked balance.',
    'Episode 24 is built around that.',
  ].join('\n'));

  const episodes = [
    {
      n: 21, app: 'Production Surveillance Studio',
      files: [
        [rel('ekene-daily-production.csv'), `Daily production ledger drop zone: ${new Set(ledgerRows.map((r) => r.well)).size} wells, 2020 to 2025, one row per well per month`],
        [rel('ekene-well-tests.csv'), `Well tests drop zone: ${tests.length} tests, the four producers every flood month`],
      ],
      note: 'Create a field called Ekene in the left rail first; nothing imports without one. Drop the ledger: every column is recognised '
        + `(date, well, oil_stb, water_stb, gas_mscf, winj_stb, hours_on), ${ledgerRows.length} rows. Each row is the first day of its `
        + 'month, so the studio sees a monthly ledger and widens its windows to match. Then set the well types in the Wells panel: '
        + `${INJECTORS.join(' and ')} to Injector. Every well arrives as a producer, and the injectors would be surveilled on oil they never make. `
        + `Drop the well tests second. The December 2025 rows add up to ${decOil.toFixed(2)} bopd of oil and ${decInj.toFixed(2)} bwpd injected, the numbers `
        + `the earlier episodes ended on. Ekene-6 carries the highest water cut, ${decCuts[0].wctPct.toFixed(1)} percent, because it broke through first.`,
    },
    {
      n: 22, app: 'Production Allocation Studio',
      files: [
        [rel('ekene-field-totals.csv'), `${totals.length} monthly metered totals: oil, water and gas`],
        ['the Ekene field from Episode 21', 'the ledger and the well tests, already on the spine'],
      ],
      note: 'Open the Ekene field and import the totals. Keep the defaults: basis well test, 180 day test age. Every well test passes QC, '
        + `and the allocation factors come out at the meter factors the kit was built with: oil ${MF.oil.toFixed(3)} and gas ${MF.gas.toFixed(3)} on every one of the `
        + `${allocationSummary.days} dates, water ${allocationSummary.water.toFixed(3)} over the period. `
        + `The separator meters read ${pctBelow(MF.oil)} and ${pctBelow(MF.water)} percent below the tests, and the gas meter ${pctBelow(MF.gas)} percent, because fuel gas is burned before it. `
        + `Water only has a factor from ${monthName(allocationSummary.firstWater)} (${allocationSummary.waterDays} dates), when the first water arrived; its first months are a few `
        + 'hundredths of a barrel a day, finer than the tests read, so single dates there wander off 0.980 while the period total holds it. '
        + `If ${INJECTORS.join(' and ')} are still typed as producers the factors do not move, but every date raises a no test in force note for each of them: retype them in Surveillance.`,
    },
    {
      n: 23, app: 'Well Test Analysis Studio',
      files: [
        [rel('ekene-1-buildup-2025-02.csv'), `${gaugeRows.length} gauge points, 0.01 to ${DESIGN.buildup.shut_in_hours} hours of shut-in`],
        [rel('well-test-analysis-studio-inputs.csv'), 'every typed value with its source'],
      ],
      note: `Set Test type to Pressure buildup and type Producing time tp ${wtIn.tp} hr and Flowing pressure at shut-in ${wtIn.pwfShutIn} psi before importing: `
        + 'the file starts 0.01 hr after shut-in, and left blank the studio takes its first point as the flowing pressure. '
        + `Then type h ${wtIn.h} ft, porosity ${wtIn.phi}, rw ${wtIn.rw} ft, ct ${wtIn.ct}, B ${wtIn.B}, viscosity ${wtIn.mu} cp, q ${wtIn.q} STB/D and pi ${wtIn.pi} psia. `
        + `On the Specialized tab set the Horner window from ${lo} to ${hi} hr. Horner returns k ${horner.k.toFixed(1)} md, skin ${horner.skin.toFixed(2)} and p* ${horner.pStar.toFixed(2)} psia. `
        + `The p* is the February 2025 pressure survey, ${bu.pi.toFixed(2)} psia. Horner reads ${bu.kEff} md because a well test sees the permeability to oil: `
        + `the rock's ${LOCKED.k_md} md times the oil endpoint ${LOCKED.kr.kroMax}. The whole buildup rises only ${buildupRise.toFixed(1)} psi, because the rock is good and the rate is small. `
        + `Rate over p* less the flowing pressure gives a productivity index of ${j1SwiStr} stb/d/psi, which Episode 24 uses.`,
    },
    {
      n: 24, app: 'Nodal Analysis Studio',
      files: [
        [rel('nodal-analysis-studio-inputs.csv'), 'Ekene-1 on its December 2025 test'],
        [rel('ekene-well-tests.csv'), `the December 2025 Ekene-1 row: ${dec.oil} bopd, ${dec.water} bwpd, THP ${nodalIn.whp} psia`],
      ],
      note: `Type the sheet, the Wellhead pressure to both decimals (${nodalIn.whp} psia): each psi there moves the low crossing by ${dqPerPsi.toFixed(1)} bopd. `
        + `The PI is ${nodalIn.pi}, the Episode 23 value scaled to the December water cut. The System tab lists two crossings: ${testCrossing.q.toFixed(1)} bopd `
        + `(${testCrossing.stable ? 'stable' : 'unstable heading branch'}) and ${others.map((x) => `${x.q.toFixed(0)} bopd (${x.stable ? 'stable' : 'unstable heading branch'})`).join(' and ')}. `
        + `The first is the December test, ${dec.oil} bopd, found to the barrel. The headline Operating rate is ${opQ.toFixed(0)} bopd, the stable balance the tubing and the reservoir reach at this wellhead pressure with no choke. `
        + 'That gap is the beat. Ekene-1 could give far more, and a small choke holds it at the test rate, on the heading branch, to protect a thin oil column over water.',
    },
    {
      n: 25, app: 'ESP Design Studio',
      files: [
        [rel('esp-design-studio-inputs.csv'), `Ekene-6 at ${designWct} percent water cut: well model, duty, pump, motor and cable`],
        [rel('ekene-well-tests.csv'), `Ekene-6 today: ${e6Dec.oil} bopd at ${e6Dec.wctPct.toFixed(1)} percent water cut`],
      ],
      note: `Start from the well tests: Ekene-6's THP has fallen from ${e6Peak.thp.toFixed(0)} psia in ${monthName(e6Peak.date)} to ${e6Dec.thp.toFixed(0)} psia in December 2025 as the water came in. `
        + `In the Nodal Analysis Studio the same well, open to ${E.whp_psia} psia and given the oil PI of each water cut, still flows ${lastFlowing.q.toFixed(0)} bopd at ${lastFlowing.w} percent and finds no crossing at ${designWct} percent. `
        + `So the design is for that day. Type the Well Model tab first (PI ${espIn.inflow.pi}, the oil PI left at ${designWct} percent water cut), then the Duty: `
        + `${duty.designRateStbd} stb/d of oil, which is ${E.design_liquid_stbd} stb/d of liquid, with the pump at ${duty.pumpTvdFt} ft. The studio sizes ${D.sized.stages} stages of the 400 series `
        + `against a total dynamic head of ${D.duty.tdhFt.toFixed(0)} ft: ${D.sized.shaftHp.toFixed(1)} hp at the shaft, intake ${D.duty.intake.pipPsia.toFixed(0)} psia, `
        + `${(D.duty.intake.gas.gvfThroughPump * 100).toFixed(1)} percent gas through the pump, so a standard stage. `
        + (warnCodes.includes('motorUnderloaded') ? 'It warns the 60 hp motor is lightly loaded; that is the smallest frame in the catalogue. ' : '')
        + `The stack runs at ${espOp.qoStbd.toFixed(1)} stb/d of oil against the ${e6Dec.oil} Ekene-6 makes today. `
        + `Gas lift is the other method, and it does not fit this field: even injected at the perforations, the column needs at least ${gasLiftFloor.toFixed(0)} Mscf/d of lift gas at this rate, and the whole field makes ${fieldGasDec.toFixed(1)} Mscf/d.`,
    },
  ];

  return {
    episodes,
    folders: [[FOLDER, 'daily ledger, well tests, metered totals, a pressure buildup, nodal and ESP input sheets']],
  };
}
