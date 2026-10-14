// Prestack simultaneous inversion of a study's angle stacks (QI programme
// Q8b, 2026-10-07; SOW section 9). One module for the seismic worker (the
// prestack_inversion job: the whole lattice, or the well traces for the
// blind check) and the tests. The wells' ln(AI), ln(SI) and ln(rho) in time
// each become a horizon-guided low-frequency model (engines qi/lfm.js); the
// tie wavelet is scaled to the stacks at the wells through the Fatti forward
// model; each CDP's stacks are inverted with the engines' simultaneous
// inversion (qi/prestackInversion.js). Products: AI, SI, density and Vp/Vs
// (AI / SI), all elastic estimates. Pure apart from nothing: brick reads stay
// in the handler.

import { forwardFatti, simultaneousInversion } from '../engine/prestackInversion';
import { lfmTrace, blindWellScore } from '../engine/lfm';
import { lfmWells, lowPassFinite, halfWindowFor } from './inversionRun';

export const PRESTACK_PARAMS = Object.freeze([
  { key: 'ai', log: 'ln_ai', label: 'AI' },
  { key: 'si', log: 'ln_si', label: 'SI' },
  { key: 'rho', log: 'ln_rho', label: 'Density' },
]);
export const PRESTACK_PRODUCTS = Object.freeze({ ai: 'Acoustic impedance', si: 'Shear impedance', rho: 'Density', vpvs: 'Vp/Vs' });
export const PRESTACK_DEFAULTS = { lfmHz: 8, truthHz: 50, eps: [0.05, 0.05, 0.05], iters: 60 };
const fin = Number.isFinite;
const NULL_LIM = 1e29;
const isNull = (v) => !(Math.abs(v) <= NULL_LIM);

/** Why the job cannot run, or null. */
export function validatePrestackParams(p) {
  if (!p || typeof p !== 'object') return 'Missing settings.';
  if (p.mode !== 'blind' && p.mode !== 'volume') return 'The mode must be blind or volume.';
  const inv = p.inversion;
  if (!inv) return 'Missing inversion settings.';
  const st = inv.stacks;
  if (!Array.isArray(st) || st.length < 3 || st.length > 6) return 'Give three to six angle stacks (density needs the far angles).';
  if (st.some((s) => !(s.angle >= 0 && s.angle <= 50))) return 'Each stack needs its mean angle, 0 to 50 degrees.';
  const a = st.map((s) => s.angle);
  if (Math.max(...a) < 25) return 'The farthest stack should reach 25 degrees or more, or density is not resolved.';
  const okWavelet = (w) => w && Array.isArray(w.samples) && w.samples.length >= 5 && w.samples.length % 2 === 1;
  if (inv.wavelets != null) {
    if (!Array.isArray(inv.wavelets) || inv.wavelets.length !== st.length || !inv.wavelets.every(okWavelet)) return 'Give one wavelet per stack, each with an odd number of samples, at least five.';
  } else if (!okWavelet(inv.wavelet)) return 'The wavelet needs an odd number of samples, at least five.';
  const wells = inv.wells;
  if (!Array.isArray(wells) || !wells.length) return 'The inversion needs at least one well with AI, SI and density.';
  for (const x of wells) {
    if (!x?.name || !Number.isInteger(x.il) || !Number.isInteger(x.xl)) return 'Each well needs a name and its inline and crossline index.';
    for (const pr of PRESTACK_PARAMS) if (!Array.isArray(x[pr.log]) || !x[pr.log].some((v) => fin(v))) return `Well ${x.name} has no ${pr.label} log in time.`;
  }
  if (p.mode === 'blind' && wells.length < 2) return 'A blind-well check needs at least two wells.';
  if (inv.eps != null && !(Array.isArray(inv.eps) && inv.eps.length === 3 && inv.eps.every((e) => e >= 0))) return 'Give three regularisation weights, zero or positive.';
  if (inv.blind_wavelets != null) {
    if (!Array.isArray(inv.blind_wavelets)) return 'The blind wavelets must be a list.';
    for (const bw of inv.blind_wavelets) {
      const list = bw?.wavelets || (bw?.samples ? [bw] : null);
      if (!bw?.name || !list || !list.every(okWavelet) || (bw.wavelets && bw.wavelets.length !== st.length)) return 'Each blind wavelet needs the well name and one wavelet (or one per stack) with an odd number of samples, at least five.';
    }
  }
  if ((inv.horizon_ids || []).length > 6) return 'Use at most 6 horizons.';
  return null;
}

/** The wells' mean Vs/Vp (SI / AI) over their live samples: the background ratio of the linearisation. */
export function meanVsVp(wells) {
  let s = 0; let n = 0;
  for (const w of wells) for (let i = 0; i < w.ln_ai.length; i++) if (fin(w.ln_ai[i]) && fin(w.ln_si[i])) { s += Math.exp(w.ln_si[i] - w.ln_ai[i]); n += 1; }
  return n ? s / n : 0.5;
}

/** The three low-frequency well sets. */
export function prestackLfm(wells, { dtMs, lfmHz, posOf, horizonsAt }) {
  return Object.fromEntries(PRESTACK_PARAMS.map((pr) => [pr.key, lfmWells(wells.map((w) => ({ ...w, ln_ai: w[pr.log] })), { dtMs, lfmHz, posOf, horizonsAt })]));
}

const holdFill = (values) => {
  const out = Float64Array.from(values, (v) => (fin(v) ? v : NaN));
  let first = -1;
  for (let i = 0; i < out.length; i++) if (fin(out[i])) { first = i; break; }
  if (first < 0) return null;
  for (let i = 0; i < first; i++) out[i] = out[first];
  for (let i = first + 1; i < out.length; i++) if (!fin(out[i])) out[i] = out[i - 1];
  return out;
};

/**
 * The least-squares scale that makes the Fatti synthetic of the well logs
 * match the stacks at the wells, over every angle and covered sample.
 * @param {Array<{traces: ArrayLike<number>[], well}>} pairs
 */
export function prestackWaveletScale(pairs, thetaDeg, wavelet, vsVp) {
  let sxy = 0; let sxx = 0; let n = 0;
  const perAngle = Array.isArray(wavelet[0]) || ArrayBuffer.isView(wavelet[0]);
  const half = perAngle ? Math.max(...wavelet.map((w) => (w.length - 1) / 2)) : (wavelet.length - 1) / 2;
  for (const { traces, well } of pairs) {
    const m = { lnAi: holdFill(well.ln_ai), lnSi: holdFill(well.ln_si), lnRho: holdFill(well.ln_rho) };
    if (!m.lnAi || !m.lnSi || !m.lnRho) continue;
    const syn = forwardFatti(m, thetaDeg, wavelet, vsVp);
    const covered = (i) => { for (let j = i - half - 1; j <= i + half + 1; j++) if (!(j >= 0 && j < well.ln_ai.length && fin(well.ln_ai[j]) && fin(well.ln_si[j]) && fin(well.ln_rho[j]))) return false; return true; };
    for (let k = 0; k < traces.length; k++) {
      for (let i = 0; i < traces[k].length; i++) {
        if (isNull(traces[k][i]) || !covered(i)) continue;
        sxy += syn[k][i] * traces[k][i]; sxx += syn[k][i] * syn[k][i]; n += 1;
      }
    }
  }
  if (n < 20 || !(sxx > 0)) throw new Error('The wells overlap too little seismic to scale the wavelet.');
  return { scale: sxy / sxx, samples: n };
}

/**
 * The per-CDP inverter.
 * @returns {(traces: ArrayLike<number>[], il, xl, exclude?) => {lnAi, lnSi, lnRho}} NaN where every stack is null
 */
export function makeCdpInverter({ inv, thetaDeg, wavelet, lfm, posOf, horizonsAt, ns, dtMs, vsVp }) {
  const s = { ...PRESTACK_DEFAULTS, ...inv };
  const grid = { t0Ms: 0, dtMs, ns };
  return (traces, il, xl, exclude) => {
    const pos = posOf(il, xl); const hz = horizonsAt(il, xl) || undefined;
    const m0 = {
      lnAi: lfmTrace(lfm.ai, { x: pos.x, y: pos.y, horizons: hz }, grid, { exclude }),
      lnSi: lfmTrace(lfm.si, { x: pos.x, y: pos.y, horizons: hz }, grid, { exclude }),
      lnRho: lfmTrace(lfm.rho, { x: pos.x, y: pos.y, horizons: hz }, grid, { exclude }),
    };
    const tr = traces.map((t) => Float64Array.from(t, (v) => (isNull(v) ? NaN : v)));
    const m = simultaneousInversion({ traces: tr, thetaDeg, wavelets: wavelet, vsVp, m0, eps: s.eps, iters: s.iters });
    const dead = (i) => tr.every((t) => !fin(t[i]));
    for (let i = 0; i < ns; i++) if (dead(i)) { m.lnAi[i] = NaN; m.lnSi[i] = NaN; m.lnRho[i] = NaN; }
    return m;
  };
}

/** The four products of one CDP from its ln values. */
export function prestackProducts(m) {
  return [m.lnAi.map(Math.exp), m.lnSi.map(Math.exp), m.lnRho.map(Math.exp), Float64Array.from(m.lnAi, (v, i) => Math.exp(v - m.lnSi[i]))];
}

/**
 * The blind-well table: each well out of all three low-frequency models in
 * turn, its stacks inverted and each parameter scored against its own log
 * after a high cut at truthHz; beside it the same with the well in.
 */
export function prestackBlindTable({ invert, wells, tracesByWell, dtMs, truthHz }) {
  const half = halfWindowFor(truthHz, dtMs);
  return wells.map((w, k) => {
    const truth = Object.fromEntries(PRESTACK_PARAMS.map((pr) => [pr.key, lowPassFinite(w[pr.log], half)]));
    const score = (m) => ({
      ai: blindWellScore(m.lnAi, truth.ai),
      si: blindWellScore(m.lnSi, truth.si),
      rho: blindWellScore(m.lnRho, truth.rho),
    });
    return { name: w.name, blind: score(invert(tracesByWell[k], w.il, w.xl, w.name)), withWell: score(invert(tracesByWell[k], w.il, w.xl)) };
  });
}

// ---------------------------------------------------------------------------
// Truly blind wells (QI upgrade P1.2, 2026-10-15): a held-back well is out of
// all three low-frequency models, the wavelet scale, the background Vs/Vp of
// the linearisation (unless it was typed) and, when the browser sends them,
// the wavelet averages (the field tie wavelet or the angle wavelets) of the
// other wells. The with-well column is the full inversion, as before.

export const PRESTACK_BLIND_PROTOCOL = 'held-back-v2';

/**
 * The inverter for the blind check and the volume (as post-stack's
 * makeBlindInverter): no well named is the full inversion; a named well is
 * rebuilt without it. Keeps each held-back estimate (ln AI, ln SI, ln rho).
 * @returns {{invert, scale, vsVp, protocol, heldBack: Array<{name, scale, vs_vp}>, blindTraces: Map<string, {lnAi, lnSi, lnRho}>}}
 */
export function makeBlindCdpInverter({ inv, thetaDeg, wavelet, onGrid = (x) => Float64Array.from(x), wells, tracesByWell, posOf, horizonsAt, ns, dtMs }) {
  const s = { ...PRESTACK_DEFAULTS, ...inv };
  const lfm = prestackLfm(wells, { dtMs, lfmHz: s.lfmHz, posOf, horizonsAt });
  const perStack = Array.isArray(wavelet[0]) || ArrayBuffer.isView(wavelet[0]);
  const blindW = new Map();
  for (const bw of inv.blind_wavelets || []) {
    const w = bw.wavelets ? bw.wavelets.map((x) => onGrid(x.samples, x.dt_ms)) : onGrid(bw.samples, bw.dt_ms);
    // a blind wavelet is used only where it matches the wavelet in use (one, or one per stack)
    if (Array.isArray(w) === perStack) blindW.set(bw.name, w);
  }
  const typedVsVp = fin(inv.vs_vp) ? inv.vs_vp : null;
  const notes = [];
  const build = (exclude) => {
    const keep = wells.map((w, k) => k).filter((k) => wells[k].name !== exclude);
    const vsVp = typedVsVp ?? meanVsVp(keep.map((k) => wells[k]));
    const w0 = (exclude && blindW.get(exclude)) || wavelet;
    const scale = prestackWaveletScale(keep.map((k) => ({ well: wells[k], traces: tracesByWell[k] })), thetaDeg, w0, vsVp).scale;
    const scaled = Array.isArray(w0) ? w0.map((w) => w.map((v) => v * scale)) : w0.map((v) => v * scale);
    return { scale, vsVp, invert: makeCdpInverter({ inv: s, thetaDeg, wavelet: scaled, lfm, posOf, horizonsAt, ns, dtMs, vsVp }) };
  };
  const full = build(null);
  const held = new Map();
  const heldBack = [];
  const blindTraces = new Map();
  const heldFor = (name) => {
    if (!held.has(name)) {
      let b = null;
      try { b = build(name); } catch (e) { notes.push(`${name}: ${e.message} Its blind row is empty.`); }
      held.set(name, b);
      if (b) heldBack.push({ name, scale: b.scale, vs_vp: b.vsVp });
    }
    return held.get(name);
  };
  const dead = () => ({ lnAi: new Float64Array(ns).fill(NaN), lnSi: new Float64Array(ns).fill(NaN), lnRho: new Float64Array(ns).fill(NaN) });
  const invert = (traces, il, xl, exclude) => {
    if (!exclude) return full.invert(traces, il, xl);
    const b = heldFor(exclude);
    const m = b ? b.invert(traces, il, xl, exclude) : dead();
    blindTraces.set(exclude, m);
    return m;
  };
  const excluded = ['the three low-frequency models', 'the wavelet scale'];
  if (typedVsVp == null) excluded.push('the background Vs/Vp');
  if (blindW.size) excluded.push(perStack ? 'the angle wavelet averages' : 'the field wavelet average');
  const waveletWell = typeof inv.wavelet_well === 'string' && inv.wavelet_well ? inv.wavelet_well : null;
  const protocol = { version: PRESTACK_BLIND_PROTOCOL, excluded_from: excluded, notes, ...(waveletWell ? { wavelet_from_well: waveletWell } : {}) };
  return { invert, scale: full.scale, vsVp: full.vsVp, protocol, heldBack, blindTraces };
}

/**
 * Issues for the register from a simultaneous blind-well table (closes
 * QI-UPGRADE U2-008). AI and SI: a blind error over 10 percent is medium,
 * over 20 high. Density: a blind correlation under 0.5 is medium (density is
 * weakly resolved here; read the density volume with care), and a density
 * error over 10 percent is low.
 */
export function simultaneousIssues(blind, name = 'the stacks') {
  const out = [];
  const add = (key, severity, title, detail, remedy) => out.push({ key: `simultaneous:${name}:${key}`, area: 'Simultaneous inversion', severity, title, detail, remedy });
  for (const r of blind || []) {
    for (const [k, label] of [['ai', 'AI'], ['si', 'SI']]) {
      const e = r.blind?.[k]?.rmsPct;
      if (fin(e) && e > 10) add(`${r.name}:${k}`, e > 20 ? 'high' : 'medium', `${r.name}: blind ${label} error ${e.toFixed(1)} percent`, `Simultaneous inversion of ${name}, the well held back.`, 'Check the tie and the wavelet scale at this well, the stacks\' alignment (match the stacks), and the horizons the models follow.');
    }
    const rc = r.blind?.rho?.corr; const re = r.blind?.rho?.rmsPct;
    if (fin(rc) && rc < 0.5) add(`${r.name}:rho-corr`, 'medium', `${r.name}: density does not follow the well`, `Blind density correlation ${rc.toFixed(2)} on ${name}.`, 'Treat the density volume as unresolved here: use AI and Vp/Vs, or add far-angle data.');
    else if (fin(re) && re > 10) add(`${r.name}:rho-err`, 'low', `${r.name}: blind density error ${re.toFixed(1)} percent`, `Simultaneous inversion of ${name}.`, 'Read density away from the wells with its uncertainty.');
  }
  return out;
}
