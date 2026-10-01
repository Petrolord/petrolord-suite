// Angle-gather glue (U2-003, 2026-10-01): the zone, a pad of rock above and
// below it, and the workstation's two cases (in situ and fluid substituted,
// the same merged logs Publish writes) through the engines' angleGather.
// The wavelet is a Ricker the user sets, or the wavelet Seismolord measured
// at this well when the tie was committed (its stored peak frequency and
// constant phase; Seismolord stores those two numbers, not the samples, so
// it is rebuilt as a phase-rotated Ricker and labelled so). Pure.

import {
  angleGather, pickEvent, fitInterceptGradient, phaseRotatedRicker, GATHER_METHODS,
} from '../engine/gather';
import { shuey } from '../engine/avo';
import { meanAt } from './prep';

export const DEFAULT_GATHER = Object.freeze({
  padM: 40, maxAngle: 40, angleStep: 5, method: 'zoeppritz', dtMs: 2, wavelet: 'ricker', freqHz: 25, phaseDeg: 0,
});
export { GATHER_METHODS };

const clampNum = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** A saved or half-typed gather config, made safe to run. */
export function gatherConfig(cfg = {}) {
  const c = { ...DEFAULT_GATHER, ...(cfg || {}) };
  return {
    padM: clampNum(c.padM, 0, 2000, DEFAULT_GATHER.padM),
    maxAngle: clampNum(c.maxAngle, 5, 60, DEFAULT_GATHER.maxAngle),
    angleStep: clampNum(c.angleStep, 1, 30, DEFAULT_GATHER.angleStep),
    method: GATHER_METHODS.includes(c.method) ? c.method : DEFAULT_GATHER.method,
    dtMs: clampNum(c.dtMs, 0.5, 8, DEFAULT_GATHER.dtMs),
    wavelet: c.wavelet === 'tie' ? 'tie' : 'ricker',
    freqHz: clampNum(c.freqHz, 5, 120, DEFAULT_GATHER.freqHz),
    phaseDeg: clampNum(c.phaseDeg, -180, 180, 0),
  };
}

/**
 * The wavelet Seismolord stored with this well's committed tie
 * (geo_wells.checkshots_derived.provenance.qc.wavelet, Seismolord U2-013).
 * @returns {?{kind: string, peakHz: number, phaseDeg: number, measuredAt: ?string}}
 */
export function tieWavelet(well) {
  const qc = well?.checkshots_derived?.provenance?.qc;
  const w = qc?.wavelet;
  if (!w || !(Number(w.peak_hz) > 0)) return null;
  return {
    kind: String(w.kind || 'tie'),
    peakHz: Number(w.peak_hz),
    phaseDeg: Number.isFinite(Number(w.phase_deg)) ? Number(w.phase_deg) : 0,
    measuredAt: qc.measured_at || null,
  };
}

/** The wavelet the gather will use, and the words that describe it. */
export function waveletFor(cfg, well) {
  const c = gatherConfig(cfg);
  const tie = c.wavelet === 'tie' ? tieWavelet(well) : null;
  const freqHz = tie ? tie.peakHz : c.freqHz;
  const phaseDeg = tie ? tie.phaseDeg : c.phaseDeg;
  const half = Math.min(120, Math.max(40, Math.round(2000 / freqHz)));
  return {
    samples: phaseRotatedRicker(freqHz, c.dtMs, phaseDeg, half),
    source: tie ? 'tie' : 'ricker',
    freqHz,
    phaseDeg,
    label: tie
      ? `Seismolord tie wavelet (${tie.kind}, peak ${freqHz.toFixed(1)} Hz, phase ${phaseDeg.toFixed(0)} deg; rebuilt as a phase-rotated Ricker from the stored tie record)`
      : `Ricker ${freqHz} Hz${phaseDeg ? `, phase ${phaseDeg} deg` : ', zero phase'}`,
    fellBack: c.wavelet === 'tie' && !tie,
  };
}

export const gatherAngles = (cfg) => {
  const c = gatherConfig(cfg);
  const out = [];
  for (let a = 0; a <= c.maxAngle + 1e-9; a += c.angleStep) out.push(Number(a.toFixed(6)));
  return out;
};

const firstAtOrBelow = (depthT, md) => {
  for (let k = 0; k < depthT.length; k++) if (depthT[k] >= md - 1e-9) return k;
  return depthT.length - 1;
};

function interfaceAb(vp, vs, rho, depth, md, windowM) {
  const up = []; const lo = [];
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] >= md - windowM && depth[i] < md) up.push(i);
    else if (depth[i] > md && depth[i] <= md + windowM) lo.push(i);
  }
  const u = [meanAt(vp, up), meanAt(vs, up), meanAt(rho, up)];
  const l = [meanAt(vp, lo), meanAt(vs, lo), meanAt(rho, lo)];
  if (![...u, ...l].every(Number.isFinite)) return null;
  try { const { a, b } = shuey(...u, ...l, 0); return { a, b }; } catch { return null; }
}

function oneCase(model, logs, zone, c, wavelet, angles) {
  const from = zone.top_md_m - c.padM;
  const to = zone.base_md_m + c.padM;
  const win = { depth: [], vp: [], vs: [], rho: [] };
  for (let i = 0; i < model.depth.length; i++) {
    if (model.depth[i] < from || model.depth[i] > to) continue;
    win.depth.push(model.depth[i]); win.vp.push(logs.vp[i]); win.vs.push(logs.vs[i]); win.rho.push(logs.rho[i]);
  }
  const g = angleGather(win, { angles, dtMs: c.dtMs, wavelet: wavelet.samples, method: c.method });
  const topSample = firstAtOrBelow(g.depth, zone.top_md_m);
  const baseSample = firstAtOrBelow(g.depth, zone.base_md_m);
  // the amplitude at the event time (one sample either side, because the
  // interface falls between two time samples): a wider search would jump
  // to the base reflection when the zone is near tuning
  const picks = pickEvent(g.traces, topSample, 1);
  let fit = null;
  try { fit = fitInterceptGradient(angles, picks, { maxAngle: Math.min(30, c.maxAngle) }); } catch { fit = null; }
  return {
    traces: g.traces,
    tMs: g.tMs,
    depth: g.depth,
    postCritical: g.postCritical,
    dropped: g.dropped,
    topSample,
    baseSample,
    picks,
    fit,
    interface: interfaceAb(logs.vp, logs.vs, logs.rho, model.depth, zone.top_md_m, Math.min(10, Math.max(c.padM, 1))),
  };
}

/**
 * The zone's angle gather, in situ and substituted.
 * @param {Object} model SI well model
 * @param {{name: string, top_md_m: number, base_md_m: number}} zone
 * @param {{vp, vs, rho}} merged the published case over the whole well (zoneResult.merged)
 * @param {Object} cfg gather settings (DEFAULT_GATHER shape)
 * @param {Object} [well] the registry well row (for the tie wavelet)
 * @returns {{error: string} | {angles, dtMs, method, wavelet, inSitu, substituted, gain: number, notes: string[]}}
 */
export function zoneGather(model, zone, merged, cfg, well = null) {
  if (!model || !zone) return { error: 'Pick a well and a zone.' };
  const c = gatherConfig(cfg);
  const angles = gatherAngles(c);
  const wavelet = waveletFor(c, well);
  try {
    const inSitu = oneCase(model, model, zone, c, wavelet, angles);
    const substituted = merged ? oneCase(model, merged, zone, c, wavelet, angles) : null;
    let gain = 0;
    for (const side of [inSitu, substituted]) {
      if (!side) continue;
      for (const tr of side.traces) for (let i = 0; i < tr.length; i++) gain = Math.max(gain, Math.abs(tr[i]));
    }
    const notes = [];
    if (wavelet.fellBack) notes.push('No tie wavelet is stored on this well (commit a tie in Seismolord first), so the Ricker is used.');
    if (inSitu.dropped) notes.push(`${inSitu.dropped} sample${inSitu.dropped === 1 ? '' : 's'} with a gap in Vp, Vs or density left out of the window.`);
    const past = Math.max(...inSitu.postCritical, ...(substituted ? substituted.postCritical : [0]));
    if (past > 0) notes.push(c.method === 'zoeppritz'
      ? 'Some interfaces are past the critical angle at the far angles: the real part of the exact coefficient is drawn there.'
      : 'Some interfaces are past the critical angle at the far angles: Aki-Richards is undefined there and contributes nothing.');
    if (model.vsSource === 'estimated') notes.push('Vs is estimated, so the change of amplitude with angle rests on the Greenberg-Castagna line.');
    if (model.vpSource === 'estimated') notes.push('Vp is estimated (no sonic log): the gather is indicative only.');
    return { angles, dtMs: c.dtMs, method: c.method, wavelet, inSitu, substituted, gain, notes, config: c };
  } catch (e) {
    return { error: e.message };
  }
}
