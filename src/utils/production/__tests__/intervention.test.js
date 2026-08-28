/**
 * Gates for the Well Intervention Planner computation layer (P12).
 *
 * The diagnostic, the skin group and the screening rules are gated in
 * the engine package against a Theil-Sen fit and an SI Darcy oracle.
 * These gate the three things this layer adds, all of which are places
 * a checklist would get the answer wrong:
 *
 *   the history    real production days, with shut-in days dropped
 *                  rather than turned into an infinite ratio
 *   the uplift     a nodal RE-SOLVE, so the tubing takes back part of
 *                  what the inflow gained -- and so that a shutoff's
 *                  gain, which lives entirely in the column, is found
 *                  at all
 *   the economics  the canonical engine, imported, with a decline that
 *                  has to be stated
 */
import {
  ratioHistory, differentiateRatio, diagnose, operatingPoint,
  stimulationUplift, shutoffUplift, valueIntervention, runIntervention,
  minimumSkin, skinPiMultiplier, logLogSlope,
} from '../intervention';
import { buildWellModel, defaultWellInputs } from '../wellModel';

const wellInputs = (over = {}) => {
  const w = defaultWellInputs();
  w.well.depthFt = '7800';
  w.well.whtF = '140';
  w.well.bhtF = '205';
  w.fluid.api = '33';
  w.fluid.gasSg = '0.7';
  w.fluid.gor = '520';
  w.inflow.pr = String(over.pr || 2900);
  w.inflow.pb = '2000';
  w.inflow.calMode = 'pi';
  w.inflow.pi = String(over.pi || 0.9);
  w.completion.idIn = '2.441';
  return w;
};

/** A synthetic history: WOR = a t^m, with shut-in days scattered in. */
const history = ({ n = 90, a = 0.004, m = 1.6, shutIns = [10, 30, 55] } = {}) => {
  const rows = [];
  const start = new Date('2023-01-01').getTime();
  for (let i = 0; i < n; i += 1) {
    const t = Math.max(1, i * 8);
    const wor = a * t ** m;
    const shut = shutIns.includes(i);
    const qo = shut ? 0 : 900 / (1 + 0.006 * t);
    rows.push({
      prod_date: new Date(start + i * 8 * 86400000).toISOString().slice(0, 10),
      oil_rate_stbd: qo,
      water_rate_stbd: shut ? 0 : qo * wor,
      gas_rate_mscfd: shut ? 0 : (qo * 520) / 1000,
    });
  }
  return rows;
};

describe('the history', () => {
  it('drops shut-in days rather than dividing by zero', () => {
    // A day with no oil has nothing to say about the water mechanism,
    // and an Infinity carried into a Bourdet window poisons the
    // derivative for a decade either side of it.
    const h = ratioHistory({ rows: history() });
    expect(h.ok).toBe(true);
    expect(h.droppedShutInDays).toBe(3);
    expect(h.series.every((p) => Number.isFinite(p.ratio))).toBe(true);
  });

  it('measures PRODUCING time from first oil, not calendar time', () => {
    const h = ratioHistory({ rows: history() });
    expect(h.series[0].t).toBeGreaterThan(0);
    const last = h.series[h.series.length - 1];
    expect(last.t).toBeCloseTo(89 * 8, 0);
  });

  it('refuses a handful of days rather than reading one', () => {
    expect(ratioHistory({ rows: history({ n: 4 }) }).ok).toBe(false);
    expect(ratioHistory({ rows: [] }).ok).toBe(false);
  });

  it('refuses when the water rates are missing, and says which is missing', () => {
    const rows = history().map((r) => ({ ...r, water_rate_stbd: null }));
    const h = ratioHistory({ rows });
    expect(h.ok).toBe(false);
    expect(h.error).toMatch(/water rate/);
  });

  it('reads a gas-oil ratio history too', () => {
    const h = ratioHistory({ rows: history(), ratio: 'gor' });
    expect(h.ok).toBe(true);
    expect(h.series[0].ratio).toBeCloseTo(520, 0);
  });
});

describe('the derivative', () => {
  it('recovers the exponent of a power law, once the one-sided ENDS are dropped', () => {
    // WOR = a t^m has d(WOR)/d(ln t) = m a t^m, so the derivative is a
    // power law with the SAME exponent. Recovering it is the whole
    // accuracy of the diagnostic, because the exponent is what the
    // classifier reads.
    //
    // The Bourdet formula needs a neighbour at least L log cycles away
    // on both sides; at the ends there is only one, so it falls back to
    // a one-sided slope which on a curving response is badly biased.
    // Keeping the ends puts the recovered exponent at 1.32 against a
    // true 1.6 -- right on the classifier's channelling boundary, which
    // is exactly the wrong place to be wrong.
    const h = ratioHistory({ rows: history({ m: 1.6, shutIns: [] }) });
    const d = differentiateRatio({ series: h.series });
    expect(d.ok).toBe(true);
    expect(d.edgesDropped).toBe(2);
    const kept = logLogSlope({
      points: d.series.filter((p) => p.derivative > 0), xKey: 't', yKey: 'derivative',
    });
    expect(kept.slope).toBeGreaterThan(1.5);
    expect(kept.slope).toBeLessThan(1.65);

    // And with the ends left in, it is not recovered. This is the gate
    // on the decision, not just on the outcome.
    const withEnds = logLogSlope({
      points: d.allPoints.filter((p) => p.derivative > 0), xKey: 't', yKey: 'derivative',
    });
    expect(withEnds.slope).toBeLessThan(1.4);
  });

  it('keeps the ends on a short history, where there is little else', () => {
    const h = ratioHistory({ rows: history({ n: 12, shutIns: [] }) });
    const d = differentiateRatio({ series: h.series, perDecade: 4 });
    expect(d.edgesDropped).toBe(0);
  });

  it('log-decimates, so a thousand late days cannot dominate a log-time fit', () => {
    const h = ratioHistory({ rows: history({ n: 400, shutIns: [] }) });
    const d = differentiateRatio({ series: h.series });
    expect(d.rawCount).toBeGreaterThan(300);
    expect(d.usedCount).toBeLessThan(d.rawCount / 2);
  });

  it('counts the spikes it removed rather than removing them silently', () => {
    const rows = history({ shutIns: [] });
    rows[40].water_rate_stbd = rows[40].oil_rate_stbd * 90;
    const d = differentiateRatio({ series: ratioHistory({ rows }).series });
    expect(d.spikesRemoved).toBeGreaterThan(0);
  });
});

describe('the diagnosis, end to end from spine rows', () => {
  it('reads a steeply climbing water history as channelling', () => {
    const d = diagnose({ rows: history({ m: 1.8, shutIns: [] }) });
    expect(d.ok).toBe(true);
    expect(d.mechanism.id).toBe('channelling');
    expect(d.mechanism.treatable).toBe(true);
  });

  it('reads a levelling history as coning, which is NOT treatable by a squeeze', () => {
    const rows = [];
    const start = new Date('2023-01-01').getTime();
    for (let i = 0; i < 90; i += 1) {
      const t = Math.max(1, i * 8);
      const wor = (5 * t) / (t + 150);
      const qo = 900 / (1 + 0.006 * t);
      rows.push({
        prod_date: new Date(start + i * 8 * 86400000).toISOString().slice(0, 10),
        oil_rate_stbd: qo, water_rate_stbd: qo * wor, gas_rate_mscfd: 0.5 * qo,
      });
    }
    const d = diagnose({ rows });
    expect(d.mechanism.id).toBe('coning');
    expect(d.mechanism.treatable).toBe(false);
  });

  it('refuses a history it cannot read, rather than guessing a mechanism', () => {
    const d = diagnose({ rows: history({ n: 4 }) });
    expect(d.ok).toBe(false);
    expect(d.error).toMatch(/not enough production history|handful/);
  });
});

describe('the uplift is a nodal re-solve', () => {
  const inputs = wellInputs();
  const model = buildWellModel(inputs);
  const duty = { wctPct: '35', gor: '520', whpPsia: '250' };

  it('the well solves before anything is done to it', () => {
    const p = operatingPoint({ model, ipr: model.ipr, duty });
    expect(p.ok).toBe(true);
    expect(p.qoStbd).toBeGreaterThan(0);
    expect(p.pwfPsia).toBeGreaterThan(0);
  });

  it('THE TUBING TAKES BACK PART OF WHAT THE INFLOW GAINED', () => {
    // The number that makes this a nodal solve rather than a
    // multiplier. The inflow gains the full productivity multiplier;
    // the well does not, because the extra rate costs more friction.
    // A percentage uplift on the current rate over-promises, always.
    const r = stimulationUplift({
      model,
      inputs: { reFt: 1800, rwFt: 0.354, inflow: inputs.inflow },
      duty, skinBefore: 8, skinAfter: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.piMultiplier).toBeGreaterThan(1.9);
    expect(r.rateMultiplier).toBeLessThan(r.piMultiplier);
    expect(r.upliftStbd).toBeGreaterThan(0);
    expect(r.overstatementStbd).toBeGreaterThan(0);
    expect(r.inflowOnlyStbd).toBeGreaterThan(r.upliftStbd);
  });

  it('removing no skin changes nothing at all', () => {
    const r = stimulationUplift({
      model,
      inputs: { reFt: 1800, rwFt: 0.354, inflow: inputs.inflow },
      duty, skinBefore: 3, skinAfter: 3,
    });
    expect(r.piMultiplier).toBe(1);
    expect(r.upliftStbd).toBeCloseTo(0, 6);
  });

  it('refuses a skin below what the geometry allows, rather than promising the moon', () => {
    const floor = minimumSkin({ reFt: 1800, rwFt: 0.354 });
    const r = stimulationUplift({
      model,
      inputs: { reFt: 1800, rwFt: 0.354, inflow: inputs.inflow },
      duty, skinBefore: 4, skinAfter: floor - 2,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/infinite/);
  });

  it('A SHUTOFF GAINS THROUGH THE COLUMN, WHICH NO INFLOW CALCULATION WOULD FIND', () => {
    // The inflow is held FIXED, so every barrel of the gain came from
    // the column getting lighter and the bottomhole pressure falling.
    const r = shutoffUplift({ model, duty, wctAfterPct: 10 });
    expect(r.ok).toBe(true);
    expect(r.inflowUnchanged).toBe(true);
    expect(r.upliftStbd).toBeGreaterThan(0);
    expect(r.pwfDropPsi).toBeGreaterThan(0);
    expect(r.waterRemovedStbd).toBeGreaterThan(0);
  });

  it('and a bigger water reduction is worth more', () => {
    const small = shutoffUplift({ model, duty, wctAfterPct: 30 });
    const big = shutoffUplift({ model, duty, wctAfterPct: 5 });
    expect(big.upliftStbd).toBeGreaterThan(small.upliftStbd);
  });

  it('refuses a shutoff that leaves more water than there is now', () => {
    const r = shutoffUplift({ model, duty, wctAfterPct: 60 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/less water than there is now/);
  });
});

describe('the economics, on the canonical engine', () => {
  it('values an uplift and returns the canonical cashflow', () => {
    const v = valueIntervention({
      upliftStbd: 180, costUsdMM: 1.2, oilPriceUsd: 70,
      declinePctPerYear: 25, projectLife: 8, discountRate: 10,
    });
    expect(v.ok).toBe(true);
    expect(v.economics.cashflow).toHaveLength(8);
    expect(v.profile).toHaveLength(8);
    expect(v.incrementalBbl).toBeGreaterThan(0);
  });

  it('the uplift DECLINES, because a permanent step change always pays', () => {
    const v = valueIntervention({
      upliftStbd: 180, costUsdMM: 1.2, oilPriceUsd: 70,
      declinePctPerYear: 30, projectLife: 6,
    });
    const rates = v.profile.map((p) => p.rateStbd);
    rates.slice(1).forEach((r, i) => expect(r).toBeLessThan(rates[i]));
    expect(rates[1] / rates[0]).toBeCloseTo(0.7, 6);
  });

  it('REFUSES to run without a stated decline', () => {
    // An intervention modelled as a permanent step change is an
    // intervention that always pays. There is no defensible default.
    const v = valueIntervention({ upliftStbd: 180, costUsdMM: 1.2, oilPriceUsd: 70 });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/commonest way a workover case is oversold/);
  });

  it('refuses to value nothing', () => {
    expect(valueIntervention({ upliftStbd: 0, declinePctPerYear: 20 }).ok).toBe(false);
  });

  it('a dearer job is worth less, and the engine is doing the discounting', () => {
    const base = { upliftStbd: 180, oilPriceUsd: 70, declinePctPerYear: 25, projectLife: 8 };
    const cheap = valueIntervention({ ...base, costUsdMM: 0.5 });
    const dear = valueIntervention({ ...base, costUsdMM: 3.0 });
    expect(dear.economics.metrics.npv).toBeLessThan(cheap.economics.metrics.npv);
    // The gap is the 2.5 million of extra cost DISCOUNTED, and the
    // canonical engine discounts MID-YEAR by documented convention, so
    // it is 2.5 / 1.1^0.5 rather than 2.5 flat. Landing on that is the
    // proof that the imported engine is doing the arithmetic and this
    // layer is not quietly doing its own.
    const gap = cheap.economics.metrics.npv - dear.economics.metrics.npv;
    expect(gap).toBeCloseTo(2.5 / (1.1 ** 0.5), 6);
  });
});

describe('the whole plan', () => {
  const inputs = () => ({
    well: { skin: '7', reFt: '1800', rwFt: '0.354', flowing: true },
    inflow: wellInputs().inflow,
    duty: { wctPct: '55', gor: '520', whpPsia: '250' },
    diagnostic: { ratio: 'wor', lateFraction: 0.5 },
    treatment: { kind: 'stimulation', skinAfter: '0', wctAfterPct: '15' },
    economics: {
      costUsdMM: '1.4', oilPriceUsd: '70', declinePctPerYear: '25',
      projectLife: '8', discountRate: '10',
    },
  });
  const model = buildWellModel(wellInputs());

  it('diagnoses, screens, sizes and values, in that order', () => {
    const r = runIntervention({
      inputs: inputs(), model, rows: history({ m: 1.8, shutIns: [] }),
    });
    expect(r.ok).toBe(true);
    expect(r.diagnosis.mechanism.id).toBe('channelling');
    expect(r.screening.length).toBeGreaterThan(5);
    expect(r.stimulation.ok).toBe(true);
    expect(r.economics.ok).toBe(true);
  });

  it('A BLOCKED TREATMENT IS NOT SIZED, and the plan says why not', () => {
    // Sizing a shutoff on a coning well to four decimal places does not
    // make it a better idea.
    const rows = [];
    const start = new Date('2023-01-01').getTime();
    for (let i = 0; i < 90; i += 1) {
      const t = Math.max(1, i * 8);
      const wor = (5 * t) / (t + 150);
      const qo = 900 / (1 + 0.006 * t);
      rows.push({
        prod_date: new Date(start + i * 8 * 86400000).toISOString().slice(0, 10),
        oil_rate_stbd: qo, water_rate_stbd: qo * wor, gas_rate_mscfd: 0.5 * qo,
      });
    }
    const r = runIntervention({ inputs: inputs(), model, rows });
    expect(r.diagnosis.mechanism.id).toBe('coning');
    const shutoff = r.screening.find((x) => x.id === 'waterShutoff');
    expect(shutoff.blocked).toBe(true);
    expect(r.shutoff).toBeNull();
    expect(r.notes.join(' ')).toMatch(/four decimal places/);
  });

  it('with no history at all, every water treatment is blocked for want of a diagnosis', () => {
    const r = runIntervention({ inputs: inputs(), model, rows: [] });
    expect(r.diagnosis.ok).toBe(false);
    const shutoff = r.screening.find((x) => x.id === 'waterShutoff');
    expect(shutoff.blocked).toBe(true);
    expect(r.notes.join(' ')).toMatch(/No production history is linked/);
  });
});
