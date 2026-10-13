// Targets from the shared geoscience registries (WD2) and their source
// freshness (2026-10-12). The two picks of the "From top" and "From
// surface" dialogs live here so the dialog and "Refresh from source" run
// the same code; each pick now records source references (the top and
// its well, or the surface) with a content fingerprint, so a later edit
// in the registry is noticed on the Targets tab (src/lib/sourceFreshness).
//
// Freshness per target:
//   from a top      geo_wells_tops (the top's MD; a top written again
//                   under the same name in the same well is the same top)
//                   and geo_wells (location, datum, deviation)
//   from a surface  geo_surfaces (frame and re-grid history)
// Targets picked before 2026-10-12: a top target compares the MD it
// recorded (top_md_m) with the top now; a surface target compares the
// surface's updated_at with the target's created_at; the well of an older
// top target is not checked (nothing was recorded to compare).

import { computeWellPath, positionAtMd } from '../engine/surveyMath';
import { readDepthSurface } from '@/lib/readDepthSurface';
import { readWellDatum } from '@/lib/wellDatum';
import { sourceRef, fingerprintOf, snapshotOf } from '@/lib/sourceFreshness/model';

/** Bilinear sample of a row-major nx*ny float32 grid; null outside. */
export function sampleGrid(surface, grid, x, y) {
  const { origin_x, origin_y, dx, dy, nx, ny } = surface;
  const fx = (x - origin_x) / dx;
  const fy = (y - origin_y) / dy;
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return null;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const c1 = Math.min(nx - 1, c0 + 1);
  const r1 = Math.min(ny - 1, r0 + 1);
  const tx = fx - c0;
  const ty = fy - r0;
  const z00 = grid[r0 * nx + c0];
  const z01 = grid[r0 * nx + c1];
  const z10 = grid[r1 * nx + c0];
  const z11 = grid[r1 * nx + c1];
  if (![z00, z01, z10, z11].every(Number.isFinite)) return null;
  return z00 * (1 - tx) * (1 - ty) + z01 * tx * (1 - ty)
    + z10 * (1 - tx) * ty + z11 * tx * ty;
}

/**
 * A target depth from a registry surface (MAP-U1-031, Earth Modeling
 * upgrade U1, 2026-09-30). The row is read through the shared door, so
 * an elevation in feet becomes TVDSS in metres (the old Math.abs(z) kept
 * feet as metres), a rotated lattice is sampled where the point really
 * is, and time, attribute (MD/TVD maps) and isochore rows are refused with
 * the reason instead of being read as TVDSS. A point above the datum
 * gives a negative TVDSS, as it should.
 * @param {object} surface geo_surfaces row
 * @param {ArrayLike<number>} grid its stored f32 grid
 * @param {number} x @param {number} y location in the surface's own map units
 * @returns {{tvdss_m:number, sampled_z:number, crs:?string, notes:string[]}}
 */
export function targetDepthFromSurface(surface, grid, x, y) {
  const r = readDepthSurface(surface, grid, { accept: ['elevation'], as: 'depth' });
  if (!r.ok) throw new Error(r.reason);
  const d = r.sampleAt(x, y);
  if (d === null) throw new Error('The location is outside the surface grid (or on a null node).');
  const raw = sampleGrid(surface, grid, x, y);
  return { tvdss_m: d, sampled_z: Number.isFinite(raw) ? raw : null, crs: r.crs, xyUnit: r.xyUnit, notes: r.notes };
}


// "Depth below the pick" (2026-10-13): a target is often set a stand-off
// below the picked horizon (inside the sand, under the top). The stand-off
// is metres, positive down (negative is above the pick); the target TVDSS is
// the pick plus the stand-off, and both are kept in the provenance so
// "Refresh from source" re-runs the pick and applies the same stand-off.
const standOff = (belowM) => (Number.isFinite(Number(belowM)) ? Number(belowM) : 0);
const standOffProvenance = (belowM, pickedTvdssM) => (standOff(belowM) !== 0
  ? { below_pick_m: standOff(belowM), picked_tvdss_m: pickedTvdssM }
  : {});

/**
 * The target a well top gives: where the well crosses the top, at its
 * subsea depth, with the provenance and source references.
 * @param {object} well geo_wells row with tops
 * @param {object} top geo_wells_tops row
 * @param {string} [name]
 */
export function targetFromTop(well, top, name = '', { now = new Date().toISOString(), belowM = 0 } = {}) {
  const deviation = Array.isArray(well.deviation) && well.deviation.length >= 2
    ? well.deviation : [{ md: 0, inc: 0, azi: 0 }, { md: Math.max(top.md_m + 1, well.td_md_m || top.md_m + 1), inc: 0, azi: 0 }];
  // WDM-U2-007: the target is placed at the top's subsea depth, so the
  // well must state its reference elevation
  const wd = readWellDatum(well);
  if (!wd.tvdssOk) throw new Error(`${wd.tvdssReason} A target from a top is placed at the top's subsea depth.`);
  const path = computeWellPath(deviation, {
    surfaceX: well.surface_x, surfaceY: well.surface_y, kb: wd.refElevM,
  });
  const pos = positionAtMd(deviation, path, Math.min(top.md_m, deviation[deviation.length - 1].md));
  if (!pos) throw new Error(`Top MD ${top.md_m} m is outside the well's surveyed range.`);
  return {
    name: name || `${top.name} @ ${well.name}`,
    kind: 'point',
    category: 'geological',
    center_x: pos.x,
    center_y: pos.y,
    tvdss_m: pos.tvdss + standOff(belowM),
    provenance: {
      source: 'geo_top', geo_well_id: well.id, well_name: well.name,
      top_id: top.id, top_name: top.name, top_md_m: top.md_m,
      ...standOffProvenance(belowM, pos.tvdss),
      pulled_at: now,
      source_refs: {
        top: sourceRef({ key: 'top', kind: 'geo_wells_tops', row: top, name: `${top.name} in ${well.name}`, usedAt: now, extra: { well_id: well.id, top_name: top.name } }),
        well: sourceRef({ key: 'well', kind: 'geo_wells', row: well, usedAt: now }),
      },
    },
  };
}

/** The target a registry surface gives at (x, y), in the surface's own map units. */
export function targetFromSurfacePick(surface, grid, x, y, name = '', { now = new Date().toISOString(), belowM = 0 } = {}) {
  const t = targetDepthFromSurface(surface, grid, x, y);
  return {
    name: name || `${surface.name} pick`,
    kind: 'point',
    category: 'geological',
    center_x: x,
    center_y: y,
    tvdss_m: t.tvdss_m + standOff(belowM),
    provenance: {
      source: 'geo_surface', surface_id: surface.id, surface_name: surface.name,
      ...standOffProvenance(belowM, t.tvdss_m),
      sampled_z: t.sampled_z, z_unit: surface.z_unit || null, crs: t.crs, xy_unit: t.xyUnit || null,
      note: 'tvdss in metres positive down, read from the registry elevation through readDepthSurface',
      ...(t.notes.length ? { door_notes: t.notes } : {}),
      pulled_at: now,
      source_refs: { surface: sourceRef({ key: 'surface', kind: 'geo_surfaces', row: surface, usedAt: now }) },
    },
  };
}

/** The source references of a site's targets, keyed `target:<id>:<part>`. */
export function targetSourceRefs(targets) {
  const out = [];
  for (const t of targets || []) {
    const p = t?.provenance || {};
    const tag = (part, ref) => out.push({ ...ref, key: `target:${t.id}:${part}`, target_id: t.id, target_name: t.name, part });
    if (p.source === 'geo_top') {
      const refs = p.source_refs || {};
      if (refs.top) tag('top', refs.top);
      else if (p.top_id && p.geo_well_id && Number.isFinite(p.top_md_m)) {
        // picked before 2026-10-12: the MD it recorded is the snapshot
        const snapshot = snapshotOf('geo_wells_tops', { md_m: p.top_md_m });
        tag('top', { kind: 'geo_wells_tops', id: p.top_id, well_id: p.geo_well_id, top_name: p.top_name, name: `${p.top_name} in ${p.well_name}`, used_at: t.created_at || null, snapshot, fingerprint: fingerprintOf(snapshot), affects_results: true });
      }
      if (refs.well) tag('well', { ...refs.well, name: refs.well.name || p.well_name });
    } else if (p.source === 'geo_surface' && p.surface_id) {
      const ref = p.source_refs?.surface || { kind: 'geo_surfaces', id: p.surface_id, used_at: t.created_at || null, affects_results: true };
      tag('surface', { ...ref, name: ref.name || p.surface_name });
    }
  }
  return out;
}

/** "Keep current values" decisions, kept with each target's provenance. */
export function targetKept(targets) {
  const out = {};
  for (const t of targets || []) for (const [part, token] of Object.entries(t?.provenance?.kept || {})) out[`target:${t.id}:${part}`] = token;
  return out;
}

/**
 * The registry rows the references point at, by ref key: the row, null when
 * it is gone (or no longer shared), no entry when the registry could not be read.
 * @param {object[]} refs
 * @param {{listWellsWithTops: function(): Promise<object[]>, listSurfaces: function(): Promise<object[]>}} readers
 */
export async function readTargetSources(refs, readers) {
  const out = new Map();
  const wellRefs = refs.filter((r) => r.kind === 'geo_wells_tops' || r.kind === 'geo_wells');
  const surfRefs = refs.filter((r) => r.kind === 'geo_surfaces');
  if (wellRefs.length) {
    try {
      const wells = await readers.listWellsWithTops();
      for (const r of wellRefs) {
        if (r.kind === 'geo_wells') { out.set(r.key, wells.find((w) => w.id === r.id) || null); continue; }
        const w = wells.find((x) => x.id === r.well_id);
        // replaceTops writes every top again with new ids: the same name in the same well is the same top
        const top = w ? ((w.tops || []).find((x) => x.id === r.id) || (w.tops || []).find((x) => x.name === r.top_name)) : null;
        out.set(r.key, top || null);
      }
    } catch { /* not readable */ }
  }
  if (surfRefs.length) {
    try {
      const rows = await readers.listSurfaces();
      for (const r of surfRefs) out.set(r.key, rows.find((x) => x.id === r.id) || null);
    } catch { /* not readable */ }
  }
  return out;
}

/**
 * The target patch "Refresh from source" writes: the pick, run again on
 * the registry as it is now, keeping the target's name.
 * @param {object} result a freshness result (ref.target_id, ref.part)
 * @param {object} target the wp_targets row
 * @param {{listWellsWithTops, listSurfaces, downloadSurfaceGrid}} readers
 */
export async function refreshTargetPatch(result, target, readers) {
  const p = target.provenance || {};
  let pick;
  if (p.source === 'geo_top') {
    const wells = await readers.listWellsWithTops();
    const well = wells.find((w) => w.id === p.geo_well_id);
    if (!well) throw new Error(`${p.well_name || 'The well'} is no longer in the registry.`);
    const top = (well.tops || []).find((x) => x.id === p.top_id) || (well.tops || []).find((x) => x.name === p.top_name);
    if (!top) throw new Error(`${p.top_name || 'The top'} is no longer picked in ${well.name}.`);
    pick = targetFromTop(well, top, target.name, { belowM: p.below_pick_m || 0 });
  } else if (p.source === 'geo_surface') {
    const rows = await readers.listSurfaces();
    const surface = rows.find((x) => x.id === p.surface_id);
    if (!surface) throw new Error(`${p.surface_name || 'The surface'} is no longer in the registry.`);
    const grid = await readers.downloadSurfaceGrid(surface);
    pick = targetFromSurfacePick(surface, grid, target.center_x, target.center_y, target.name, { belowM: p.below_pick_m || 0 });
  } else {
    throw new Error('This target was not taken from the registry.');
  }
  // the new provenance carries no keep decision: the refreshed values are the
  // source's, with the target's own stand-off below the pick applied again
  return { center_x: pick.center_x, center_y: pick.center_y, tvdss_m: pick.tvdss_m, provenance: pick.provenance };
}

/**
 * What the Source column says about a target (2026-10-13): where it came
 * from in words, with the stand-off below the pick when there is one.
 * @param {object} target wp_targets row
 * @param {(m:number)=>string} [depth] a metre length in the display unit, e.g. "26.2 ft"
 */
export function targetSourceLabel(target, depth = (m) => `${m.toFixed(1)} m`) {
  const p = target?.provenance || {};
  const below = Number(p.below_pick_m);
  const off = Number.isFinite(below) && Math.abs(below) > 1e-6
    ? `, ${depth(Math.abs(below))} ${below > 0 ? 'below' : 'above'}` : '';
  if (p.source === 'geo_surface') return `Surface: ${p.surface_name || 'registry surface'}${off}`;
  if (p.source === 'geo_top') return `Top: ${p.top_name || 'top'} in ${p.well_name || 'registry well'}${off}`;
  return p.source ? String(p.source) : 'Typed';
}

/**
 * What "Refresh from source" would do to a target, in one sentence: the
 * TVDSS before and after and the horizontal shift (2026-10-13). Pure; the
 * caller runs refreshTargetPatch to get the patch.
 * @param {object} target wp_targets row
 * @param {{center_x:number, center_y:number, tvdss_m:number}} patch
 * @param {{unit?: 'm'|'ft'}} [opts]
 */
export function targetMoveText(target, patch, { unit = 'm' } = {}) {
  const k = unit === 'ft' ? 1 / 0.3048 : 1;
  const was = Number(target?.tvdss_m) * k;
  const now = Number(patch?.tvdss_m) * k;
  const dz = now - was;
  const dh = Math.hypot(Number(patch?.center_x) - Number(target?.center_x), Number(patch?.center_y) - Number(target?.center_y));
  const f = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const across = Number.isFinite(dh) && dh >= 0.05 ? `, and ${f(dh)} m across` : '';
  if (!Number.isFinite(dz)) return null;
  if (Math.abs(dz) < 0.05 && !across) return `Refreshing leaves ${target.name} where it is.`;
  const vert = Math.abs(dz) < 0.05 ? 'no deeper' : `${f(Math.abs(dz))} ${unit} ${dz > 0 ? 'deeper' : 'shallower'}`;
  return `Refreshing moves ${target.name} from ${f(was)} to ${f(now)} ${unit} TVDSS (${vert}${across}).`;
}
