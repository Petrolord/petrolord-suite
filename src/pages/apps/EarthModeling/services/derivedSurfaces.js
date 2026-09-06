// Derived horizons in the model definition (Earth Modeling EM2,
// 2026-09-06). A derived entry is small persistable state ({id, name,
// kind, sourceId, thicknessM | isochoreId, baseId, fraction}); its grid
// is computed at build time on the SOURCE surface's frame from the
// registry grids (metres positive down), so the stack treats it like
// any registry surface and resamples it onto the model frame. The
// arithmetic is the engines derived module. Pure except for the grid
// loader the build passes in.

import { parallelSurface, proportionalSurface, DERIVED_KINDS } from '../engine/derived';
import { resampleTo, convertZUnit } from '@/lib/gridding/gridmath';
import { specOf } from './modelBuild';

export { DERIVED_KINDS };

let seq = 0;
export const newDerivedId = () => { seq += 1; return `derived-${Date.now().toString(36)}-${seq}`; };

/** Registry rows plus the definition's derived horizons as virtual rows. */
export function allSurfaceRows(surfaces, definition) {
  const rows = [...(surfaces || [])];
  for (const d of definition?.derived || []) {
    const src = rows.find((s) => s.id === d.sourceId);
    if (!src) continue;
    rows.push({
      id: d.id, name: d.name, kind: 'structure', derived: true, is_own: true,
      origin_x: src.origin_x, origin_y: src.origin_y, nx: src.nx, ny: src.ny, dx: src.dx, dy: src.dy,
      rotation_deg: src.rotation_deg || 0, z_domain: 'depth', z_unit: 'm', crs: src.crs || null,
      provenance: { engine: 'earth-modeling', derived: d },
    });
  }
  return rows;
}

/** Word a derived entry for lists and provenance. */
export function describeDerived(d, rows, depthUnit = 'm') {
  const name = (id) => rows.find((s) => s.id === id)?.name || '?';
  if (d.kind === 'parallel') {
    const t = d.isochoreId ? `the ${name(d.isochoreId)} thickness` : `${(depthUnit === 'ft' ? d.thicknessM / 0.3048 : d.thicknessM).toFixed(1)} ${depthUnit}`;
    return `parallel to ${name(d.sourceId)} at ${t}`;
  }
  return `${Math.round(d.fraction * 100)}% of the way from ${name(d.sourceId)} to ${name(d.baseId)}`;
}

/** Validate a dock form into a derived entry (thickness typed in the display unit). */
export function makeDerivedEntry(form, rows, depthUnit = 'm') {
  const kind = form.kind;
  if (!DERIVED_KINDS.some((k) => k.key === kind)) throw new Error(`Unknown derived horizon kind "${kind}".`);
  const src = rows.find((s) => s.id === form.sourceId);
  if (!src) throw new Error('Choose the surface the horizon derives from.');
  const base = { id: newDerivedId(), kind, sourceId: src.id };
  if (kind === 'parallel') {
    if (form.isochoreId) {
      const iso = rows.find((s) => s.id === form.isochoreId);
      if (!iso) throw new Error('The thickness surface is not in the registry.');
      if (iso.kind !== 'isochore') throw new Error(`${iso.name} is not a thickness (isochore) surface.`);
      return { ...base, isochoreId: iso.id, name: form.name?.trim() || `${src.name} + ${iso.name}` };
    }
    const t = Number(form.thickness);
    if (!Number.isFinite(t) || t === 0) throw new Error(`Type a thickness in ${depthUnit} (negative places the horizon above).`);
    const thicknessM = depthUnit === 'ft' ? t * 0.3048 : t;
    return { ...base, thicknessM, name: form.name?.trim() || `${src.name} ${t > 0 ? '+' : '-'} ${Math.abs(t)} ${depthUnit}` };
  }
  const b = rows.find((s) => s.id === form.baseId);
  if (!b) throw new Error('Choose the base surface for a proportional horizon.');
  if (b.id === src.id) throw new Error('Top and base must be different surfaces.');
  const f = Number(form.fraction);
  if (!Number.isFinite(f) || f <= 0 || f >= 1) throw new Error('The fraction must be between 0 and 1 (0.5 is midway).');
  return { ...base, baseId: b.id, fraction: f, name: form.name?.trim() || `${Math.round(f * 100)}% ${src.name} to ${b.name}` };
}

/**
 * The derived grid on the source's frame, metres positive down.
 * @param {object} d derived entry
 * @param {object[]} rows allSurfaceRows
 * @param {(row) => Promise<Float32Array>} loadDepthDown registry grid as depth-down metres (or raw thickness in metres for isochores)
 */
export async function computeDerivedGrid(d, rows, loadDepthDown) {
  const src = rows.find((s) => s.id === d.sourceId);
  if (!src) throw new Error('A derived horizon lost its source surface. Remove it from the model.');
  const srcSpec = specOf(src);
  const zSrc = await loadDepthDown(src);
  if (d.kind === 'parallel') {
    if (d.isochoreId) {
      const iso = rows.find((s) => s.id === d.isochoreId);
      if (!iso) throw new Error('A derived horizon lost its thickness surface. Remove it from the model.');
      const raw = await loadDepthDown(iso);
      const tM = iso.z_unit === 'ft' ? convertZUnit(raw, 'ft', 'm') : raw;
      const t = resampleTo(tM, specOf(iso), srcSpec);
      return parallelSurface(zSrc, t);
    }
    return parallelSurface(zSrc, d.thicknessM);
  }
  const base = rows.find((s) => s.id === d.baseId);
  if (!base) throw new Error('A derived horizon lost its base surface. Remove it from the model.');
  const zBase = resampleTo(await loadDepthDown(base), specOf(base), srcSpec);
  return proportionalSurface(zSrc, zBase, d.fraction);
}
