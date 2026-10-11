// AVO at the wells (QI programme Q7b, 2026-10-07; closes Rock Physics
// U2-008): the intercept and gradient Rock Physics Studio modelled at each
// well's zone top (the published gather, in situ and fluid substituted)
// against the intercept and gradient the AVO volumes show at that well's
// trace and time. One least-squares scale ties the volumes' amplitudes to
// reflectivity over every well (A and B together); each well's residual and
// its AVO class, modelled and observed, say where they agree. Pure.
//
// The maths lives in the engines (engines/qi/avoWells.js, QI course gate E2,
// 2026-10-11; goldens and an independent oracle there). This file keeps the
// issue register copy and re-exports the rest.

export { wellPoints, compareAtWells } from '../engine/avoWells';

const fin = Number.isFinite;

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
