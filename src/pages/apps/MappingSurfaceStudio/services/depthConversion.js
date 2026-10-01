// More depth-conversion methods (Mapping & Surface Studio upgrade U2-008,
// 2026-09-30), beside the linear V(z) from a Seismolord volume and the
// gridded average velocity from the wells (T1):
//
// 1. V0 + kZ fitted to the tops. At every well carrying the top, the
//    horizon's TWT and the top's depth below datum are one tie. For the
//    instantaneous velocity V(z) = V0 + k z the depth at one-way time
//    t = TWT / 2 is z = (V0 / k)(e^{k t} - 1) (t V0 when k = 0); for a
//    fixed k this is linear in V0, so V0 has a closed form and k is found
//    by a golden-section search on the depth misfit. The forward model is
//    Seismolord's own twtMsToDepthM, so the fit and the conversion use one
//    function. Needs three ties; says the RMS misfit.
// 2. A velocity map: a registry attribute surface of AVERAGE velocity to
//    the horizon (m/s), resampled onto the time surface; depth = V t.
//    A map whose values are not plausible m/s (feet per second, interval
//    velocity in km/s) is refused with the reason.
// 3. Layer cake: convertWithLayerCake runs Seismolord's own
//    layercakeDepthM node by node once the model's layer boundaries are
//    time grids on the horizon's frame. Seismolord U2-006 publishes the
//    boundaries as registry TWT surfaces (src/lib/velocityModels);
//    LAYER_CAKE_HOOK puts them on the horizon's frame.
// Pure.

import { twtMsToDepthM, layercakeDepthM, normalizeVelocity } from '@/pages/apps/Seismolord/engine/velocityModel';
import { resampleTo, isNull } from '@/lib/gridding/gridmath';
import { boundariesOnSpec } from '@/lib/velocityModels';
import { NULL_VALUE } from '@/lib/gridding/numeric';

const goldenMin = (f, lo, hi, iters = 80) => {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo; let b = hi;
  let c = b - g * (b - a); let d = a + g * (b - a);
  let fc = f(c); let fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
};

/**
 * Least-squares V0 + kZ through the ties.
 * @param {Array<{twtMs:number, depthM:number}>} ties depth below datum, positive
 * @param {{kMin?:number, kMax?:number}} [o] the k search range, 1/s
 * @returns {{v0:number, k:number, rmsM:number, n:number, residuals:number[]}}
 */
export function fitLinearVelocityToTops(ties, { kMin = -0.5, kMax = 2.5 } = {}) {
  const t = (ties || []).filter((q) => Number.isFinite(q.twtMs) && q.twtMs > 0 && Number.isFinite(q.depthM) && q.depthM > 0);
  if (t.length < 3) throw new Error(`Fitting V0 + kZ needs at least 3 wells with the top inside the time surface; ${t.length} ${t.length === 1 ? 'has' : 'have'} it.`);
  // for a fixed k, depth = V0 g(t) with g(t) = twtMsToDepthM(t, {v0: 1, k}): V0 in closed form
  const bestV0 = (k) => {
    let num = 0; let den = 0;
    for (const q of t) { const g = twtMsToDepthM(q.twtMs, { v0: 1, k }); num += g * q.depthM; den += g * g; }
    return num / den;
  };
  const misfit = (v0, k) => t.reduce((s, q) => s + (twtMsToDepthM(q.twtMs, { v0, k }) - q.depthM) ** 2, 0);
  const k = goldenMin((kk) => misfit(bestV0(kk), kk), kMin, kMax, 60);
  const v0 = bestV0(k);
  const residuals = t.map((q) => q.depthM - twtMsToDepthM(q.twtMs, { v0, k }));
  const rmsM = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  return { v0, k, rmsM, n: t.length, residuals };
}

/** Elevation (m, negative below datum) of a TWT grid through V0 + kZ. */
export function elevationFromLinear(twtMs, { v0, k }) {
  const out = new Float64Array(twtMs.length);
  for (let i = 0; i < out.length; i++) out[i] = isNull(twtMs[i]) ? NULL_VALUE : -twtMsToDepthM(twtMs[i], { v0, k });
  return out;
}

/**
 * Depth through an average-velocity map (a registry attribute in m/s).
 * @param {{twtMs:ArrayLike<number>, spec:object, velocity:ArrayLike<number>, velocitySpec:object, unit?:?string}} p
 *   unit: the velocity row's z_unit ('m/s' or 'ft/s'); none is read as m/s
 * @returns {{zM: Float64Array, vRange:[number, number], covered:number}}
 */
export function elevationFromVelocityMap({ twtMs, spec, velocity, velocitySpec, unit = null }) {
  // the row's own unit wins: feet per second converts; an undeclared map is read as m/s and checked
  const f = /^(ft\/s|ftps|ft\/sec)$/i.test(String(unit || '')) ? 0.3048 : 1;
  const v = resampleTo(Float64Array.from(velocity, (x) => (isNull(x) ? x : x * f)), velocitySpec, spec);
  let lo = Infinity; let hi = -Infinity; let covered = 0;
  for (const x of v) if (!isNull(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  if (!Number.isFinite(lo)) throw new Error('The velocity map does not cover the time surface.');
  if (lo < 1000 || hi > 8000) {
    throw new Error(`The velocity map runs from ${Math.round(lo)} to ${Math.round(hi)}: an average velocity to a horizon is 1,000 to 8,000 m/s. ${hi > 8000 ? 'If it is in feet per second, publish it with the unit ft/s.' : 'If it is in km/s or an interval velocity, it cannot be used here.'}`);
  }
  const zM = new Float64Array(twtMs.length);
  for (let i = 0; i < zM.length; i++) {
    const t = twtMs[i]; const vv = v[i];
    if (isNull(t) || isNull(vv)) { zM[i] = NULL_VALUE; continue; }
    zM[i] = -(vv * t) / 2000;
    covered += 1;
  }
  return { zM, vRange: [lo, hi], covered };
}

/**
 * Layer cake through Seismolord's per-column engine, once the boundaries
 * are time grids on the horizon's frame (top-down, one per layer base
 * except the last).
 * @param {{twtMs:ArrayLike<number>, model:object, boundaryTwtMs:Array<ArrayLike<number>>}} p
 * @returns {Float64Array} elevation in metres
 */
export function convertWithLayerCake({ twtMs, model, boundaryTwtMs }) {
  const m = normalizeVelocity(model);
  if (!m || m.kind !== 'layercake') throw new Error('Not a layer-cake velocity model.');
  if (!Array.isArray(boundaryTwtMs) || boundaryTwtMs.length !== m.layers.length - 1) {
    throw new Error(`A ${m.layers.length}-layer cake needs ${m.layers.length - 1} boundary time grid${m.layers.length === 2 ? '' : 's'}.`);
  }
  if (boundaryTwtMs.some((b) => b.length !== twtMs.length)) throw new Error('The boundary grids must share the time surface frame.');
  const out = new Float64Array(twtMs.length);
  for (let i = 0; i < out.length; i++) {
    const t = twtMs[i];
    if (isNull(t)) { out[i] = NULL_VALUE; continue; }
    const col = boundaryTwtMs.map((b) => (isNull(b[i]) ? null : b[i]));
    out[i] = -layercakeDepthM(m.layers, col, t);
  }
  return out;
}

/**
 * THE LAYER-CAKE HOOK, wired by Seismolord U2-006 (2026-10-01): a layer
 * cake's boundaries reach the registry as the TWT surfaces Seismolord
 * publishes from its boundary horizons (Publish boundaries in its velocity
 * dialog). The caller resolves them (src/lib/velocityModels
 * resolveLayerCake, which names any boundary that is not published) and
 * passes them here with the time surface's frame; the hook resamples them
 * onto it for convertWithLayerCake. Without resolved boundaries it says
 * what is needed.
 * @param {Object} [entry] the picker row (velocityEntryFor)
 * @param {{resolved?: {ok: boolean, reason?: string, boundaries?: Array}, spec?: Object}} [ctx]
 * @returns {{ok:false, reason:string}|{ok:true, boundaryTwtMs:Array}}
 */
export function LAYER_CAKE_HOOK(entry, { resolved = null, spec = null } = {}) {
  if (resolved && !resolved.ok) return { ok: false, reason: resolved.reason };
  if (resolved && resolved.ok && spec) {
    return { ok: true, boundaryTwtMs: boundariesOnSpec(resolved, spec) };
  }
  return {
    ok: false,
    reason: `A layer cake converts here from its layer boundaries published as time surfaces by Seismolord${entry?.name ? ` (${entry.name})` : ''}: press Convert to read them.`,
  };
}
