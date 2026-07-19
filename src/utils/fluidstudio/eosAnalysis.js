/**
 * UI-facing orchestrator for the compositional PR78 path — FS5.
 *
 * Bridges the Fluid Studio input state to the validated EOS engine in
 * ./eos/ (FS1-FS4). Everything here is pure and synchronous; only the
 * envelope trace is slow and lives in the web worker (envelopeClient.js).
 *
 * The compositional path is opt-in beside the black-oil default. Nothing
 * in this file touches the black-oil pipeline, which stays pinned by
 * __tests__/blackOilSnapshot.test.js.
 *
 * UI units at this seam: mole percent, °F, psia. The engine works in
 * mole fraction / °R internally (see eos/units.js).
 */

import { COMPONENT_ORDER, COMPONENTS, PLUS_FRACTION_KEY } from './eos/components.js';
import { mixtureFromKeys } from './eos/pr78.js';
import { characterizePlusFraction, mixtureWithPlusFraction } from './eos/characterization.js';
import { flashPT } from './eos/flash.js';
import { lbcViscosity, weinaugKatzIFT } from './eos/transport.js';
import { degFtoR } from './eos/units.js';

/** Empty composition state (mol%), used by sample data and the input tab. */
export const emptyComposition = () => ({
  model: 'pr78',
  zPct: Object.fromEntries([...COMPONENT_ORDER, PLUS_FRACTION_KEY].map((k) => [k, 0])),
  plus: { mw: null, sg: null, tbF: null },
  pressure: null,
  temp: null,
  envelope: { tMinF: 40, tMaxF: 400, nT: 15 },
});

/**
 * Validate and normalize the composition tab state.
 *
 * Returns { valid, errors, warnings, keys, z, plus, sumPct }:
 * keys/z are the engine-ready ordered component list and normalized mole
 * fractions (components at exactly zero are dropped; the engine takes
 * ln z). plus is null when the fluid has no C7+.
 */
export const parseComposition = (composition) => {
  const errors = [];
  const warnings = [];
  const zPct = composition?.zPct ?? {};

  const entries = [...COMPONENT_ORDER, PLUS_FRACTION_KEY]
    .map((k) => [k, Number(zPct[k]) || 0])
    .filter(([, v]) => v > 0);
  const sumPct = entries.reduce((s, [, v]) => s + v, 0);

  if (entries.length < 2) {
    errors.push('Enter at least two components with nonzero mole percent.');
  }
  if (entries.some(([, v]) => v < 0)) errors.push('Mole percents must be positive.');
  if (sumPct > 0 && Math.abs(sumPct - 100) > 1) {
    warnings.push(`Composition sums to ${sumPct.toFixed(2)} mol%; it is renormalized to 100% for the EOS.`);
  }

  const hasPlus = entries.some(([k]) => k === PLUS_FRACTION_KEY);
  let plus = null;
  if (hasPlus) {
    const mw = Number(composition?.plus?.mw);
    const sg = Number(composition?.plus?.sg);
    if (!(mw > 0) || !(sg > 0)) {
      errors.push('The C7+ fraction needs a molecular weight and specific gravity.');
    } else {
      if (mw < 90 || mw > 400) warnings.push('C7+ MW outside the usual 90 to 400 range; correlations are extrapolating.');
      if (sg < 0.7 || sg > 1.0) warnings.push('C7+ SG outside the usual 0.70 to 1.00 range; correlations are extrapolating.');
      plus = { mw, sg };
      const tbF = Number(composition?.plus?.tbF);
      if (Number.isFinite(tbF) && tbF > 0) plus.tbR = degFtoR(tbF);
    }
  }

  const temp = Number(composition?.temp);
  const pressure = Number(composition?.pressure);
  if (!(temp > -400)) errors.push('Enter the flash temperature.');
  if (!(pressure > 0)) errors.push('Enter the flash pressure.');

  const keys = entries.filter(([k]) => k !== PLUS_FRACTION_KEY).map(([k]) => k);
  const z = entries.filter(([k]) => k !== PLUS_FRACTION_KEY).map(([, v]) => v / (sumPct || 1));
  if (plus) {
    const zPlus = entries.find(([k]) => k === PLUS_FRACTION_KEY)[1] / sumPct;
    keys.push(PLUS_FRACTION_KEY);
    z.push(zPlus);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    keys,
    z,
    plus,
    sumPct,
    tempF: temp,
    pressurePsia: pressure,
  };
};

/** Build the EOS mixture for a parsed composition (pseudo appended last). */
export const buildMixture = (parsed) => {
  if (parsed.plus) {
    return mixtureWithPlusFraction(parsed.keys.slice(0, -1), parsed.plus);
  }
  return mixtureFromKeys(parsed.keys);
};

const round = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/**
 * Synchronous compositional analysis at the flash (T, P): stability-gated
 * two-phase flash, per-phase densities/viscosities, IFT, and the
 * per-component phase table. Fast enough for keystroke recompute; the
 * envelope/Psat slow path goes through the worker instead.
 *
 * Returns null when the composition is not valid yet (the card shows the
 * parse errors instead).
 */
export const runEosFlash = (composition) => {
  const parsed = parseComposition(composition);
  if (!parsed.valid) return { parsed, flash: null };

  const mix = buildMixture(parsed);
  const tR = degFtoR(parsed.tempF);
  const res = flashPT(mix, parsed.z, tR, parsed.pressurePsia);

  const phaseRow = (label, x, props) => {
    const mu = lbcViscosity(mix, x, tR, props);
    return {
      label,
      moleFraction: null,
      density: props.density,
      molarVolume: props.molarVolume,
      zFactor: props.zFactor,
      viscosityCp: mu.viscosityCp,
      apparentMw: props.apparentMw,
    };
  };

  let flash;
  if (res.phases === 2) {
    const liquid = phaseRow('Liquid', res.x, res.liquid);
    const vapor = phaseRow('Vapor', res.y, res.vapor);
    liquid.moleFraction = 1 - res.beta;
    vapor.moleFraction = res.beta;
    const ift = weinaugKatzIFT(mix, res.x, res.y, res.liquid, res.vapor);
    flash = {
      phases: 2,
      beta: res.beta,
      liquid,
      vapor,
      iftDynPerCm: ift.iftDynPerCm,
      componentTable: parsed.keys.map((k, i) => ({
        key: k,
        name: (COMPONENTS[k] || mix.plus?.comp)?.name ?? k,
        z: round(parsed.z[i], 5),
        x: round(res.x[i], 5),
        y: round(res.y[i], 5),
        K: round(res.K[i], 5),
      })),
    };
  } else {
    // negative-flash reasons tell us which side of the boundary we are on;
    // a plain 'stable' outcome stays unlabeled
    const label = res.reason === 'negative-flash-liquid' ? 'Liquid (single phase)'
      : res.reason === 'negative-flash-vapor' ? 'Vapor (single phase)'
        : 'Single phase';
    const feed = phaseRow(label, parsed.z, res.feed);
    feed.moleFraction = 1;
    flash = {
      phases: 1,
      reason: res.reason,
      feed,
      componentTable: parsed.keys.map((k, i) => ({
        key: k,
        name: (COMPONENTS[k] || mix.plus?.comp)?.name ?? k,
        z: round(parsed.z[i], 5),
      })),
    };
  }

  return {
    parsed,
    characterization: mix.plus
      ? { ...mix.plus.comp, meta: mix.plus.meta, bipC1: mix.plus.bip.C1 }
      : null,
    flash,
  };
};

/**
 * The envelope-trace request payload for the worker (plain data only).
 * resTempF marks the temperature whose saturation pressure is reported.
 */
export const envelopeRequest = (composition) => {
  const parsed = parseComposition(composition);
  if (!parsed.valid) return null;
  const env = composition?.envelope ?? {};
  return {
    keys: parsed.keys,
    z: parsed.z,
    plus: parsed.plus,
    tMinF: Number(env.tMinF) || 40,
    tMaxF: Number(env.tMaxF) || 400,
    nT: Math.min(Math.max(Math.round(Number(env.nT) || 15), 5), 40),
    resTempF: parsed.tempF,
    resPressurePsia: parsed.pressurePsia,
  };
};
