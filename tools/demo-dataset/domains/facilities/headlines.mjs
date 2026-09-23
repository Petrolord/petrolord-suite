// The numbers episodes 30 to 33 quote, formatted once so the generator's
// notes and the gate's check read the same strings, and the negative control
// for each sheet: one wrong input and how far it must move the answer.

import { FD } from './basis.mjs';

/** Fixed decimals with thousands separators, deterministic. */
export const fmt = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true });

const fail = (msg) => { throw new Error(`ASSERT facilities negative control: ${msg}`); };

/**
 * key: the sheet row the negative control rewrites, value: what goes in.
 * check(good, bad) throws unless the wrong input moves the headline beyond
 * the stated tolerance. The gate calls the same checks on the providers.
 */
export const NEGATIVE = {
  'separator-slug-catcher-designer': {
    key: 'Process|Water (bpd)',
    value: String(FD.water_injection_bwpd),
    what: `the water injection rate (${FD.water_injection_bwpd} bwpd) typed as the produced water`,
    tolerance: 'the selected vessel volume grows by more than 10 percent',
    check(good, bad) {
      if (bad.error) fail(`the separator refused the wrong water rate: ${bad.error}`);
      const vol = (r) => r.diameterFt ** 2 * r.lengthFt;
      if (!(vol(bad) > 1.1 * vol(good))) fail(`separator volume ${vol(bad)} vs ${vol(good)}`);
    },
  },
  'facility-network-hydraulics': {
    key: 'Fluid and duty|Liquid rate (bpd)',
    value: String(FD.oil_bopd + FD.water_bwpd),
    what: 'the total liquid (oil and water) typed as the export rate',
    tolerance: 'the friction drop moves by more than 50 percent',
    check(good, bad) {
      const g = good.sizing.dpFrictionPsi;
      const b = bad.sizing.dpFrictionPsi;
      if (!(Math.abs(b - g) > 0.5 * g)) fail(`export friction ${b} vs ${g}`);
    },
  },
  'produced-water-treatment': {
    key: 'Water and train|Inlet droplet d50 (um)',
    value: '10',
    what: 'the inlet d50 sheared to 10 um',
    tolerance: 'the outlet rises above the discharge limit (a verdict flip) and by more than a factor of 3',
    check(good, bad) {
      const g = good.result;
      const b = bad.result;
      if (!(g.meetsSpec === true && b.meetsSpec === false)) fail(`verdicts ${g.meetsSpec} then ${b.meetsSpec}`);
      if (!(b.outletOiwPpm > 3 * g.outletOiwPpm)) fail(`outlet ${b.outletOiwPpm} vs ${g.outletOiwPpm}`);
    },
  },
  'corrosion-rate-predictor': {
    key: 'Inhibition|Efficiency (%)',
    value: '0',
    what: 'the inhibitor left out (efficiency 0)',
    tolerance: 'the rate moves by more than a factor of 3 and the allowance no longer meets the design life',
    check(good, bad) {
      if (bad.error) fail(`the screen refused: ${bad.error}`);
      if (!(bad.rate.rateMmYr > 3 * good.rate.rateMmYr)) fail(`rate ${bad.rate.rateMmYr} vs ${good.rate.rateMmYr}`);
      if (!(good.life.meetsDesignLife === true && bad.life.meetsDesignLife === false)) fail('design life verdict did not flip');
    },
  },
};

const CONTROLLING = { gas: 'the gas', liquid: 'liquid retention', 'liquid-retention': 'liquid retention' };

/** The strings a note quotes, from an evaluation (good) and its negative control (bad). */
export function headlines(slug, r, bad) {
  if (slug === 'separator-slug-catcher-designer') {
    return {
      z: fmt(r.z, 4), k: fmt(r.k, 3),
      diameter: fmt(r.diameterFt, 1), length: fmt(r.lengthFt, 1), ld: fmt(r.ldRatio, 2),
      controlling: CONTROLLING[r.controlling] || r.controlling,
      lengthLiquid: fmt(r.liquidRetentionLengthFt, 1), lengthGas: fmt(r.lengthGasFt, 2),
      waterFall: fmt(r.waterDropFallS, 0), oilRise: fmt(r.oilDropRiseS, 0), residence: fmt(r.residenceOilS, 0),
      negDiameter: fmt(bad.diameterFt, 1), negLength: fmt(bad.lengthFt, 1),
    };
  }
  if (slug === 'facility-network-hydraulics') {
    const s = r.sizing;
    return {
      v: fmt(s.vFtS, 2), re: fmt(s.re, 0),
      dpFriction: fmt(s.dpFrictionPsi, 1), dpElevGain: fmt(-s.dpElevationPsi, 1), dpTotal: fmt(s.dpTotalPsi, 1),
      arrival: fmt(r.profile.p2Psia, 1),
      tReq: fmt(r.wall.tRequiredIn, 4), tPressure: fmt(r.wall.tPressureIn, 4), maop: fmt(r.wall.maop, 0),
      negRate: fmt(FD.oil_bopd + FD.water_bwpd, 0), negFriction: fmt(bad.sizing.dpFrictionPsi, 1),
    };
  }
  if (slug === 'produced-water-treatment') {
    const t = r.result;
    const hc = r.devices.find((d) => d.key === 'hydrocyclone');
    return {
      spec: fmt(t.specPpm, 2), turndown: fmt(hc.turndownRatio, 2), hcCut: fmt(hc.d50cMicron, 1),
      afterHc: fmt(t.stages[0].outletOiwPpm, 1), hcMargin: fmt(t.specPpm - t.stages[0].outletOiwPpm, 1),
      outlet: fmt(t.outletOiwPpm, 1), removal: fmt(t.overallRemovalPct, 1), margin: fmt(t.marginPpm, 1),
      negOutlet: fmt(bad.result.outletOiwPpm, 1),
    };
  }
  // corrosion
  return {
    rate: fmt(r.rate.rateMmYr, 3), uninhibited: fmt(r.rate.uninhibitedMmYr, 3), category: r.category,
    vm: fmt(r.rate.massTransferMmYr, 2), vr: fmt(r.rate.reactionMmYr, 2),
    ph2sPsia: fmt(r.sour.ph2sPsia, 4),
    life: fmt(r.life.remainingYears, 1), needMm: fmt(r.life.requiredAllowanceMm, 2),
    negRate: fmt(bad.rate.rateMmYr, 3), negLife: fmt(bad.life.remainingYears, 1), negShort: fmt(bad.life.shortfallMm, 2),
  };
}
