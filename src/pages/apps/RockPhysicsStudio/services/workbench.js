// Multi-well elastic crossplot workbench (QI programme Q1 / A2, 2026-10-06).
// Any two logs or elastic properties, every selected well, one interval
// (a zone name common to the wells, or every sample), coloured by well,
// fluid, lithology, depth or a third property, with no point cap. Per-well
// population statistics and a pooling warning when a well's population sits
// well away from the others (a depth trend, compaction or a different rock),
// because pooling different populations blurs exactly the separation a
// feasibility study is looking for. Facies polygons count samples per well.
// Pure apart from loadWellForWorkbench. Values are in display units (the
// plot, the polygons and the statistics all use them).

import { mapLogs, buildModel, zoneIndices } from './prep';
import { applyLocalShearTrend } from './localShear';
import { elasticCurves, meanK, referenceValues, eeiCurve } from '../engine/elasticSet';
import { pointInPolygon } from '../engine/polygon';
import { velocityToDisplay, densityToDisplay, depthToDisplay } from './units';
import { impedanceAxis } from './elastic';

export const WELL_COLORS = Object.freeze(['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2', '#9f1239', '#65a30d']);
export const ALL_SAMPLES = '__all__';

/** Load one well the way the workstation does (curves, model, the saved local shear trend). */
export async function loadWellForWorkbench(backend, well, { pseudoSonic = null, localVs = null } = {}) {
  const [logs, zones] = await Promise.all([backend.listLogs(well.id), backend.listZones(well.id)]);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  const model = applyLocalShearTrend(buildModel(curves, mapped, { pseudoSonic }), localVs);
  return { well, model, zones };
}

/** The variables the axes and the colour can take; unit(units) and toDisplay(si, units). */
export function workbenchVariables(units, chi = 20) {
  const speed = units.velocity === 'ft/s' ? 'ft/s' : 'm/s';
  const imp = impedanceAxis(units.velocity, units.density);
  const vel = (si) => velocityToDisplay(si, speed);
  return [
    { key: 'vp', label: 'Vp', unit: speed, toDisplay: vel },
    { key: 'vs', label: 'Vs', unit: speed, toDisplay: vel },
    { key: 'rho', label: 'Density', unit: units.density === 'g/cc' ? 'g/cc' : 'kg/m³', toDisplay: (si) => densityToDisplay(si, units.density) },
    { key: 'phi', label: 'Porosity', unit: 'v/v', toDisplay: (v) => v },
    { key: 'vsh', label: 'VSH', unit: 'v/v', toDisplay: (v) => v },
    { key: 'sw', label: 'Sw', unit: 'v/v', toDisplay: (v) => v },
    { key: 'depth', label: 'MD', unit: units.depth, toDisplay: (m) => depthToDisplay(m, units.depth) },
    { key: 'ai', label: 'AI', unit: imp.unit, toDisplay: (si) => si * imp.factor },
    { key: 'si', label: 'SI', unit: imp.unit, toDisplay: (si) => si * imp.factor },
    { key: 'vpvs', label: 'Vp/Vs', unit: '', toDisplay: (v) => v },
    { key: 'pr', label: "Poisson's ratio", unit: '', toDisplay: (v) => v },
    { key: 'lambdaRho', label: 'λρ', unit: 'GPa·g/cc', toDisplay: (si) => si / 1e12 },
    { key: 'muRho', label: 'μρ', unit: 'GPa·g/cc', toDisplay: (si) => si / 1e12 },
    { key: 'eei', label: `EEI(${chi}°)`, unit: imp.unit, toDisplay: (si) => si * imp.factor },
  ];
}

/** Zone names the selected wells share (an interval the wells can be compared on). */
export function commonZoneNames(loaded) {
  if (!loaded.length) return [];
  const sets = loaded.map((w) => new Set((w.zones || []).map((z) => z.name)));
  return [...sets[0]].filter((n) => sets.every((s) => s.has(n))).sort();
}

const intervalOf = (w, zoneName) => {
  if (zoneName === ALL_SAMPLES) return Array.from({ length: w.model.n }, (_, i) => i);
  const z = (w.zones || []).find((x) => x.name === zoneName);
  return z ? zoneIndices(w.model.depth, z.top_md_m, z.base_md_m) : [];
};

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a, m) => (a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : NaN);

/**
 * The points and statistics.
 * @param {Array<{well, model, zones}>} loaded
 * @param {{x: string, y: string, color: string, zoneName: string, chi: number, swCut: number, vshCut: number, units: Object}} opts
 *   color is 'well' | 'fluid' | 'lithology' | a variable key
 */
export function workbenchData(loaded, { x, y, color = 'well', zoneName = ALL_SAMPLES, chi = 20, swCut = 0.7, vshCut = 0.5, units }) {
  const vars = workbenchVariables(units, chi);
  const vx = vars.find((v) => v.key === x);
  const vy = vars.find((v) => v.key === y);
  const vc = vars.find((v) => v.key === color) || null;
  if (!vx || !vy) return { error: 'Choose two properties to plot.' };

  // per-well raw arrays; EEI with ONE K and reference set over the pooled
  // interval samples, so the wells are on the same scale
  const per = loaded.map((w, wi) => {
    const idx = intervalOf(w, zoneName);
    const el = elasticCurves({ vp: w.model.vp, vs: w.model.vs, rho: w.model.rho });
    return { w, wi, idx, el };
  });
  const pooledLogs = { vp: [], vs: [], rho: [] };
  for (const p of per) for (const i of p.idx) { pooledLogs.vp.push(p.w.model.vp[i]); pooledLogs.vs.push(p.w.model.vs[i]); pooledLogs.rho.push(p.w.model.rho[i]); }
  let eeiInfo = null;
  if ([x, y, color].includes('eei') && pooledLogs.vp.length) {
    try {
      const K = meanK(pooledLogs);
      const ref = referenceValues(pooledLogs);
      eeiInfo = { K, ref };
      for (const p of per) p.el.eei = eeiCurve({ vp: p.w.model.vp, vs: p.w.model.vs, rho: p.w.model.rho }, chi, { K, ref });
    } catch (e) { return { error: e.message }; }
  }
  const raw = (p, key, i) => {
    if (key in p.el) return p.el[key][i];
    const arr = p.w.model[key];
    return arr ? arr[i] : NaN;
  };

  const points = [];
  const stats = [];
  let zLo = Infinity; let zHi = -Infinity;
  for (const p of per) {
    const xs = []; const ys = [];
    for (const i of p.idx) {
      const xv = vx.toDisplay(raw(p, x, i));
      const yv = vy.toDisplay(raw(p, y, i));
      if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
      let zv = NaN;
      let group = null;
      if (color === 'fluid') {
        const sw = p.w.model.sw ? p.w.model.sw[i] : NaN;
        group = Number.isFinite(sw) ? (sw < swCut ? 'hydrocarbon' : 'water') : 'no Sw';
      } else if (color === 'lithology') {
        const v = p.w.model.vsh ? p.w.model.vsh[i] : NaN;
        group = Number.isFinite(v) ? (v < vshCut ? 'sand' : 'shale') : 'no VSH';
      } else if (vc) {
        zv = vc.toDisplay(raw(p, color, i));
        if (Number.isFinite(zv)) { zLo = Math.min(zLo, zv); zHi = Math.max(zHi, zv); }
      }
      points.push({ x: xv, y: yv, wi: p.wi, i, depthM: p.w.model.depth[i], zv, group });
      xs.push(xv); ys.push(yv);
    }
    const mx = xs.length ? mean(xs) : NaN;
    const my = ys.length ? mean(ys) : NaN;
    stats.push({ well: p.w.well.name, wi: p.wi, n: xs.length, meanX: mx, meanY: my, sdX: sd(xs, mx), sdY: sd(ys, my) });
  }

  // pooled statistics and the pooling warning: a well whose mean sits more
  // than one pooled within-well standard deviation from the pooled mean
  const used = stats.filter((s) => s.n >= 2);
  const N = used.reduce((s, r) => s + r.n, 0);
  const pooled = N ? {
    n: N,
    meanX: used.reduce((s, r) => s + r.meanX * r.n, 0) / N,
    meanY: used.reduce((s, r) => s + r.meanY * r.n, 0) / N,
    sdX: Math.sqrt(used.reduce((s, r) => s + (r.n - 1) * r.sdX ** 2, 0) / Math.max(1, N - used.length)),
    sdY: Math.sqrt(used.reduce((s, r) => s + (r.n - 1) * r.sdY ** 2, 0) / Math.max(1, N - used.length)),
  } : null;
  const warnings = [];
  if (pooled && used.length > 1) {
    for (const r of used) {
      const dx = pooled.sdX > 0 ? Math.abs(r.meanX - pooled.meanX) / pooled.sdX : 0;
      const dy = pooled.sdY > 0 ? Math.abs(r.meanY - pooled.meanY) / pooled.sdY : 0;
      r.offset = Math.max(dx, dy);
      if (r.offset > 1) {
        const which = dx >= dy ? vx.label : vy.label;
        warnings.push(`${r.well}: its mean ${which} sits ${r.offset.toFixed(1)} within-well standard deviations from the pooled mean. The wells may be different populations (a depth trend, compaction or a different rock); compare them before pooling.`);
      }
    }
  }
  return {
    points, stats, pooled, warnings, x: vx, y: vy, color: vc, eeiInfo,
    colorRange: zLo <= zHi ? [zLo, zHi] : null,
  };
}

/** Samples inside each facies polygon, per well (first polygon wins, as in Petrophysics Studio's faciesCurve). */
export function faciesCounts(points, facies, wellCount) {
  const counts = facies.map(() => new Array(wellCount).fill(0));
  let untagged = 0;
  for (const p of points) {
    const f = facies.findIndex((fc) => pointInPolygon(p.x, p.y, fc.polygon));
    if (f >= 0) counts[f][p.wi] += 1; else untagged += 1;
  }
  return { counts, untagged };
}

/**
 * A facies-code curve for one well over its whole depth grid, from polygons
 * drawn on the workbench (QI A2): 1..n the first polygon holding the
 * sample's (x, y), 0 inside none, null where x or y is missing. The axes,
 * units and EEI settings travel in the provenance, so the curve can be
 * reproduced. Prepared in the publish format (overwrite-own by mnemonic).
 */
export const FACIES_MNEMONIC = 'RP_FACIES';
export function prepareFaciesLog(w, facies, { x, y, units, chi = 20, eeiInfo = null, projectId = null, pipelineVersion, engine }) {
  if (!facies.length) throw new Error('Draw at least one facies polygon first.');
  const vars = workbenchVariables(units, chi);
  const vx = vars.find((v) => v.key === x);
  const vy = vars.find((v) => v.key === y);
  const m = w.model;
  const el = elasticCurves({ vp: m.vp, vs: m.vs, rho: m.rho });
  if (x === 'eei' || y === 'eei') {
    if (!eeiInfo) throw new Error('EEI needs the K and references of the plot.');
    el.eei = eeiCurve({ vp: m.vp, vs: m.vs, rho: m.rho }, chi, eeiInfo);
  }
  const raw = (key, i) => (key in el ? el[key][i] : (m[key] ? m[key][i] : NaN));
  const n = m.depth.length;
  const data = new Float32Array(n);
  let nullCount = 0;
  const tally = new Array(facies.length + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const xv = vx.toDisplay(raw(x, i));
    const yv = vy.toDisplay(raw(y, i));
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) { data[i] = NaN; nullCount += 1; continue; }
    const f = facies.findIndex((fc) => pointInPolygon(xv, yv, fc.polygon));
    data[i] = f + 1;
    tally[f + 1] += 1;
  }
  const legend = facies.map((f, k) => `${k + 1} ${f.name}`).join(', ');
  return {
    mnemonic: FACIES_MNEMONIC,
    description: `Rock physics facies from the Multi-well crossplot (${vy.label} against ${vx.label}): ${legend}; 0 inside no polygon`,
    unit: 'CODE',
    data,
    startMdM: m.depth[0],
    stopMdM: m.depth[n - 1],
    stepM: n > 1 ? m.depth[1] - m.depth[0] : null,
    nSamples: n,
    nullCount,
    provenance: {
      computed: true,
      engine,
      pipeline_version: pipelineVersion,
      project_id: projectId,
      kind: 'facies',
      codes: facies.map((f, k) => ({ code: k + 1, name: f.name, polygon: f.polygon })),
      axes: { x: { key: vx.key, label: vx.label, unit: vx.unit }, y: { key: vy.key, label: vy.label, unit: vy.unit } },
      units: { velocity: units.velocity, density: units.density, depth: units.depth },
      eei: (x === 'eei' || y === 'eei') ? { chi, K: eeiInfo.K, ref: eeiInfo.ref } : null,
      vs_source: m.vsSource || 'measured',
      vs_trend: m.vsTrend || null,
      samples_per_code: tally,
    },
  };
}

/** Which plotted wells a facies curve may be written to: the user's own; a colleague's shared well is read-only. */
export function faciesWriteTargets(loaded) {
  return {
    own: loaded.filter((r) => r.well.is_own !== false),
    skipped: loaded.filter((r) => r.well.is_own === false).map((r) => r.well.name),
  };
}
