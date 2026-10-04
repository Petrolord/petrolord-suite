/**
 * SIM-U2-004 validation on a known case: the keyword mapping of the
 * analytical aquifer, checked by calling the Material Balance engine itself.
 *
 * The aquifer is the wedge aquifer of Dake (1978) Exercise 9.2, the one
 * Ahmed's Reservoir Engineering Handbook (4th ed.) works with Fetkovich's
 * method in Example 10-10 (Wei 211.9 MM bbl, J 116.5 bbl/d/psi; the engine
 * reproduces that example's printed We table, engines test-data
 * ahmed-ex-10-10-fetkovich.json). The Model Builder wrote it into a deck
 * (BUILT_AQ_FETKOVICH.DATA, BUILT_AQ_CT.DATA) and OPM Flow 2026.04 ran the
 * decks in the isolated worker image; the summaries here are what the
 * worker stored (src/dev/fixtures/sim-built-aq-*-summary.json).
 *
 * The gate: the Material Balance engine's own influx (computeFetkovichWe,
 * computeCarterTracyWe), marched on the run's own field pressure, against
 * the influx OPM Flow reports (AAQT) at every time step. If a keyword item
 * were mapped wrongly (a volume, a unit, the viscosity), the two would part.
 * Negative controls: the same comparison with the mapping mistakes the
 * builder guards against (W given as Wei; k written as entered, not scaled
 * by the PVTW viscosity) misses by far more than the tolerance.
 */
import fetSummary from '@/dev/fixtures/sim-built-aq-fetkovich-summary.json';
import ctSummary from '@/dev/fixtures/sim-built-aq-ct-summary.json';
import { computeFetkovichWe, computeCarterTracyWe } from '../../../../packages/engines/engines/mbal/mbalEngine.ts';
import { DAKE, DAKE_W } from './simU2Kit';

const inputsOf = (summary, params) => {
  const pi = DAKE.pi;
  const production_data = [{ pressure_psia: pi }, ...summary.field.FPR.map((p) => ({ pressure_psia: p }))];
  return {
    inputs: {
      initial_pressure_psia: pi, reservoir_temperature_f: 190, water_compressibility_psi: 3e-6, formation_compressibility_psi: 4e-6,
      production_data, aquifer_params: params,
    },
    deltas: [0, ...summary.days.map((d, i) => d - (i ? summary.days[i - 1] : 0))],
  };
};
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
const opmWe = (s) => s.aquifers['1'].AAQT;

describe('SIM-U2-004: OPM Flow aquifer influx against the Material Balance engine (Dake 9.2 / Ahmed 10-10 aquifer)', () => {
  it('Fetkovich: the engine marched on the run pressure gives the influx OPM Flow reports', () => {
    const { inputs, deltas } = inputsOf(fetSummary, { initial_aquifer_water_in_place_rb: DAKE_W, aquifer_pi_rb_d_psi: DAKE.J, aquifer_total_compressibility_psi: DAKE.ct });
    const we = computeFetkovichWe(inputs, deltas).slice(1);
    const opm = opmWe(fetSummary);
    expect(opm[opm.length - 1]).toBeGreaterThan(1e7);
    if (process.env.SHOW) console.log(we.map((w, i) => `${fetSummary.days[i]} mbal ${w.toFixed(0)} opm ${opm[i].toFixed(0)} p ${fetSummary.field.FPR[i]} ${(relErr(w, opm[i]) * 100).toFixed(2)}%`).join('\n'));
    // The two march differently in time (the engine at the step's midpoint
    // pressure, as Ahmed's example prints it; the simulator implicitly at the
    // end-of-step pressure), which sets a constant offset of about 0.14 MM bbl
    // in the first coarse month. After it the influx of each year agrees:
    const a = fetSummary.days.findIndex((d) => d > 365);
    const n = we.length - 1;
    expect(relErr(we[n] - we[a], opm[n] - opm[a])).toBeLessThan(0.01);
    // and the cumulative at four years
    expect(relErr(we[n], opm[n])).toBeLessThan(0.01);
    // the aquifer pressure too: pi (1 - We / Wei)
    const pa = DAKE.pi * (1 - we[we.length - 1] / DAKE.Wei);
    expect(Math.abs(pa - fetSummary.aquifers['1'].AAQP.at(-1))).toBeLessThan(5);
    // negative control: W given as Wei (a mapping slip) misses by far more
    const slip = computeFetkovichWe({ ...inputs, aquifer_params: { ...inputs.aquifer_params, initial_aquifer_water_in_place_rb: DAKE.Wei } }, deltas).slice(1);
    expect(relErr(slip[slip.length - 1], opm[opm.length - 1])).toBeGreaterThan(0.2);
  });

  it('Carter-Tracy (reD 5, the engine pD as AQUTAB, k scaled by the PVTW viscosity): the influx OPM Flow reports', () => {
    const params = {
      aquifer_permeability_md: DAKE.k, aquifer_thickness_ft: DAKE.h, aquifer_porosity: DAKE.phi, theta_degrees: DAKE.theta,
      radius_ratio: DAKE.reD, aquifer_total_compressibility_psi: DAKE.ct, aquifer_radius_ft: DAKE.rR, aquifer_water_viscosity_cp: DAKE.muw,
    };
    const { inputs, deltas } = inputsOf(ctSummary, params);
    const we = computeCarterTracyWe(inputs, deltas).slice(1);
    const opm = opmWe(ctSummary);
    expect(opm[opm.length - 1]).toBeGreaterThan(1e7);
    if (process.env.SHOW) console.log(we.map((w, i) => `${ctSummary.days[i]} ctmbal ${w.toFixed(0)} opm ${opm[i].toFixed(0)} p ${ctSummary.field.FPR[i]} ${(relErr(w, opm[i]) * 100).toFixed(2)}%`).join('\n'));
    // every time step from the first month on, and the cumulative at four years
    const late = we.map((w, i) => ({ w, o: opm[i], d: ctSummary.days[i] })).filter((x) => x.d > 30);
    const worst = Math.max(...late.map((x) => relErr(x.w, x.o)));
    expect(worst).toBeLessThan(0.015);
    expect(relErr(we[we.length - 1], opm[opm.length - 1])).toBeLessThan(0.01);
    // negative control: had k been written as entered, OPM Flow would have used mu 0.32 cP from PVTW:
    // the engine with that viscosity misses by far more
    const slip = computeCarterTracyWe({ ...inputs, aquifer_params: { ...params, aquifer_water_viscosity_cp: 0.32 } }, deltas).slice(1);
    expect(relErr(slip[slip.length - 1], opm[opm.length - 1])).toBeGreaterThan(0.1);
  });
});

describe('SIM-U2-004: the aquifer in the report', () => {
  // eslint-disable-next-line global-require
  const { collectSimReportArgs } = require('@/utils/simstudio/reportExport');
  // eslint-disable-next-line global-require
  const { aquiferForm } = require('./simU2DeckForms');
  it('inputs with their sources, the assumption, and the influx and pressure figure from the run', () => {
    const fs = require('fs'); // eslint-disable-line global-require
    const path = require('path'); // eslint-disable-line global-require
    const deckText = fs.readFileSync(path.join(__dirname, '../../../../worker/sim-worker/tests/integration/fixtures/generated/BUILT_AQ_CT.DATA'), 'utf8');
    const form = { ...aquiferForm('carter_tracy'), lastGenerated: { at: '2026-10-04T10:00:00Z', deckSha256: ctSummary.deck_sha256 } };
    const run = { id: 'run-aq', status: 'complete', deck_sha256: ctSummary.deck_sha256, opm_version: '2026.04' };
    const { model, figures } = collectSimReportArgs({ caseRow: { name: 'Aquifer', deck_source: 'generated' }, run, summary: ctSummary, deckText, form, system: 'oilfield' });
    expect(model.formApplies.applies).toBe(true);
    const rows = model.inputs.rows.map((r) => [r.label, r.value, r.source]);
    expect(rows.find((r) => r[0] === 'Aquifer model')[1]).toBe('Carter-Tracy (AQUCT, influence table AQUTAB), joined to the west edge (I = 1)');
    expect(rows.find((r) => r[0] === 'Aquifer permeability k')[2]).toMatch(/written to the deck as k x PVTW viscosity \/ aquifer viscosity/);
    expect(model.limits.assumptions.join(' ')).toMatch(/Carter-Tracy with the Material Balance engine's influence function \(finite, reD 5\)/);
    const fig = figures.find((f) => f.id === 'aquifer');
    expect(fig.panels.length).toBe(2);
    expect(fig.panels[0].spec.yTitle).toBe('Influx (10^3 RB)');
    expect(fig.panels[0].spec.series[0].pts.at(-1)[1] * 1e3).toBeCloseTo(ctSummary.aquifers['1'].AAQT.at(-1), 3);
    // a run of an aquifer deck by a worker that kept no aquifer vectors says why
    const { aquifers, ...old } = ctSummary;
    const stale = collectSimReportArgs({ caseRow: { name: 'Aquifer', deck_source: 'generated' }, run, summary: old, deckText, form, system: 'oilfield' });
    expect(stale.figures.find((f) => f.id === 'aquifer').statement).toMatch(/holds no aquifer vectors/);
  });
});
