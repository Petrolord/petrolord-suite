// Well logs upscaled to the model's zones and layers (Earth Modeling, Ekene
// walk 2026-10-14). A published Petrophysics zone gives ONE pay average per
// well: porosity and Sw are null in a well with no pay (Ekene-2 and Ekene-4
// sit below the contact), so a zone could only be populated from two wells
// and kriging fell back to a constant. Here the model reads the wells'
// computed curves (PHIE, SW, VSH and the permeability, as Petrophysics
// Studio published them) and averages them over each zone, or each layer of
// a zone, at every well:
//
//   gross    the layer interval at the well (true vertical thickness)
//   net      samples with VSH <= the Vsh cutoff and PHIE >= the porosity
//            cutoff (rock cutoffs only: water is cut by the contact)
//   NTG      net / gross, by true vertical thickness
//   phi      PHIE averaged over the net samples (thickness weighted)
//   Sw       SW averaged over the net samples above the OWC, pore-volume
//            weighted (sum h phi Sw / sum h phi); none when the well has
//            no net rock above the contact, because Sw below it is water
//   perm     the geometric mean of the permeability over the net samples
//
// Layers are proportional: layer k of n spans the fraction k/n to (k+1)/n of
// the zone between its top and base, at the well in true vertical depth and
// in the model between the two surfaces. Each sample counts with the true
// vertical thickness it stands for, so a deviated well weighs the same as a
// vertical one. Pure, no I/O: the workstation fetches the curves and passes
// them in plain arrays (the build runs on a worker).

import { minCurvature, positionAtMd } from '../engine/wellties';

/** The curves the model reads, by mnemonic, latest row of each first. */
export const LOG_KEYS = Object.freeze({
  phi: ['PHIE'],
  sw: ['SW', 'SWE'],
  vsh: ['VSH', 'VCL'],
  perm: ['KPERM', 'PERM', 'K'],
});

/** Default net reservoir cutoffs (Petrophysics Studio's own defaults). */
export const DEFAULT_CUTOFFS = Object.freeze({ vsh: 0.5, phi: 0.08 });

const NULLISH = (v) => !Number.isFinite(v) || v <= -999 || v >= 1e29;

/**
 * Pick the rows to read from a well's log list (geo_wells_logs rows, oldest
 * first): for each key the LAST row whose mnemonic matches, so a republished
 * curve wins.
 * @returns {Object<string, object>} key -> log row
 */
export function pickLogRows(logs = []) {
  const out = {};
  for (const [key, names] of Object.entries(LOG_KEYS)) {
    for (const row of logs) if (names.includes(String(row.mnemonic || '').toUpperCase())) out[key] = row;
  }
  return out;
}

/** A curve row plus its samples as the plain shape upscaling reads (porosity and Sw in % become fractions). */
export const curveOf = (row, values) => {
  const unit = String(row.unit || '').trim();
  const pct = /^(%|pu|p\.u\.)$/i.test(unit) && !/PERM|^K$/i.test(String(row.mnemonic || ''));
  return {
    start: Number(row.start_md_m), step: Number(row.step_m),
    values: Array.from(values, (v) => (pct && Number.isFinite(v) && v > -999 ? v / 100 : v)),
    unit: pct ? 'v/v' : unit, mnemonic: row.mnemonic,
  };
};

/**
 * The curves of every well that has PHIE and VSH, read through the backend
 * (listLogs, downloadCurve). `cache` (a Map) keeps downloads between builds.
 * @returns {Promise<{curves: Object<string, object>, wells: string[], missing: string[]}>}
 */
export async function resolveLogCurves(wells, backend, cache = new Map()) {
  const curves = {}; const used = []; const missing = [];
  if (!backend?.listLogs || !backend?.downloadCurve) return { curves, wells: used, missing: (wells || []).map((w) => w.name) };
  for (const w of wells || []) {
    let rows;
    try { rows = pickLogRows(await backend.listLogs(w.id)); } catch { missing.push(w.name); continue; }
    if (!rows.phi || !rows.vsh) { missing.push(w.name); continue; }
    const c = {};
    for (const [key, row] of Object.entries(rows)) {
      const ck = `${w.id}|${row.id || row.storage_path || row.mnemonic}`;
      if (!cache.has(ck)) cache.set(ck, backend.downloadCurve(row).then((v) => curveOf(row, v)).catch((e) => { cache.delete(ck); throw e; }));
      try { c[key] = await cache.get(ck); } catch { /* a curve that cannot be read is left out */ }
    }
    if (c.phi && c.vsh) { curves[w.name] = c; used.push(w.name); } else missing.push(w.name);
  }
  return { curves, wells: used, missing };
}

/**
 * One well, one zone: the upscaled values of each proportional layer.
 * @param {object} p
 * @param {Array<{md,x,y,tvd,tvdss}>} p.traj minimum-curvature trajectory (metres)
 * @param {number} p.topMd @param {number} p.baseMd the zone at the well (MD m)
 * @param {{phi?, sw?, vsh?, perm?}} p.curves curveOf shapes, MD in metres
 * @param {number} [p.layers] proportional layers in the zone (>= 1)
 * @param {{vsh:number, phi:number}} [p.cutoffs]
 * @param {number|null} [p.owcM] the zone OWC at the well, TVDSS m positive down
 * @returns {Array<{layer, x, y, tvdss, grossM, netM, ntg, phi, sw, perm, samples, hcSamples}>}
 */
export function upscaleZoneAtWell({ traj, topMd, baseMd, curves, layers = 1, cutoffs = DEFAULT_CUTOFFS, owcM = null }) {
  const n = Math.max(1, Math.floor(Number(layers) || 1));
  if (!(baseMd > topMd)) return [];
  const path = extendTrajectory(traj, baseMd + 50);
  const top = positionAtMd(path, topMd);
  const base = positionAtMd(path, baseMd);
  const span = base.tvdss - top.tvdss;
  if (!(span > 0)) return [];
  const ref = curves.phi || curves.vsh || curves.sw;
  if (!ref) return [];
  const at = (c, md) => {
    if (!c) return NaN;
    const i = Math.round((md - c.start) / c.step);
    return i >= 0 && i < c.values.length ? c.values[i] : NaN;
  };
  const acc = Array.from({ length: n }, () => ({ g: 0, net: 0, phiH: 0, pv: 0, pvSw: 0, lnk: 0, kH: 0, samples: 0, hc: 0 }));
  const step = ref.step;
  // every sample stands for [md - step/2, md + step/2], clipped to the zone,
  // so the thicknesses add up to the zone exactly
  const i0 = Math.ceil((topMd - step / 2 - ref.start) / step - 1e-9);
  const i1 = Math.floor((baseMd + step / 2 - ref.start) / step - 1e-9);
  for (let i = i0; i <= i1; i++) {
    const md = ref.start + i * step;
    const lo = Math.max(topMd, md - step / 2); const hi = Math.min(baseMd, md + step / 2);
    if (!(hi > lo)) continue;
    // the true vertical thickness this sample stands for
    const a = positionAtMd(path, lo).tvdss;
    const b = positionAtMd(path, hi).tvdss;
    const h = Math.max(0, b - a);
    const z = positionAtMd(path, (lo + hi) / 2).tvdss;
    const f = (z - top.tvdss) / span;
    const k = Math.min(n - 1, Math.max(0, Math.floor(f * n)));
    const L = acc[k];
    L.g += h;
    L.samples += 1;
    const phi = at(curves.phi, md); const vsh = at(curves.vsh, md);
    if (NULLISH(phi) || NULLISH(vsh)) continue;
    if (!(vsh <= cutoffs.vsh && phi >= cutoffs.phi)) continue;
    L.net += h;
    L.phiH += h * phi;
    const sw = at(curves.sw, md);
    if (!NULLISH(sw) && (owcM === null || !Number.isFinite(owcM) || z < owcM)) {
      L.pv += h * phi; L.pvSw += h * phi * Math.min(1, Math.max(0, sw)); L.hc += 1;
    }
    const kv = at(curves.perm, md);
    if (!NULLISH(kv) && kv > 0) { L.lnk += h * Math.log(kv); L.kH += h; }
  }
  return acc.map((L, k) => {
    const mid = positionAtMd(path, mdAtTvdss(path, topMd, baseMd, top.tvdss + span * (k + 0.5) / n));
    return {
      layer: k,
      x: mid.x, y: mid.y, tvdss: mid.tvdss,
      grossM: L.g, netM: L.net,
      ntg: L.g > 0 ? L.net / L.g : null,
      phi: L.net > 0 ? L.phiH / L.net : null,
      sw: L.pv > 0 ? L.pvSw / L.pv : null,
      perm: L.kH > 0 ? Math.exp(L.lnk / L.kH) : null,
      samples: L.samples, hcSamples: L.hc,
    };
  });
}

/**
 * A trajectory that reaches `md`: a well surveyed only at the wellhead (or
 * short of the zone) continues straight along its last station's
 * direction, as a vertical well with no survey does. positionAtMd clamps to
 * the last station, which put every sample of an unsurveyed well at the
 * wellhead depth.
 */
export function extendTrajectory(traj, md) {
  const last = traj[traj.length - 1];
  if (last.md >= md) return traj;
  const prev = traj.length > 1 ? traj[traj.length - 2] : null;
  const d = prev && last.md > prev.md ? last.md - prev.md : 0;
  const ux = d ? (last.x - prev.x) / d : 0; const uy = d ? (last.y - prev.y) / d : 0; const uz = d ? (last.tvd - prev.tvd) / d : 1;
  const L = md - last.md;
  return [...traj, { md, x: last.x + ux * L, y: last.y + uy * L, tvd: last.tvd + uz * L, tvdss: last.tvdss + uz * L }];
}

/** The MD (between two MDs) where the path reaches a TVDSS, by bisection. */
export function mdAtTvdss(traj, mdA, mdB, tvdss) {
  let a = mdA; let b = mdB;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (positionAtMd(traj, m).tvdss < tvdss) a = m; else b = m;
  }
  return (a + b) / 2;
}

/**
 * Control points for every layer of one model zone from all wells.
 * @param {Array} wells engine wells ({name, x, y, kb_m, deviation, tops}) in metres
 * @param {Object<string, object>} curvesByWell well name -> {phi, sw, vsh, perm} curveOf shapes
 * @param {{topName?: string, baseName?: string, registryZone?: string}} zone how the zone is found at a well:
 *   between its tie tops when both are picked in the well, else the registry zone's interval
 * @param {{layers?: number, cutoffs?: object, owcM?: number|null, owcAt?: (x, y) => number|null}} opts
 * @returns {{layers: Array<{phi: Array, sw: Array, ntg: Array, perm: Array}>, rows: Array}} control
 *   points per layer and property ({well, x, y, v, w}) and one row per well and layer for QC
 */
export function zoneLogControl(wells, curvesByWell, zone, { layers = 1, cutoffs = DEFAULT_CUTOFFS, owcM = null, owcAt = null } = {}) {
  const n = Math.max(1, Math.floor(Number(layers) || 1));
  const out = Array.from({ length: n }, () => ({ phi: [], sw: [], ntg: [], perm: [] }));
  // the zone as one layer: the fallback of a layer no well can speak for
  // (a deep layer wholly below the OWC in every well has no Sw)
  const whole = { phi: [], sw: [], ntg: [], perm: [] };
  const rows = [];
  for (const w of wells) {
    const curves = curvesByWell?.[w.name];
    if (!curves || !(curves.phi && curves.vsh)) continue;
    const pick = (nm) => (w.tops || []).find((t) => t.name === nm)?.md_m;
    let topMd = zone.topName ? pick(zone.topName) : undefined;
    let baseMd = zone.baseName ? pick(zone.baseName) : undefined;
    let source = 'tie tops';
    if (!(Number.isFinite(topMd) && Number.isFinite(baseMd) && baseMd > topMd)) {
      const rz = (w.zones || []).find((z) => z.name === zone.registryZone);
      topMd = rz?.top_md_m; baseMd = rz?.base_md_m; source = 'registry zone';
    }
    if (!(Number.isFinite(topMd) && Number.isFinite(baseMd) && baseMd > topMd)) continue;
    const traj = extendTrajectory(minCurvature(w.deviation, w.kb_m, w.x, w.y), baseMd + 50);
    const mid = positionAtMd(traj, (topMd + baseMd) / 2);
    const owc = owcAt ? owcAt(mid.x, mid.y) : owcM;
    const ups = upscaleZoneAtWell({ traj, topMd, baseMd, curves, layers: n, cutoffs, owcM: Number.isFinite(owc) ? owc : null });
    for (const u of ups) {
      const wgt = Math.max(u.grossM, 1e-6);
      for (const k of ['phi', 'sw', 'ntg', 'perm']) {
        if (Number.isFinite(u[k])) out[u.layer][k].push({ well: w.name, x: u.x, y: u.y, v: k === 'perm' ? Math.log10(u[k]) : u[k], w: wgt });
      }
      rows.push({ well: w.name, layer: u.layer, source, topMd, baseMd, grossM: u.grossM, netM: u.netM, ntg: u.ntg, phi: u.phi, sw: u.sw, perm: u.perm, x: u.x, y: u.y });
    }
    if (n > 1) {
      const [z] = upscaleZoneAtWell({ traj, topMd, baseMd, curves, layers: 1, cutoffs, owcM: Number.isFinite(owc) ? owc : null });
      if (z) for (const k of ['phi', 'sw', 'ntg', 'perm']) if (Number.isFinite(z[k])) whole[k].push({ well: w.name, x: z.x, y: z.y, v: k === 'perm' ? Math.log10(z[k]) : z[k], w: Math.max(z.grossM, 1e-6) });
    }
  }
  return { layers: out, zone: n > 1 ? whole : out[0], rows };
}
