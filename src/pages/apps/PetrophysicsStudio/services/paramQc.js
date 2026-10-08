// Parameter QC hints (AppUpgrade PETRO-U2-015, 2026-09-29). A graduate's
// first interpretation fails quietly when a parameter sits outside what the
// well itself shows: a GR clean line above most of the sands, a matrix
// density lighter than the densest rock (negative porosity), a cutoff no
// sample passes, an Rw above the apparent Rwa of the clean wet rock. Each
// hint names the parameter, the well's own statistic and what follows from
// it. Hints advise; nothing is changed or blocked.

const pct = (arr, q) => {
  const xs = [];
  for (let i = 0; i < (arr?.length || 0); i++) if (Number.isFinite(arr[i])) xs.push(arr[i]);
  if (!xs.length) return NaN;
  xs.sort((a, b) => a - b);
  return xs[Math.min(xs.length - 1, Math.max(0, Math.round(q * (xs.length - 1))))];
};
const f = (v, d = 2) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : 'n/a');
const frac = (arr, test) => {
  let n = 0; let k = 0;
  for (let i = 0; i < (arr?.length || 0); i++) if (Number.isFinite(arr[i])) { n += 1; if (test(arr[i])) k += 1; }
  return n ? k / n : 0;
};

/**
 * @param {{curves: Object, outputs: Object, params: Object}} p
 * @returns {Array<{key: string, level: 'warn'|'error', text: string}>}
 */
export function paramQcHints({ curves = {}, outputs = {}, params = {} }) {
  const out = [];
  const gr = curves.GR;
  if (gr) {
    const p5 = pct(gr, 0.05); const p50 = pct(gr, 0.5); const p95 = pct(gr, 0.95);
    if (!(params.grClay > params.grClean)) out.push({ key: 'grClay', level: 'error', text: `GR clay (${params.grClay}) must be above GR clean (${params.grClean}).` });
    else {
      if (params.grClean > p50) out.push({ key: 'grClean', level: 'warn', text: `GR clean ${params.grClean} API is above this well's median GR (${f(p50, 0)}): half the well would read as clean sand. The 5th percentile is ${f(p5, 0)} API.` });
      else if (params.grClean < p5 - 20) out.push({ key: 'grClean', level: 'warn', text: `GR clean ${params.grClean} API is far below this well's cleanest rock (5th percentile ${f(p5, 0)} API): Vsh reads high in the sands.` });
      if (params.grClay < p50) out.push({ key: 'grClay', level: 'warn', text: `GR clay ${params.grClay} API is below this well's median GR (${f(p50, 0)}): most of the well reads as 100 percent shale. The 95th percentile is ${f(p95, 0)} API.` });
      else if (params.grClay > p95 + 30) out.push({ key: 'grClay', level: 'warn', text: `GR clay ${params.grClay} API is far above this well's shales (95th percentile ${f(p95, 0)} API): Vsh reads low everywhere.` });
    }
  }
  if (curves.RHOB && Number.isFinite(params.rhoMa)) {
    const above = frac(curves.RHOB, (v) => v > params.rhoMa + 0.02);
    if (above > 0.05) out.push({ key: 'rhoMa', level: 'warn', text: `${Math.round(above * 100)} percent of RHOB samples are denser than the matrix density ${params.rhoMa} g/cc: density porosity goes negative there (99th percentile RHOB ${f(pct(curves.RHOB, 0.99))}). A heavier matrix (limestone 2.71, dolomite 2.87) or heavy minerals?` });
  }
  // Wyllie in unconsolidated rock: the time average overreads unless divided
  // by a compaction factor, commonly the nearby shale slowness / 100 us/ft
  // (Hilchie 1978). DT is us/m in the registry (SI rule).
  if (params.phiSource === 'sonic' && params.sonicMethod !== 'rhg') {
    const cp = params.sonicCp ?? 1;
    if (!(cp >= 1)) out.push({ key: 'sonicCp', level: 'error', text: `Bcp ${cp} must be 1 or more (1 means no compaction correction).` });
    else if (curves.DT && outputs.VSH) {
      const sh = [];
      for (let i = 0; i < curves.DT.length; i++) if (outputs.VSH[i] >= 0.7 && curves.DT[i] > 0) sh.push(curves.DT[i] / 3.28084);
      if (sh.length >= 20) {
        const dtSh = pct(sh, 0.5);
        if (dtSh > 100 && Math.abs(cp - dtSh / 100) > 0.1) out.push({ key: 'sonicCp', level: 'warn', text: `Shales in this well read ${f(dtSh, 0)} µs/ft, slower than 100: the sands are likely uncompacted and Wyllie overreads. A compaction factor Bcp of about ${f(dtSh / 100, 2)} (shale Δt / 100) is the usual correction. Better still, calibrate Bcp on a nearby well with a density log; RHG has no compaction term.` });
      }
    }
  }
  const phi = outputs.PHIE || outputs.PHIT;
  if (phi && Number.isFinite(params.cutPhi)) {
    const pass = frac(phi, (v) => v >= params.cutPhi);
    if (pass === 0) out.push({ key: 'cutPhi', level: 'warn', text: `No sample passes the porosity cutoff ${params.cutPhi} (highest φe ${f(pct(phi, 1), 3)}): net pay is zero everywhere.` });
  }
  if (outputs.VSH && Number.isFinite(params.cutVsh) && frac(outputs.VSH, (v) => v <= params.cutVsh) === 0) {
    out.push({ key: 'cutVsh', level: 'warn', text: `No sample passes the Vsh cutoff ${params.cutVsh} (lowest Vsh ${f(pct(outputs.VSH, 0), 3)}): net pay is zero everywhere.` });
  }
  if (outputs.SW && Number.isFinite(params.cutSw) && frac(outputs.SW, (v) => v <= params.cutSw) === 0) {
    out.push({ key: 'cutSw', level: 'warn', text: `No sample passes the Sw cutoff ${params.cutSw} (lowest Sw ${f(pct(outputs.SW, 0), 3)}): net pay is zero everywhere.` });
  }
  // Rw against the apparent Rwa = Rt phi^m / a of clean, porous rock (the
  // wet sands set its floor): an Rw well above it makes those sands read Sw below 1
  if (curves.RT && phi && outputs.VSH && Number.isFinite(params.rw) && params.tempMode !== 'linear') {
    const rwa = [];
    for (let i = 0; i < phi.length; i++) {
      if (outputs.VSH[i] <= 0.15 && phi[i] >= 0.1 && curves.RT[i] > 0) rwa.push(curves.RT[i] * phi[i] ** (params.m || 2) / (params.a || 1));
    }
    if (rwa.length >= 10) {
      const p5 = pct(rwa, 0.05);
      if (params.rw > 1.5 * p5) out.push({ key: 'rw', level: 'warn', text: `Rw ${params.rw} ohm.m is above the apparent Rwa of this well's clean porous rock (5th percentile ${f(p5, 3)} ohm.m): wet sands would read Sw below 1. Check Rw on a Pickett plot.` });
    }
  }
  return out;
}
