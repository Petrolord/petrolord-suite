// Log templates in the Well Data Manager (Geoscience video Part B,
// 2026-10-17): the Logs tab draws a well through the same built-in track
// templates as Petrophysics Studio and Well Correlation (GR fills,
// density-neutron crossover, log-scale resistivity), resolved against the
// well's raw registry curves. Computed curves published to the registry
// (PHIE, VSH, SW, PAY...) stand in for the template's `output:` addresses,
// so a published interpretation shows here too. Pure, no React.

import { buildDefaultTemplates } from '@/components/wells/layout/layoutSchema';
import { resolveTracks } from '@/components/wells/layout/resolveTracks';

/** The "tick curves yourself" view: the original one-curve-per-track quick view. */
export const CUSTOM_VIEW = 'custom';
export const DEFAULT_VIEW = 'quicklook';

/** Fixed values for the parameter-bound fills (the Well Correlation set). */
export const WDM_PARAMS = { grClean: 30, grClay: 120, cutPhi: 0.08, cutVsh: 0.4, cutSw: 0.6 };

/** Built-in templates offered in the Logs tab, in menu order. */
export function wdmTemplates() {
  const all = buildDefaultTemplates();
  const order = ['quicklook', 'lithology-quicklook', 'std-triple-combo', 'borehole-qc'];
  return order.map((id) => all.find((t) => t.id === id)).filter(Boolean);
}

/** Output mnemonics a published registry curve may stand in for. */
export const PUBLISHED_OUTPUTS = ['PHIE', 'PHIT', 'VSH', 'SW', 'PAY', 'KPERM', 'BVW', 'TEMP'];

/** `output:` stand-ins from published registry curves (raw curves keyed by mnemonic). */
export function publishedOutputs(logs) {
  const out = {};
  for (const k of PUBLISHED_OUTPUTS) {
    const c = logs?.[k] || logs?.[k.toLowerCase()];
    if (c) out[k] = c;
  }
  return out;
}

/**
 * Tracks of one template for one well.
 * @param {Object} template layoutSchema template
 * @param {{curves: Object, logs: Object}} cw curves cache entry (oriented top-down)
 * @param {Array} [intervals] registry intervals (lithology strips)
 */
export function resolveWellTemplate(template, cw, intervals = []) {
  if (!template || !cw) return [];
  return resolveTracks(template, {
    curves: cw.curves || {}, logs: cw.logs || {}, outputs: publishedOutputs(cw.logs), faciesData: null, facies: [],
    params: WDM_PARAMS, intervals: intervals || [], depth: cw.curves?.DEPT || null,
  });
}

/** Depth extent (metres) where any resolved track has a value. */
export function dataExtent(depth, tracks) {
  if (!depth || !depth.length) return null;
  let lo = Infinity; let hi = -Infinity;
  for (const t of tracks || []) {
    for (const c of t.curves || []) {
      const d = c.data;
      if (!d) continue;
      for (let i = 0; i < Math.min(d.length, depth.length); i++) {
        if (Number.isFinite(d[i]) && Number.isFinite(depth[i])) {
          if (depth[i] < lo) lo = depth[i];
          if (depth[i] > hi) hi = depth[i];
        }
      }
    }
  }
  return hi > lo ? { top: lo, base: hi } : null;
}

/**
 * Depth windows the viewer offers: the whole logged interval, then a
 * window around each top (`halfM` metres either side), clipped to the logs.
 * @returns {Array<{key: string, label: string, top: number, base: number}>}
 */
export function depthWindows(extent, tops = [], halfM = 45.72) {
  if (!extent) return [];
  const out = [{ key: 'all', label: 'Whole well', top: extent.top, base: extent.base }];
  const seen = new Set();
  for (const t of [...(tops || [])].sort((a, b) => a.md_m - b.md_m)) {
    if (!Number.isFinite(t.md_m) || seen.has(t.name)) continue;
    if (t.md_m < extent.top || t.md_m > extent.base) continue;
    seen.add(t.name);
    out.push({ key: `top:${t.name}`, label: `Around ${t.name}`, top: Math.max(extent.top, t.md_m - halfM), base: Math.min(extent.base, t.md_m + halfM) });
  }
  return out;
}
