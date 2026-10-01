// Petrophysics porosity and TOC as Basin inputs (AppUpgrade BF-U2-007).
// A model tied to a registry well can read that well's porosity curve (PHIT
// or PHIE, as Petrophysics Studio publishes them) and a TOC curve, average
// them over each layer's present-day interval, compare the porosity with
// the model's Athy porosity, and offer two edits the modeller applies:
//
//  - compaction: the layer's surface porosity scaled so the model's mean
//    porosity over the logged interval equals the log's (Athy porosity is
//    linear in the surface porosity at a fixed depth; the coefficient is
//    kept). Total porosity (PHIT) is the compaction porosity; an effective
//    porosity (PHIE) reads low in shales, and that is said.
//  - source rock: the layer's mean TOC. A log TOC is the present-day value;
//    the engine takes the original TOC, so a mature source rock needs a
//    higher number (said).
//
// Depths: curves are on registry MD; the model's depth is vertical below
// its surface, so MD goes through the well's survey to TVD and the model
// surface's TVD is subtracted (the layer provenance carries it). Units are
// read from the curve: v/v or percent for porosity, wt % or a weight
// fraction for TOC; anything else is refused with the reason. Vendor nulls
// (-999, -999.25) and non-finite samples are dropped. Pure.

import { BurialCompactionEngine } from './BurialCompactionEngine';

const up = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const FRACTION_UNITS = new Set(['V/V', 'FRAC', 'FRACTION', 'DEC', 'DECIMAL', 'M3/M3', 'CFCF', 'W/W', 'G/G', 'KG/KG']);
const PERCENT_UNITS = new Set(['%', 'PU', 'PCT', 'PERCENT', 'WT%', 'WT.%', 'WTPCT', 'P.U.']);
const base = (m) => up(m).split(':')[0];

/** The porosity and TOC curves to read from a well's logs (latest wins; PHIT before PHIE). */
export function pickPetroCurves(logs) {
  let phit = null; let phie = null; let toc = null;
  for (const log of logs || []) {
    const m = base(log.mnemonic);
    if (m === 'PHIT') phit = log;
    else if (m === 'PHIE') phie = log;
    else if (m === 'TOC') toc = log;
  }
  const porosity = phit || phie;
  const notes = [];
  if (porosity && !phit) notes.push('Only PHIE (effective porosity) is published for this well: it reads below total porosity in shales, so a shale layer fitted to it compacts too tight. Publish PHIT in Petrophysics Studio for compaction.');
  return { porosity, toc, notes };
}

/** A curve's values as fractions (porosity) or wt % (TOC), by its declared unit. */
export function readCurve(log, values, kind) {
  const u = up(log?.unit);
  const clean = Array.from(values || [], (v) => (Number.isFinite(v) && v > -900 ? v : NaN));
  const finite = clean.filter(Number.isFinite);
  if (!finite.length) return { ok: false, reason: `${log?.mnemonic || 'The curve'} has no values.` };
  let scale = null; let said = '';
  if (FRACTION_UNITS.has(u)) scale = kind === 'toc' ? 100 : 1;
  else if (PERCENT_UNITS.has(u)) scale = kind === 'toc' ? 1 : 0.01;
  else if (u === '') {
    const med = finite.slice().sort((a, b) => a - b)[Math.floor(finite.length / 2)];
    if (kind === 'toc') { scale = 1; said = `${log.mnemonic} has no unit; read as wt %.`; } else { scale = med > 1 ? 0.01 : 1; said = `${log.mnemonic} has no unit; read as ${med > 1 ? 'percent' : 'a fraction'} from its values.`; }
  } else return { ok: false, reason: `${log.mnemonic} is in ${log.unit}, which is not ${kind === 'toc' ? 'wt % or a weight fraction' : 'a fraction or percent'}, so it was not read.` };
  const out = clean.map((v) => (Number.isFinite(v) ? v * scale : NaN));
  const hi = kind === 'toc' ? 100 : 1;
  const bad = out.filter((v) => Number.isFinite(v) && (v < 0 || v > hi)).length;
  return { ok: true, values: out.map((v) => (Number.isFinite(v) && v >= 0 && v <= hi ? v : NaN)), unit: kind === 'toc' ? 'wt %' : 'v/v', note: [said, bad ? `${bad} sample${bad === 1 ? '' : 's'} outside 0 to ${hi} dropped.` : ''].filter(Boolean).join(' ') };
}

/** Samples at model depth (m below the model surface). */
export function toModelDepth(log, values, { tvdOf = (md) => md, topTvdM = 0 } = {}) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const md = Number(log.start_md_m) + i * Number(log.step_m);
    const z = tvdOf(md) - topTvdM;
    if (Number.isFinite(z) && z >= 0) out.push({ z, v });
  }
  return out;
}

/**
 * Present-day layer intervals in model depth (youngest first, as the model
 * lists them). A layer built from a registry well carries the TVD of its
 * top and base, and those are used (minus the model surface) so a log
 * sample lands in the layer its top says; other layers stack by thickness.
 */
export function layerIntervals(stratigraphy) {
  const order = [...(stratigraphy || [])].sort((a, b) => (Number(a.ageStart) || 0) - (Number(b.ageStart) || 0));
  const tvd = order.every((l) => Number.isFinite(l.provenance?.top_tvd_m) && Number.isFinite(l.provenance?.base_tvd_m));
  if (tvd) {
    const top0 = Math.min(...order.map((l) => l.provenance.top_tvd_m));
    return order.map((l) => ({ layer: l, top: l.provenance.top_tvd_m - top0, base: l.provenance.base_tvd_m - top0 }));
  }
  let z = 0;
  return order.map((l) => { const top = z; z += Number(l.thickness) || 0; return { layer: l, top, base: z }; });
}

const meanIn = (samples, top, baseZ) => {
  let s = 0; let n = 0;
  for (const p of samples) if (p.z >= top && p.z < baseZ) { s += p.v; n += 1; }
  return { mean: n ? s / n : NaN, n };
};

/**
 * Log porosity against the model's Athy porosity, layer by layer, with the
 * surface porosity that would match the log (coefficient kept).
 * @returns {Array<{id, name, n, coverage, logPhi, modelPhi, phi0, c, phi0Fit, usable, why}>}
 */
export function porosityByLayer(samples, stratigraphy, { minSamples = 5 } = {}) {
  return layerIntervals(stratigraphy).map(({ layer, top, base: bz }) => {
    const inside = samples.filter((p) => p.z >= top && p.z < bz);
    const { phi0, c } = BurialCompactionEngine.resolveParams(layer);
    const n = inside.length;
    const logPhi = n ? inside.reduce((a, p) => a + p.v, 0) / n : NaN;
    // the model's porosity at the same depths the log was sampled
    const shape = n ? inside.reduce((a, p) => a + Math.exp(-c * p.z), 0) / n : NaN;
    const modelPhi = phi0 * shape;
    const fit = shape > 0 ? logPhi / shape : NaN;
    const span = n ? Math.max(...inside.map((p) => p.z)) - Math.min(...inside.map((p) => p.z)) : 0;
    const coverage = bz > top ? Math.min(1, span / (bz - top)) : 0;
    let why = '';
    if (n < minSamples) why = n ? `only ${n} samples` : 'no log here';
    else if (!(fit > 0.01 && fit < 0.9)) why = `the log would need a surface porosity of ${Number.isFinite(fit) ? fit.toFixed(2) : 'no value'}, outside 0.01 to 0.9`;
    return { id: layer.id, name: layer.name, n, coverage, logPhi, modelPhi, phi0, c, phi0Fit: fit, usable: !why, why };
  });
}

/** Mean TOC (wt %) of each layer from the log. */
export function tocByLayer(samples, stratigraphy, { minSamples = 3 } = {}) {
  return layerIntervals(stratigraphy).map(({ layer, top, base: bz }) => {
    const { mean, n } = meanIn(samples, top, bz);
    return { id: layer.id, name: layer.name, n, toc: mean, current: layer.sourceRock?.isSource ? Number(layer.sourceRock.toc) : null, isSource: !!layer.sourceRock?.isSource, usable: n >= minSamples && mean > 0 };
  });
}

/** The stratigraphy with the fitted surface porosities applied (usable layers only). */
export function applyPorosityFit(stratigraphy, rows) {
  const by = new Map(rows.filter((r) => r.usable).map((r) => [r.id, r]));
  return (stratigraphy || []).map((l) => {
    const r = by.get(l.id);
    if (!r) return l;
    return { ...l, compaction: { model: 'exponential', ...(l.compaction || {}), phi0: Number(r.phi0Fit.toFixed(4)), c: r.c }, provenance: { ...(l.provenance || {}), phi0_from_log: true } };
  });
}

/** The stratigraphy with the log TOC on its source layers (usable rows only). */
export function applyToc(stratigraphy, rows) {
  const by = new Map(rows.filter((r) => r.usable && r.isSource).map((r) => [r.id, r]));
  return (stratigraphy || []).map((l) => {
    const r = by.get(l.id);
    if (!r) return l;
    return { ...l, sourceRock: { ...l.sourceRock, toc: Number(r.toc.toFixed(2)) }, provenance: { ...(l.provenance || {}), toc_from_log: true } };
  });
}
