// Systems tracts between SEQUENCE surfaces (AppUpgrade STRAT-U1-001,
// 2026-09-30). Suite-side wrapper around the vendored engine: the engine
// (sequence.js tractsFromSurfaces, vocabulary.js expectedTract) pairs
// CONSECUTIVE tops, so a lithostratigraphic formation top, a biozone datum
// or an unclassified unconformity picked between two sequence surfaces
// broke the pair and the tract vanished from the section, from "Record
// tracts", from the Tops view and from the Wheeler chart. A formation top
// carries no sequence meaning (vocabulary: order null), so only surfaces
// with a sequence position are paired here; the tract logic itself stays
// the engine's (this file filters its input and reads its output).

import { tractsWithStacking } from './sequence';
import { expectedTract, normalizeSurfaceType, surfaceOrder } from './vocabulary';

/** A top whose type has a position in the depositional sequence (SU, CC, BSFR, RSME, MRS, TRS, MFS). */
export const isSequenceSurface = (t) => Number.isFinite(surfaceOrder(normalizeSurfaceType(t?.surface_type)));

/**
 * The tracts a well's typed surfaces imply, ignoring tops that carry no
 * sequence position, with the stacking the motifs read (engine rows).
 */
export function sequenceTracts(tops, intervals = []) {
  return tractsWithStacking((tops || []).filter(isSequenceSurface), intervals);
}

/**
 * The tract below each sequence surface (keyed by the upper surface's id),
 * for the Tops view: the pair is the surface and the next deeper SEQUENCE
 * surface, whatever formation tops sit between them.
 * @param {Array<{id, md_m, surface_type}>} rows
 * @returns {Map<string, {code: string, certain: boolean}>}
 */
export function tractBelowEach(rows) {
  const seq = [...(rows || [])].filter((r) => Number.isFinite(Number(r.md_m)) && isSequenceSurface(r)).sort((a, b) => a.md_m - b.md_m);
  const out = new Map();
  for (let i = 0; i + 1 < seq.length; i++) {
    const t = expectedTract(normalizeSurfaceType(seq[i + 1].surface_type), normalizeSurfaceType(seq[i].surface_type));
    if (t) out.set(seq[i].id, t);
  }
  return out;
}

/**
 * Wheeler cells take the tract of the tract interval that holds them (the
 * recorded tracts when the well has any, else the implied ones), the same
 * rows the section fills, so the two views never disagree. A deposition
 * cell no tract interval covers keeps what the engine gave it.
 * @param {{wells: Array<{id, cells: Array}>}} chart engine wheelerChart output
 * @param {Object<string, Array<{top_md_m, base_md_m, code, properties?}>>} tractRowsByWell
 */
export function withSectionTracts(chart, tractRowsByWell) {
  return {
    ...chart,
    wells: chart.wells.map((w) => {
      const rows = tractRowsByWell?.[w.id] || [];
      if (!rows.length) return w;
      return {
        ...w,
        cells: w.cells.map((c) => {
          if (c.kind !== 'deposition' || !Number.isFinite(c.top_md_m) || !Number.isFinite(c.base_md_m)) return c;
          const mid = (c.top_md_m + c.base_md_m) / 2;
          const hit = rows.find((r) => r.top_md_m <= mid + 1e-9 && r.base_md_m >= mid - 1e-9);
          if (!hit) return c;
          return { ...c, tract: hit.code, certain: hit.properties?.certain !== false, label: hit.code };
        }),
      };
    }),
  };
}
