// Scenario glue (G6.4): the dock's fluid/rock parameter state -> the
// oracle-validated engines. Pure functions (jest-testable); the
// panels only format what comes out of here. Engine discipline holds:
// unphysical inputs THROW with the reason, per-sample gaps are
// skipped and counted — never silently zeroed.

import { brine, gas, deadOil, liveOil, apiToRho0, woodMix } from '../engine/fluids';
import { mixMinerals } from '../engine/minerals';
import { substituteVels } from '../engine/gassmann';
import { kminFromFractions } from './petroInputs';

export const DEFAULT_SCENARIO = {
  conditions: { tC: 60, pMPa: 25, salinity: 0.035 },
  // each side is brine mixed with ONE hydrocarbon at water saturation
  // sw (Reuss/Wood, plan decision 1); sw=1 -> pure brine, sw=0 -> pure hc
  // RP-U1-005: swFromLog reads fluid A's water saturation per sample from
  // the well's SW curve when it has one (the in-situ fluid is what the log
  // says); the typed Sw stands in where the curve is absent or null
  fluidA: { sw: 1, swFromLog: true, hc: { kind: 'gas', gravity: 0.6 } },
  fluidB: { sw: 0, hc: { kind: 'gas', gravity: 0.6 } },
};

export const DEFAULT_ROCK = {
  minerals: { quartz: 1, calcite: 0, dolomite: 0, clay: 0 },
  kminOverrideGPa: '', // blank -> VRH mix of the mineral table
  phiConst: 0.2,       // used only when the well has no PHIE or PHIT curve
  // RP-U1-004: the clay the porosity basis leaves in the solid. With an
  // effective porosity the clay is part of the frame, so K_min mixes clay
  // in at each sample's VSH (Voigt-Reuss-Hill with the table's other minerals)
  clayFromVsh: false,
  // U2-009: K_min per sample from the mineral fractions Petrophysics Studio
  // published on the well (off until the user asks; the K_min override wins)
  mineralsFromPetro: false,
  // RP-U1-006: Gassmann holds for connected porosity in reservoir rock;
  // samples above vshMax or below phiMin keep their in-situ values, counted
  vshMax: 0.5,
  phiMin: 0.03,
  // U2-005: with no shear log, Vs in hydrocarbon-bearing samples is found
  // by iteration through the brine state (Greenberg-Castagna holds for
  // brine rock); off = the regression applied straight to the in-situ Vp
  iterativeVs: true,
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

/** K_min (Pa) at one sample: the mineral table with clay at that sample's VSH. */
export function kminAtVsh(rock, vsh) {
  const others = Object.entries(rock.minerals).filter(([name, f]) => name !== 'clay' && f > 0);
  const sum = others.reduce((t, [, f]) => t + f, 0);
  const v = Math.min(1, Math.max(0, vsh));
  const entries = sum > 0 ? others.map(([name, f]) => ({ name, frac: (f / sum) * (1 - v) })) : [{ name: 'quartz', frac: 1 - v }];
  if (v > 0) entries.push({ name: 'clay', frac: v });
  return mixMinerals(entries.filter((e) => e.frac > 0)).k;
}

/** Engine messages carry dashes; the screen does not (copy rule). */
export const plainMessage = (m) => String(m || '').replace(/\s*—\s*/g, ': ');

/**
 * What each sample is given before Gassmann runs on it (U2, 2026-10-01):
 * its in-situ fluid (the SW log when asked, else the typed Sw), its
 * mineral modulus (clay at VSH when asked, else the table or the override)
 * and whether it is inside the Gassmann limits. One sampler serves the
 * zone substitution, the iterative Vs and the wet trend, so they cannot
 * read a sample differently.
 */
export function makeSampler(model, scenario, rock) {
  const cond = scenario.conditions;
  const flA = sideFluid(cond, scenario.fluidA);
  const flB = sideFluid(cond, scenario.fluidB);
  const override = parseFloat(rock.kminOverrideGPa);
  const hasOverride = Number.isFinite(override) && override > 0;
  const kminTable = kminFromRock(rock);
  const useClay = !!rock.clayFromVsh && !hasOverride && !!model.vsh;
  // U2-009: the mineral model Petrophysics Studio published on this well
  const usePetro = !!rock.mineralsFromPetro && !hasOverride && !!model.minerals && model.minerals.keys.length > 0 && !model.minerals.unknown.length;
  const useSwLog = !!scenario.fluidA?.swFromLog && !!model.sw;
  const brineAt = brine(cond.tC, cond.pMPa, cond.salinity);
  const hcA = useSwLog && scenario.fluidA.hc ? hcProps(cond, scenario.fluidA.hc) : null;
  const vshMax = Number.isFinite(rock.vshMax) ? rock.vshMax : 1;
  const phiMin = Number.isFinite(rock.phiMin) ? rock.phiMin : 0;
  return {
    flA,
    flB,
    brine: brineAt,
    kminTable,
    useSwLog,
    kminSource: hasOverride ? 'override' : usePetro ? 'petro-minerals' : useClay ? 'vsh' : 'table',
    usePetro,
    labelA: useSwLog ? `brine and ${scenario.fluidA.hc?.kind === 'gas' ? 'gas' : scenario.fluidA.hc?.kind} at the SW log` : flA.label,
    phi: (i) => (model.phi ? model.phi[i] : rock.phiConst),
    /** true when the sample is outside the Gassmann limits */
    outside: (i) => {
      const vsh = model.vsh ? model.vsh[i] : NaN;
      const phi = model.phi ? model.phi[i] : rock.phiConst;
      return (Number.isFinite(vsh) && vsh > vshMax) || phi < phiMin;
    },
    /** in-situ water saturation at the sample, and whether the typed value stood in for a null */
    swA: (i) => {
      if (!useSwLog) return { sw: scenario.fluidA.sw, fallback: false };
      const sw = model.sw[i];
      if (!Number.isFinite(sw)) return { sw: scenario.fluidA.sw, fallback: true };
      return { sw: Math.min(1, Math.max(0, sw)), fallback: false };
    },
    /** the in-situ pore fluid {k, rho} at the sample */
    fluidA: (i) => {
      if (!useSwLog) return flA;
      const sw = model.sw[i];
      if (!Number.isFinite(sw)) return flA;
      const s = Math.min(1, Math.max(0, sw));
      return s >= 1 ? brineAt : s <= 0 ? hcA : woodMix([{ ...brineAt, sat: s }, { ...hcA, sat: 1 - s }]);
    },
    fluidB: () => flB,
    kmin: (i) => {
      if (usePetro) {
        const k = kminFromFractions(model.minerals, i);
        if (Number.isFinite(k)) return k;
      }
      const vsh = model.vsh ? model.vsh[i] : NaN;
      return useClay && Number.isFinite(vsh) ? kminAtVsh(rock, vsh) : kminTable;
    },
    /** true when the mineral model was asked for but gave nothing at this sample */
    mineralFallback: (i) => usePetro && !Number.isFinite(kminFromFractions(model.minerals, i)),
  };
}

/**
 * The zone substitution the Fluids panel, the AVO replacement and the
 * publish all use (RP-U1-004/005/006). Per sample: fluid A from the SW log
 * when asked, K_min from VSH when asked, and the validity cutoffs. Returns
 * substituteInterval's shape plus {outside, swFromLog, swFallback,
 * kminMin, kminMax, kminSource, phiBasis}.
 */
export function substituteZone(model, indices, scenario, rock) {
  const sm = makeSampler(model, scenario, rock);
  const n = model.n;
  const out = {
    vp: new Array(n).fill(NaN),
    vs: new Array(n).fill(NaN),
    rho: new Array(n).fill(NaN),
    done: 0,
    skipped: 0,
    outside: 0,
    swFallback: 0,
    mineralFallback: 0,
    firstError: null,
    kmin: sm.kminTable,
    kminMin: Infinity,
    kminMax: -Infinity,
    kminSource: sm.kminSource,
    swFromLog: sm.useSwLog,
    phiBasis: model.phi ? (model.phiBasis || 'effective') : 'constant',
    mineralKeys: sm.usePetro ? [...model.minerals.keys] : null,
    flA: sm.flA,
    flB: sm.flB,
    labelA: sm.labelA,
  };
  for (const i of indices) {
    const vp = model.vp[i];
    const vs = model.vs[i];
    const rho = model.rho[i];
    const phi = sm.phi(i);
    if (![vp, vs, rho, phi].every(Number.isFinite)) { out.skipped += 1; continue; }
    if (sm.outside(i)) { out.outside += 1; continue; }
    try {
      if (sm.swA(i).fallback) out.swFallback += 1;
      const kmin = sm.kmin(i);
      if (sm.mineralFallback(i)) out.mineralFallback += 1;
      const r = substituteVels(vp, vs, rho, kmin, phi, sm.fluidA(i), sm.fluidB(i));
      out.vp[i] = r.vp;
      out.vs[i] = r.vs;
      out.rho[i] = r.rho;
      out.done += 1;
      out.kminMin = Math.min(out.kminMin, kmin);
      out.kminMax = Math.max(out.kminMax, kmin);
    } catch (e) {
      out.skipped += 1;
      if (!out.firstError) out.firstError = plainMessage(e.message);
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
  const sub = substituteZone(model, idx, scenario, rock);
  const flA = sub.flA;
  const flB = sub.flB;
  if (!sub.done) return { error: `no sample in the window could be substituted (${sub.firstError || (sub.outside ? 'every sample is outside the Gassmann limits in Scenario & rock' : 'gaps')}); check that fluid A is the fluid actually in this rock` };
  const mean = (arr) => {
    const v = idx.map((i) => arr[i]).filter(Number.isFinite);
    return v.reduce((s, x) => s + x, 0) / v.length;
  };
  return { vp: mean(sub.vp), vs: mean(sub.vs), rho: mean(sub.rho), labelA: sub.labelA, labelB: flB.label };
}
