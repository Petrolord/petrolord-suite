// Chart data for the results view (Earth Modeling 3D grid upgrade,
// 2026-10-17): the histograms of the well logs, the upscaled cells and the
// model; the phi-k crossplot by facies; the volumes of each zone; the STOIIP
// tornado; and the probability curve of the volume distribution. Pure, no
// React; the charts read these shapes.

import { isNull } from '@/lib/gridding/gridmath';
import { layeredVolumes } from '../modelBuild';
import { cellLayers } from './scene';

const finite = (v) => Number.isFinite(v) && !isNull(v);

/**
 * Histograms of one property in one zone (or every zone when zoneIdx < 0):
 * the raw log samples, the upscaled well cells and the model cells, each as
 * a percentage of its own count in common bins.
 * @returns {{bins: Array<{x, lo, hi, logs, upscaled, model}>, counts: {logs, upscaled, model}, means: {logs, upscaled, model}}|null}
 */
export function histogramData(built, prop, zoneIdx = -1, nBins = 20) {
  const zones = (built?.zones || []).map((z, i) => ({ z, i })).filter(({ i }) => zoneIdx < 0 || i === zoneIdx);
  const logs = []; const ups = []; const model = [];
  const tr = prop === 'perm' ? (v) => Math.log10(Math.max(v, 1e-3)) : (v) => v;
  for (const { z, i } of zones) {
    if (z.kind === 'cap' && zoneIdx < 0) continue; // the seal would swamp the reservoir's histograms
    for (const v of z.logSamples?.[prop] || []) if (finite(v)) logs.push(tr(v));
    for (const r of z.logRows || []) if (finite(r[prop])) ups.push(tr(r[prop]));
    const frames = z.layers?.length ? z.layers : [{ props: z.props, thickness: built.thickness[i] }];
    for (const L of frames) {
      const g = L.props?.[prop];
      if (!g) continue;
      const step = Math.max(1, Math.floor(g.length * frames.length / 60000));
      for (let j = 0; j < g.length; j += step) if (finite(g[j]) && !isNull(L.thickness?.[j] ?? 0) && (L.thickness?.[j] ?? 1) > 0) model.push(tr(g[j]));
    }
  }
  if (!logs.length && !ups.length && !model.length) return null;
  const all = [...logs, ...ups, ...model];
  let lo = Infinity; let hi = -Infinity;
  for (const v of all) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) hi = lo + 1e-3;
  const w = (hi - lo) / nBins;
  const count = (xs) => { const c = new Array(nBins).fill(0); for (const v of xs) c[Math.min(nBins - 1, Math.max(0, Math.floor((v - lo) / w)))] += 1; return c; };
  const cl = count(logs); const cu = count(ups); const cm = count(model);
  const pct = (c, n) => (n ? (100 * c) / n : null);
  const back = prop === 'perm' ? (v) => 10 ** v : (v) => v;
  const bins = cl.map((_, b) => ({
    x: back(lo + (b + 0.5) * w), lo: back(lo + b * w), hi: back(lo + (b + 1) * w),
    logs: pct(cl[b], logs.length), upscaled: pct(cu[b], ups.length), model: pct(cm[b], model.length),
  }));
  const mean = (xs) => (xs.length ? back(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return { bins, counts: { logs: logs.length, upscaled: ups.length, model: model.length }, means: { logs: mean(logs), upscaled: mean(ups), model: mean(model) }, log: prop === 'perm' };
}

/**
 * The phi-k crossplot: the upscaled well cells and a sample of model cells,
 * each with its facies code (null where the zone has no facies).
 */
export function crossplotData(built, maxModel = 2500) {
  const wells = []; const model = [];
  // the cap is seal rock: its typed permeability would sit off the chart
  (built?.zones || []).forEach((z) => {
    if (z.kind === 'cap') return;
    for (const r of z.logRows || []) if (finite(r.phi) && finite(r.perm) && r.perm > 0) wells.push({ phi: r.phi, perm: r.perm, facies: r.facies ?? null, well: r.well, zone: z.name });
  });
  const layers = cellLayers(built).filter((L) => built.zones[L.zone]?.kind !== 'cap');
  let total = 0;
  for (const L of layers) if (L.props.phi && L.props.perm) total += L.props.phi.length;
  const step = Math.max(1, Math.floor(total / maxModel));
  let n = 0;
  for (const L of layers) {
    const { phi, perm, facies } = L.props;
    if (!phi || !perm) continue;
    for (let j = 0; j < phi.length; j++, n++) {
      if (n % step) continue;
      if (!finite(phi[j]) || !finite(perm[j]) || perm[j] <= 0 || isNull(L.top[j])) continue;
      model.push({ phi: phi[j], perm: perm[j], facies: facies && facies[j] !== 255 ? facies[j] : null, zone: built.zones[L.zone].name });
    }
  }
  return { wells, model };
}

/** Volumes of each zone (in-place in m3 at surface conditions where FVFs are given). */
export function volumesByZone(built) {
  return (built?.zones || []).map((z) => {
    const t = z.volumes?.total || {};
    return { zone: z.name, kind: z.kind, stoiip_m3: t.stoiip_m3 ?? null, giip_m3: t.giip_m3 ?? null, hcpv_m3: t.hcpv_m3 ?? 0, hc_bulk_m3: t.hc_bulk_m3 ?? null, bulk_m3: t.bulk_m3 ?? 0 };
  });
}

const shiftContact = (c, d) => {
  if (c === null || c === undefined) return c;
  if (typeof c === 'number') return c + d;
  return Float64Array.from(c, (v) => (Number.isFinite(v) && v > -1e11 && v < 1e11 ? v + d : v));
};

/** The model's STOIIP with every contact moved by d metres (deeper positive), summed over the zones. */
export function stoiipWithContactShift(built, d) {
  const spec = built.specM || built.spec;
  let s = 0;
  built.zones.forEach((z, i) => {
    const f = z.mc?.fluids;
    if (!z.mc?.hasFluids || !f) { s += z.volumes?.total?.stoiip_m3 || 0; return; }
    const fl = { ...f, owc: shiftContact(f.owc, d), goc: shiftContact(f.goc, d) };
    const v = layeredVolumes(spec, z, z.labels || built.labels || null, fl, built.clamped[i], built.clamped[i + 1], { useContacts: true }).total;
    s += v?.stoiip_m3 || 0;
  });
  return s;
}

/**
 * The STOIIP tornado: each input moved low and high alone, the others at
 * their model values. Contacts move by +- contactM (metres); porosity, NTG,
 * Sw and the rock volume above the contacts by +- pct percent. STOIIP is
 * linear in porosity, NTG and GRV; with Sw scaled by f it is
 * S0 (1 - (f - 1) Sw / (1 - Sw)), Sw the pore-volume weighted Sw of each
 * zone's leg. The contact case is a rerun of the volumes.
 * @returns {{base: number, bars: Array<{key, label, low, high, lowText, highText}>}|null}
 */
export function tornadoData(built, { contactM = 30 * 0.3048, pct = 10 } = {}) {
  const zones = built?.zones || [];
  const base = zones.reduce((a, z) => a + (z.volumes?.total?.stoiip_m3 || 0), 0);
  if (!(base > 0)) return null;
  const f = pct / 100;
  // Sw: per zone, through its leg's pore-volume weighted Sw
  const swCase = (k) => zones.reduce((a, z) => {
    const s0 = z.volumes?.total?.stoiip_m3 || 0;
    const sw = z.hcAverages?.sw;
    if (!(s0 > 0) || !Number.isFinite(sw) || sw >= 1) return a + s0;
    return a + Math.max(0, s0 * (1 - (k - 1) * (sw / (1 - sw))));
  }, 0);
  const bars = [
    { key: 'contact', label: 'Contact', low: stoiipWithContactShift(built, -contactM), high: stoiipWithContactShift(built, contactM), range: contactM },
    { key: 'grv', label: 'GRV', low: base * (1 - f), high: base * (1 + f) },
    { key: 'phi', label: 'Porosity', low: base * (1 - f), high: base * (1 + f) },
    { key: 'ntg', label: 'NTG', low: base * (1 - f), high: base * (1 + f) },
    // a higher Sw is the low case
    { key: 'sw', label: 'Sw', low: swCase(1 + f), high: swCase(1 - f) },
  ];
  for (const b of bars) { if (b.low > b.high) { const t = b.low; b.low = b.high; b.high = t; } b.swing = b.high - b.low; }
  bars.sort((a, b) => b.swing - a.swing);
  return { base, bars, pct, contactM };
}

/**
 * The probability (exceedance) curve of the volume distribution's totals:
 * for each value, the chance the field holds at least that much. P90, P50
 * and P10 sit at 90, 50 and 10 percent.
 */
export function exceedanceCurve(samples) {
  const xs = (samples || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return null;
  const step = Math.max(1, Math.floor(n / 200));
  const pts = [];
  for (let i = 0; i < n; i += step) pts.push({ v: xs[i], p: 100 * (1 - i / n) });
  pts.push({ v: xs[n - 1], p: 100 / n });
  const q = (p) => xs[Math.min(n - 1, Math.max(0, Math.floor(p * n)))];
  return { points: pts, p90: q(0.1), p50: q(0.5), p10: q(0.9), n };
}
