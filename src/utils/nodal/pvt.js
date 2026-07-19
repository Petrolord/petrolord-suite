/**
 * Black-oil PVT adapter for the Nodal Analysis Studio engine (NA1).
 *
 * All oil/gas property routes delegate to the audited Fluid Systems Studio
 * layer (src/utils/fluidStudioCalculations.js: Standing / Vasquez-Beggs /
 * Glaso Rs-Bo, Beggs-Robinson viscosity, Papay Z with Sutton pseudo
 * criticals, Lee-Gonzalez-Eakin gas viscosity, Vasquez-Beggs co). This
 * module adds only what nodal needs that Fluid Studio does not carry:
 *
 *  - water FVF (McCain 1990), water viscosity (McCain: A(S) T^B(S) with
 *    pressure correction), brine density from salinity
 *  - in-situ phase densities in lbm/ft3
 *  - gas-oil surface tension (Baker and Swerdloff 1956, with the standard
 *    dead-oil T interpolation and pressure correction) and gas-water
 *    surface tension (Hough style two-isotherm interpolation)
 *
 * The traverse evaluates properties segment by segment at local (p, T), so
 * pvtAt takes temperature explicitly; the Fluid Studio `fluid` object is
 * rebuilt per call with the local temp (its correlations read fluid.temp).
 *
 * Field units in and out: psia, degF, scf/STB, rb/STB, rb/scf, cp,
 * lbm/ft3, dyn/cm.
 */

import {
  rsAt,
  boAt,
  muObAt,
  solveBubblePoint,
  zFactor,
  bgAt,
  muGas,
  coAt,
  undersaturatedMuO,
} from '../fluidStudioCalculations';
import { clamp, num } from './numerics';

const AIR_MW = 28.97;
const WATER_DENSITY_SC = 62.368; // lbm/ft3 pure water at standard conditions

/**
 * Build the immutable fluid model consumed by pvtAt and the traverse.
 * inputs: { api, gasSg, gor (produced GOR scf/STB), salinityPpm,
 *           correlations: { pb_rs_bo, viscosity } }
 * Returns { api, gasSg, gor, salinityPpm, gammaO, correlations, warnings }.
 */
export const buildFluidModel = (inputs = {}) => {
  const api = num(inputs.api, 35);
  const gasSg = num(inputs.gasSg, 0.75);
  const gor = Math.max(0, num(inputs.gor, 500));
  const salinityPpm = Math.max(0, num(inputs.salinityPpm, 30000));
  const correlations = {
    pb_rs_bo: inputs.correlations?.pb_rs_bo || 'standing',
    viscosity: inputs.correlations?.viscosity || 'beggs_robinson',
  };
  const warnings = [];
  if (!(api > 5 && api < 70)) warnings.push('Oil API gravity outside the 5 to 70 correlation band.');
  if (!(gasSg >= 0.55 && gasSg <= 1.2)) warnings.push('Gas specific gravity outside the 0.55 to 1.2 correlation band.');
  return {
    api,
    gasSg,
    gor,
    salinityPpm,
    gammaO: 141.5 / (131.5 + api),
    correlations,
    warnings,
  };
};

/** Fluid Studio fluid object at a local temperature. */
const fsFluidAt = (model, tF) => ({
  api: model.api,
  gasGravity: model.gasSg,
  temp: tF,
  rsb: model.gor,
  salinity: model.salinityPpm,
  correlations: model.correlations,
});

/** Bubble point at a local temperature (psia), consistent with the Rs route. */
export const bubblePointAt = (model, tF) => solveBubblePoint(fsFluidAt(model, tF));

/** McCain water FVF (rb/STB). */
export const waterFvf = (p, tF) => {
  const dVwT = -1.0001e-2 + 1.33391e-4 * tF + 5.50654e-7 * tF * tF;
  const dVwP =
    -1.95301e-9 * p * tF - 1.72834e-13 * p * p * tF - 3.58922e-7 * p - 2.25341e-10 * p * p;
  return (1 + dVwP) * (1 + dVwT);
};

/** McCain brine viscosity (cp). S in weight percent solids. */
export const waterViscosity = (p, tF, salinityPpm) => {
  const S = clamp(salinityPpm / 10000, 0, 26); // wt%
  const A = 109.574 - 8.40564 * S + 0.313314 * S * S + 8.72213e-3 * S * S * S;
  const B =
    -1.12166 + 2.63951e-2 * S - 6.79461e-4 * S * S - 5.47119e-5 * S * S * S +
    1.55586e-6 * S * S * S * S;
  const muAtm = A * Math.pow(Math.max(tF, 40), B);
  const pressureRatio = 0.9994 + 4.0295e-5 * p + 3.1062e-9 * p * p;
  return Math.max(muAtm * pressureRatio, 0.1);
};

/** Brine density at standard conditions (lbm/ft3). S in weight percent. */
export const brineDensitySc = (salinityPpm) => {
  const S = clamp(salinityPpm / 10000, 0, 26);
  return WATER_DENSITY_SC + 0.438603 * S + 1.60074e-3 * S * S;
};

/**
 * Baker and Swerdloff gas-oil surface tension (dyn/cm) with the standard
 * pressure correction, floored at 1 dyn/cm so annular-mist groups stay
 * finite at high pressure.
 */
export const gasOilSurfaceTension = (p, tF, api) => {
  const s68 = 39 - 0.2571 * api;
  const s100 = 37.5 - 0.2571 * api;
  let dead;
  if (tF <= 68) dead = s68;
  else if (tF >= 100) dead = s100;
  else dead = s68 + ((tF - 68) * (s100 - s68)) / 32;
  const live = dead * (1 - 0.024 * Math.pow(Math.max(p, 0), 0.45));
  return Math.max(live, 1);
};

/** Hough style gas-water surface tension (dyn/cm), two-isotherm interpolation. */
export const gasWaterSurfaceTension = (p, tF) => {
  const s74 = 75 - 1.108 * Math.pow(Math.max(p, 0), 0.349);
  const s280 = 53 - 0.1048 * Math.pow(Math.max(p, 0), 0.637);
  let sigma;
  if (tF <= 74) sigma = s74;
  else if (tF >= 280) sigma = s280;
  else sigma = s74 + ((tF - 74) * (s280 - s74)) / 206;
  return Math.max(sigma, 1);
};

/**
 * Full property set at local (p, tF).
 * Returns { pb, rs, bo, bw, bg, z, muO, muG, muW, rhoO, rhoG, rhoW,
 *           sigmaOG, sigmaWG }.
 * rs is clamped to the produced GOR (free gas = gor - rs, never negative).
 * Above the local bubble point the oil is undersaturated: Bo shrinks with
 * co and viscosity rises per Vasquez-Beggs.
 */
export const pvtAt = (model, p, tF) => {
  const fs = fsFluidAt(model, tF);
  const pb = solveBubblePoint(fs);
  const saturated = p < pb;
  const rs = saturated ? clamp(rsAt(p, fs), 0, model.gor) : model.gor;

  const bob = boAt(rs, fs);
  let bo = bob;
  let muO;
  if (saturated) {
    muO = muObAt(rs, fs);
  } else {
    const co = coAt(fs, p);
    bo = bob * Math.exp(-co * (p - pb));
    muO = undersaturatedMuO(muObAt(model.gor, fs), p, pb);
  }

  const z = zFactor(p, tF, model.gasSg);
  const bg = bgAt(p, tF, z); // rb/scf
  const muG = muGas(p, tF, model.gasSg, z);

  const bw = waterFvf(p, tF);
  const muW = waterViscosity(p, tF, model.salinityPpm);
  const rhoW = brineDensitySc(model.salinityPpm) / bw;

  // In-situ oil density: stock-tank oil plus dissolved gas in the swollen volume.
  const rhoO = (350.17 * model.gammaO + 0.0764 * model.gasSg * rs) / (5.615 * bo);
  // In-situ gas density from the real-gas law: 2.7 = 28.97 / 10.732.
  const tR = tF + 460;
  const rhoG = p > 0 ? (AIR_MW / 10.732) * (p * model.gasSg) / (Math.max(z, 1e-3) * tR) : 0;

  return {
    pb,
    rs,
    bo,
    bw,
    bg,
    z,
    muO: Math.max(muO, 0.05),
    muG: Math.max(muG, 0.005),
    muW,
    rhoO,
    rhoG,
    rhoW,
    sigmaOG: gasOilSurfaceTension(p, tF, model.api),
    sigmaWG: gasWaterSurfaceTension(p, tF),
  };
};
