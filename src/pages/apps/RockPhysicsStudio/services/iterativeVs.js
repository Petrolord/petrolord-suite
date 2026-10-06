// Iterative Vs in hydrocarbon samples (U2-005, RP-U1-018, 2026-10-01).
// With no shear log, prep estimates Vs with Greenberg-Castagna on the
// in-situ Vp. That regression is for brine-filled rock: in a gas sand the
// in-situ Vp is low, so the direct estimate is low too (16 to 26 percent in
// the engines' gate cases). Where a sample holds hydrocarbon the engines'
// iterativeVs finds the Vs whose brine state lies on the regression.
//
// Which samples hold hydrocarbon: with the SW log read, every sample whose
// Sw is below 1, anywhere in the well; with a typed Sw, the samples of the
// selected zone only (the typed fluid is the zone's fluid, as in the zone
// substitution). Samples outside the Gassmann limits keep the direct
// estimate, as do samples the engine refuses. Pure.

import { iterativeVs } from '../engine/vsEstimate';
import { makeSampler } from './scenario';
import { brineVsOf } from './localShear';

/**
 * @param {Object} model SI well model (prep.buildModel); only changed when its Vs is estimated
 * @param {{top_md_m: number, base_md_m: number}|null} zone the selected zone (used when Sw is typed)
 * @returns the same model, or a copy with `vs` replaced where the iteration ran,
 *   `vsMethod: 'iterative'` and `vsIter: {applied, failed, firstError, scope}`
 */
export function applyIterativeVs(model, scenario, rock, zone = null) {
  if (!model || model.vsSource !== 'estimated' || rock?.iterativeVs === false) return model;
  let sm;
  try { sm = makeSampler(model, scenario, rock); } catch { return model; }
  const scope = sm.useSwLog ? 'sw-log' : 'zone';
  if (!sm.useSwLog && (!(scenario.fluidA.sw < 1) || !zone)) return model;
  const vs = Array.from(model.vs);
  let applied = 0; let failed = 0; let firstError = null;
  for (let i = 0; i < model.n; i++) {
    if (!sm.useSwLog && (model.depth[i] < zone.top_md_m || model.depth[i] > zone.base_md_m)) continue;
    const { sw } = sm.swA(i);
    if (!(sw < 1)) continue;
    const vp = model.vp[i]; const rho = model.rho[i]; const phi = sm.phi(i);
    if (![vp, rho, phi].every(Number.isFinite) || sm.outside(i)) continue;
    try {
      const out = iterativeVs({
        vp, rho, phi, kmin: sm.kmin(i), fluidInSitu: sm.fluidA(i), fluidBrine: sm.brine, vsh: model.vsh ? model.vsh[i] : 0,
        // QI A2: the brine state lies on the local shear trend when one is in use
        brineVs: model.vsMethod === 'local' ? brineVsOf(rock?.localVs) : null,
      });
      if (out.converged && out.vs > 0 && out.vs < vp) { vs[i] = out.vs; applied += 1; } else { failed += 1; firstError = firstError || 'the iteration did not settle'; }
    } catch (e) {
      failed += 1;
      if (!firstError) firstError = String(e.message || e).replace(/\s*—\s*/g, ': ');
    }
  }
  if (!applied && !failed) return model;
  return { ...model, vs, vsMethod: applied ? 'iterative' : model.vsMethod, vsIter: { applied, failed, firstError, scope } };
}

/** The shear source in words, for the badge, the CSV, the PDF and the publish. */
export function shearSourceText(model) {
  if (model?.vsSource !== 'estimated') return 'measured shear log';
  const base = model.vpSource === 'estimated' ? 'Vs estimated from the estimated Vp' : 'Vs estimated';
  if (model.vsTrend) {
    const t = model.vsTrend;
    const what = `the local shear trend${t.label ? ` from ${t.label}` : ''} (${t.n} samples, ±${Math.round(t.s)} m/s)`;
    const iter = model.vsMethod === 'iterative' && model.vsIter?.applied
      ? `; iterated through the brine state in ${model.vsIter.applied} hydrocarbon sample${model.vsIter.applied === 1 ? '' : 's'}${model.vsIter.failed ? `, ${model.vsIter.failed} kept the direct estimate` : ''}`
      : '';
    return `${base} from ${what}${iter}${t.extrapolated ? `; ${t.extrapolated} sample${t.extrapolated === 1 ? '' : 's'} outside the calibrated Vp range` : ''}; no shear log`;
  }
  if (model.vsMethod === 'iterative' && model.vsIter?.applied) {
    return `${base} (Greenberg-Castagna on VSH; iterated through the brine state in ${model.vsIter.applied} hydrocarbon sample${model.vsIter.applied === 1 ? '' : 's'}${model.vsIter.failed ? `, ${model.vsIter.failed} kept the direct estimate` : ''}); no shear log`;
  }
  return `${base} (Greenberg-Castagna on VSH); no shear log`;
}
