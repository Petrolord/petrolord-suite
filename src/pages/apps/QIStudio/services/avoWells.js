// AVO at the wells (QI programme Q7b, 2026-10-07; closes Rock Physics
// U2-008): the intercept and gradient Rock Physics Studio modelled at each
// well's zone top (the published gather, in situ and fluid substituted)
// against the intercept and gradient the AVO volumes show at that well's
// trace and time. One least-squares scale ties the volumes' amplitudes to
// reflectivity over every well (A and B together); each well's residual and
// its AVO class, modelled and observed, say where they agree. Pure.

import { avoClass } from '../engine/avo';

const fin = Number.isFinite;

/** The well points for sample_volumes, from prepared wells and their zone-top times. */
export function wellPoints(rows) {
  return rows.filter((r) => r.ok && fin(r.topTwt)).map((r) => ({ name: r.name, il: r.il, xl: r.xl, t_ms: r.topTwt }));
}

/**
 * The comparison.
 * @param {Array<{name, modelled: {A, B}, substituted?: {A, B}, observed: ?{A, B}}>} rows
 * @returns {{scale: number, wells: Array, agree: number, n: number}}
 */
export function compareAtWells(rows) {
  let so = 0; let sm = 0; let n = 0;
  for (const r of rows) {
    if (!r.observed || !fin(r.observed.A) || !fin(r.modelled?.A)) continue;
    for (const k of ['A', 'B']) { so += r.observed[k] * r.modelled[k]; sm += r.modelled[k] * r.modelled[k]; }
    n += 1;
  }
  const scale = n && sm > 0 ? so / sm : NaN;
  const wells = rows.map((r) => {
    if (r.error || !r.observed || !fin(scale) || !fin(r.observed.A) || !fin(r.modelled?.A)) return { ...r, error: r.error || 'no observed value' };
    const obs = { A: r.observed.A / scale, B: r.observed.B / scale };
    const res = Math.hypot(obs.A - r.modelled.A, obs.B - r.modelled.B);
    const mClass = avoClass(r.modelled.A, r.modelled.B); const oClass = avoClass(obs.A, obs.B);
    return { ...r, scaled: obs, residual: res, modelledClass: mClass, observedClass: oClass, agree: mClass === oClass };
  });
  return { scale, wells, n, agree: wells.filter((w) => w.agree).length };
}

/** Issues: a class that differs between model and seismic, or a scale of the wrong sign (a polarity or wavelet problem). */
export function avoWellIssues(cmp, runName = 'the AVO run') {
  const out = [];
  const add = (key, severity, title, detail, remedy) => out.push({ key: `avo-wells:${runName}:${key}`, area: 'AVO', severity, title, detail, remedy });
  if (fin(cmp.scale) && cmp.scale < 0) add('scale', 'high', 'The AVO volumes and the model have opposite polarity', `The scale that ties them is ${cmp.scale.toPrecision(3)}.`, 'Check the polarity of the stacks and of the wavelet in Rock Physics Studio.');
  for (const w of cmp.wells) {
    if (w.error) continue;
    if (!w.agree) add(`${w.name}:class`, 'medium', `${w.name}: the AVO class differs between the model and the seismic`, `Modelled class ${w.modelledClass}, seismic class ${w.observedClass} after scaling.`, 'Check the tie and the zone top time at this well, and the angles given to the stacks.');
  }
  return out;
}
