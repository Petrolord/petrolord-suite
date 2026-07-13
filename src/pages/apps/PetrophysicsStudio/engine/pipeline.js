// Single-well compute pipeline (Petrophysics Studio G2.3): input
// curves + one parameter set -> the preview interpretation curves the
// workstation displays and (G2.5) publishes. Pure function of its
// inputs — chaining exactly the validated engine modules, nothing
// else, so the pipeline is as trustworthy as the goldens.
//
// Curve keys are the registry mnemonics the explorer maps: DEPT (m),
// GR (API), RHOB (g/cc), NPHI (v/v), DT (us/m), RT (ohm.m). Missing
// optional inputs skip their products (never fabricate).

import { vshFromGr } from './vsh';
import { phiDensity, phiSonicWyllie, phiSonicRhg, phiNd, clampDisplay } from './porosity';
import { swCurve } from './sw';
import { netPay } from './netpay';

/** The workstation's default parameter set — shown in the panel,
 *  never silently assumed by the engines themselves. */
export const DEFAULT_PARAMS = {
  grClean: 20, grClay: 120, vshMethod: 'larionov-tertiary',
  rhoMa: 2.65, rhoFl: 1.0,
  dtMa: 182, dtFl: 656, sonicMethod: 'wyllie',
  ndMethod: 'avg',
  phiSource: 'density',           // density | sonic | nd
  swMethod: 'archie', a: 1, m: 2, n: 2, rw: 0.05, rsh: 2.0,
  cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6,
};

/**
 * @param {{DEPT: ArrayLike<number>, GR?: ArrayLike<number>,
 *          RHOB?: ArrayLike<number>, NPHI?: ArrayLike<number>,
 *          DT?: ArrayLike<number>, RT?: ArrayLike<number>}} curves
 * @param {typeof DEFAULT_PARAMS} params
 * @returns {{outputs: Object<string, Float64Array>, missing: string[]}}
 *   outputs: VSH, PHID, PHIS, PHIND, PHIE (the phiSource pick), SW,
 *   PAY (1/0/NaN display flags) — only those whose inputs exist.
 */
export function computeWell(curves, params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const n = curves.DEPT.length;
  const outputs = {};
  const missing = [];

  if (curves.GR) {
    outputs.VSH = vshFromGr(curves.GR, { grClean: p.grClean, grClay: p.grClay, method: p.vshMethod });
  } else missing.push('GR (Vsh)');

  if (curves.RHOB) {
    outputs.PHID = Float64Array.from(curves.RHOB, (r) => phiDensity(r, p.rhoMa, p.rhoFl));
  }
  if (curves.DT) {
    outputs.PHIS = Float64Array.from(curves.DT, (d) => (p.sonicMethod === 'rhg'
      ? phiSonicRhg(d, p.dtMa)
      : phiSonicWyllie(d, p.dtMa, p.dtFl)));
  }
  if (outputs.PHID && curves.NPHI) {
    outputs.PHIND = Float64Array.from(outputs.PHID, (d, i) => phiNd(d, curves.NPHI[i], p.ndMethod));
  }

  const phiE = { density: outputs.PHID, sonic: outputs.PHIS, nd: outputs.PHIND }[p.phiSource];
  if (phiE) outputs.PHIE = phiE;
  else missing.push(`${p.phiSource} porosity inputs`);

  if (curves.RT && outputs.PHIE && (p.swMethod === 'archie' || outputs.VSH)) {
    outputs.SW = swCurve(
      { rt: curves.RT, phi: outputs.PHIE, vsh: outputs.VSH },
      { method: p.swMethod, rw: p.rw, rsh: p.rsh, a: p.a, m: p.m, n: p.n },
    );
  } else if (!curves.RT) missing.push('RT (Sw)');

  if (outputs.PHIE && outputs.VSH && outputs.SW) {
    const swClamped = Float64Array.from(outputs.SW, (s) => clampDisplay(s));
    const { flags } = netPay(
      { depth: curves.DEPT, phi: outputs.PHIE, vsh: outputs.VSH, sw: swClamped },
      { cutPhi: p.cutPhi, cutVsh: p.cutVsh, cutSw: p.cutSw },
    );
    outputs.PAY = Float64Array.from({ length: n }, (_, i) => (flags[i] === null ? NaN : (flags[i] ? 1 : 0)));
  }

  return { outputs, missing };
}

/** Zone summary on the CURRENT preview curves (display path; the G2.5
 *  publish action snapshots the same numbers into zone.properties). */
export function zoneSummary(curves, outputs, params, zone) {
  const p = { ...DEFAULT_PARAMS, ...params };
  if (!outputs.PHIE || !outputs.VSH || !outputs.SW) return null;
  const swClamped = Float64Array.from(outputs.SW, (s) => clampDisplay(s));
  const { summary } = netPay(
    { depth: curves.DEPT, phi: outputs.PHIE, vsh: outputs.VSH, sw: swClamped },
    { cutPhi: p.cutPhi, cutVsh: p.cutVsh, cutSw: p.cutSw, top: zone.top_md_m, base: zone.base_md_m },
  );
  return summary;
}
