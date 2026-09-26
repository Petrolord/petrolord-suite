// Scenario glue (G6.4): the dock's fluid/rock parameter state -> the
// oracle-validated engines. Pure functions (jest-testable); the
// panels only format what comes out of here. Engine discipline holds:
// unphysical inputs THROW with the reason, per-sample gaps are
// skipped and counted — never silently zeroed.

import { brine, gas, deadOil, liveOil, apiToRho0, woodMix } from '../engine/fluids';
import { mixMinerals } from '../engine/minerals';
import { substituteVels } from '../engine/gassmann';

export const DEFAULT_SCENARIO = {
  conditions: { tC: 60, pMPa: 25, salinity: 0.035 },
  // each side is brine mixed with ONE hydrocarbon at water saturation
  // sw (Reuss/Wood, plan decision 1); sw=1 -> pure brine, sw=0 -> pure hc
  fluidA: { sw: 1, hc: { kind: 'gas', gravity: 0.6 } },
  fluidB: { sw: 0, hc: { kind: 'gas', gravity: 0.6 } },
};

export const DEFAULT_ROCK = {
  minerals: { quartz: 1, calcite: 0, dolomite: 0, clay: 0 },
  kminOverrideGPa: '', // blank -> VRH mix of the mineral table
  phiConst: 0.2,       // used only when the well has no PHIE curve
};

/** Hydrocarbon phase {rho, k, vp?} from the hc spec at conditions. */
export function hcProps(cond, hc) {
  if (hc.kind === 'gas') return gas(cond.tC, cond.pMPa, hc.gravity);
  const rho0 = apiToRho0(hc.api);
  if (hc.kind === 'oil-live') {
    return liveOil(cond.tC, cond.pMPa, rho0, hc.gorLL, hc.gasGravity);
  }
  return deadOil(cond.tC, cond.pMPa, rho0);
}

/** One side's effective pore fluid {rho, k, vp?, label}. */
export function sideFluid(cond, side) {
  const sw = side.sw;
  if (!(sw >= 0 && sw <= 1)) throw new Error('Sw must be in [0, 1].');
  const br = brine(cond.tC, cond.pMPa, cond.salinity);
  if (sw === 1) return { ...br, label: 'brine' };
  const hc = hcProps(cond, side.hc);
  const hcLabel = side.hc.kind === 'gas' ? 'gas' : side.hc.kind;
  if (sw === 0) return { ...hc, label: hcLabel };
  const mixed = woodMix([
    { ...br, sat: sw },
    { ...hc, sat: 1 - sw },
  ]);
  return { ...mixed, label: `${hcLabel} (Sw ${sw})` };
}

/** K_min (Pa) from the rock panel: override wins, else VRH mix. */
export function kminFromRock(rock) {
  const override = parseFloat(rock.kminOverrideGPa);
  if (Number.isFinite(override) && override > 0) return override * 1e9;
  const entries = Object.entries(rock.minerals)
    .filter(([, f]) => f > 0)
    .map(([name, frac]) => ({ name, frac }));
  if (!entries.length) throw new Error('Mineral fractions are all zero.');
  return mixMinerals(entries).k;
}

/**
 * Per-sample Gassmann substitution A -> B over the interval indices.
 * phi comes from the PHIE curve when present, else phiConst. Samples
 * with gaps are skipped (NaN out); samples the engine REJECTS
 * (unphysical) are skipped and counted with the first reason kept.
 * Returns {vp, vs, rho (full-length sparse arrays), done, skipped,
 * firstError}.
 */
export function substituteInterval(model, indices, kmin, flA, flB, phiConst) {
  const n = model.n;
  const out = {
    vp: new Array(n).fill(NaN),
    vs: new Array(n).fill(NaN),
    rho: new Array(n).fill(NaN),
    done: 0,
    skipped: 0,
    firstError: null,
  };
  for (const i of indices) {
    const vp = model.vp[i];
    const vs = model.vs[i];
    const rho = model.rho[i];
    const phi = model.phi ? model.phi[i] : phiConst;
    if (![vp, vs, rho, phi].every(Number.isFinite)) { out.skipped += 1; continue; }
    try {
      const r = substituteVels(vp, vs, rho, kmin, phi, flA, flB);
      out.vp[i] = r.vp;
      out.vs[i] = r.vs;
      out.rho[i] = r.rho;
      out.done += 1;
    } catch (e) {
      out.skipped += 1;
      if (!out.firstError) out.firstError = e.message;
    }
  }
  return out;
}

/**
 * A halfspace's mean Vp, Vs and rho after substituting its pore fluid A -> B
 * over the depth window (from, to) (Rock Physics T1-E1: fluid replacement
 * AVO, the in-situ interface against the same interface with the lower
 * rock carrying fluid B). Uses the same per-sample Gassmann as the Fluids
 * panel. Returns null for an empty window and {error} when the engine
 * rejects every sample (fluid A is not what the rock holds).
 */
export function substitutedHalfspace(model, from, to, scenario, rock) {
  const idx = [];
  for (let i = 0; i < model.depth.length; i++) if (model.depth[i] > from && model.depth[i] < to) idx.push(i);
  if (!idx.length) return null;
  const flA = sideFluid(scenario.conditions, scenario.fluidA);
  const flB = sideFluid(scenario.conditions, scenario.fluidB);
  const sub = substituteInterval(model, idx, kminFromRock(rock), flA, flB, rock.phiConst);
  if (!sub.done) return { error: `no sample in the window could be substituted (${sub.firstError || 'gaps'}); check that fluid A is the fluid actually in this rock` };
  const mean = (arr) => {
    const v = idx.map((i) => arr[i]).filter(Number.isFinite);
    return v.reduce((s, x) => s + x, 0) / v.length;
  };
  return { vp: mean(sub.vp), vs: mean(sub.vs), rho: mean(sub.rho), labelA: flA.label, labelB: flB.label };
}
