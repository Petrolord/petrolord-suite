// geo_surfaces registry persistence (Mapping & Surface Studio G4) —
// direct RLS calls (the wellsRegistry house pattern). Table + policies:
// supabase/migrations/20260713260000_create_geo_surfaces.sql.
//
// The grid is a little-endian float32 object (row-major nx*ny) in the
// private `surfaces` bucket at {user_id}/{surface_id}/grid.f32 — never
// large jsonb (the brick rule). Surface ids are generated client-side
// so the storage path and the metadata row write atomically. Sharing
// is the geo_wells model: private by default, org read-only, owner-only
// writes, enforced by RLS server-side.

import { supabase } from '@/lib/customSupabaseClient';
import { writeXYZ } from '@/lib/gridding/surfaceExport';

// Depth convention of every row here: elevation (negative below datum)
// in metres or feet per z_unit. Helpers live in a pure module so
// consumers without a Supabase client can test against them.
export {
  SURFACE_Z_CONVENTION, surfaceZSign, surfaceZUnitToM, zConventionForImport,
  surfaceZToDepthDown, depthDownToSurfaceZ,
} from '@/lib/surfaceConvention';

const BUCKET = 'surfaces';

/**
 * Bridge a geo_surfaces grid to XYZ text — the format ReservoirCalc
 * Pro's SurfaceParser reads reliably. Reuses the byte-golden writeXYZ.
 * This is the in-DB handoff: Mapping Studio publishes a surface, RCP
 * imports it for GRV without any filesystem round-trip. z is passed
 * through as stored: elevation (negative below datum) in the row's
 * z_unit; the dialog reads the convention through zConventionForImport.
 * @param {{origin_x,origin_y,nx,ny,dx,dy}} surface @param {Float32Array} grid
 */
export function surfaceToXyzText(surface, grid) {
  const x = Array.from({ length: surface.nx }, (_, c) => surface.origin_x + c * surface.dx);
  const y = Array.from({ length: surface.ny }, (_, r) => surface.origin_y + r * surface.dy);
  return writeXYZ({ x, y, z: grid, nx: surface.nx, ny: surface.ny, dx: surface.dx, dy: surface.dy });
}

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to use the surface registry.');
  return user;
}

/** Own surfaces + surfaces shared with the caller's org (RLS filters;
 *  is_own is derived for the UI). */
export async function listSurfaces() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('geo_surfaces').select('*').order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load surfaces: ${error.message}`);
  return (data || []).map((s) => ({ ...s, is_own: !!user && s.user_id === user.id }));
}

/**
 * Persist a gridded surface: upload the f32 grid, then insert the
 * metadata row pointing at it; a failed insert removes the fresh
 * object so nothing orphans.
 * @param {{name, kind?, spec:{x0,y0,dx,dy,nx,ny}, zDomain?, zUnit?,
 *   crs?, xyUnit?, crsProvenance?, crsNote?, provenance?,
 *   grid: Float32Array}} s
 *   crs is the structured tag the grid frame is IN (CRS program):
 *   'EPSG:<code>' | 'CUSTOM:<uuid>' | 'LOCAL'; null/absent = unknown
 *   placement (badge in consumers). crs_note stays free-text context.
 */
export async function saveSurface(s) {
  const user = await requireUser();
  const id = crypto.randomUUID();
  const path = `${user.id}/${id}/grid.f32`;
  const { spec } = s;
  if (s.grid.length !== spec.nx * spec.ny) {
    throw new Error('Grid length does not match nx*ny.');
  }

  const { error: upError } = await supabase.storage.from(BUCKET)
    .upload(path, new Blob([s.grid.buffer], { type: 'application/octet-stream' }), {
      contentType: 'application/octet-stream', upsert: false,
    });
  if (upError) throw new Error(`Could not upload surface grid: ${upError.message}`);

  const { data, error } = await supabase.from('geo_surfaces')
    .insert({
      id,
      user_id: user.id,
      name: s.name,
      kind: s.kind || 'structure',
      origin_x: spec.x0,
      origin_y: spec.y0,
      nx: spec.nx,
      ny: spec.ny,
      dx: spec.dx,
      dy: spec.dy,
      z_domain: s.zDomain || 'depth',
      z_unit: s.zUnit || null,
      crs: s.crs || null,
      xy_unit: s.xyUnit || null,
      crs_provenance: s.crsProvenance || null,
      crs_note: s.crsNote || null,
      provenance: s.provenance || {},
      storage_path: path,
    })
    .select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`Could not save surface ${s.name}: ${error.message}`);
  }
  return data;
}

/** Fetch a surface's grid. Works for org-shared surfaces too — the
 *  storage read policy resolves the owning surface from the path. */
export async function downloadSurfaceGrid(surface) {
  const { data, error } = await supabase.storage.from(BUCKET).download(surface.storage_path);
  if (error) throw new Error(`Could not download surface ${surface.name}: ${error.message}`);
  const buf = await data.arrayBuffer();
  if (buf.byteLength !== surface.nx * surface.ny * 4) {
    throw new Error(`Surface ${surface.name}: object is ${buf.byteLength} bytes but the `
      + `metadata says ${surface.nx * surface.ny} float32 nodes — re-grid it.`);
  }
  return new Float32Array(buf);
}

/**
 * Replace a surface's grid IN PLACE (a re-grid, Mapping MS2): the f32
 * object is overwritten at the same storage path and the row's frame
 * and provenance are updated, so consumers holding the id (Earth
 * Modeling stacks, ReservoirCalc imports) keep pointing at it.
 * Owner-only: the path prefix is the caller's id.
 * @param {{id, storage_path, name}} surface
 * @param {{spec:{x0,y0,dx,dy,nx,ny}, grid:Float32Array, kind?, zDomain?, zUnit?,
 *   crs?, xyUnit?, crsProvenance?, provenance?}} s
 */
export async function replaceSurfaceGrid(surface, s) {
  const user = await requireUser();
  if (!surface?.storage_path?.startsWith(`${user.id}/`)) {
    throw new Error('Only the owner can re-grid this surface (org sharing is read-only).');
  }
  const { spec } = s;
  if (s.grid.length !== spec.nx * spec.ny) throw new Error('Grid length does not match nx*ny.');
  const { error: upError } = await supabase.storage.from(BUCKET)
    .upload(surface.storage_path, new Blob([s.grid.buffer], { type: 'application/octet-stream' }), {
      contentType: 'application/octet-stream', upsert: true,
    });
  if (upError) throw new Error(`Could not replace the surface grid: ${upError.message}`);
  return updateSurface(surface.id, {
    kind: s.kind || surface.kind || 'structure',
    origin_x: spec.x0,
    origin_y: spec.y0,
    nx: spec.nx,
    ny: spec.ny,
    dx: spec.dx,
    dy: spec.dy,
    z_domain: s.zDomain || surface.z_domain || 'depth',
    z_unit: s.zUnit === undefined ? surface.z_unit : s.zUnit,
    crs: s.crs === undefined ? surface.crs : s.crs,
    xy_unit: s.xyUnit === undefined ? surface.xy_unit : s.xyUnit,
    crs_provenance: s.crsProvenance === undefined ? surface.crs_provenance : s.crsProvenance,
    provenance: s.provenance || surface.provenance || {},
  });
}

/** Owner-only metadata update (RLS re-checks; org readers get no row
 *  back and that surfaces as an error, not a silent no-op). */
export async function updateSurface(surfaceId, patch) {
  const { data, error } = await supabase.from('geo_surfaces')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', surfaceId).select().single();
  if (error) throw new Error(`Could not update surface: ${error.message}`);
  return data;
}

// ---- org sharing (the geo_wells model) -----------------------------------

/** Share a surface (metadata row + grid object) read-only with an
 *  organization the owner belongs to. RLS re-checks membership. */
export async function shareSurface(surfaceId, organizationId) {
  if (!organizationId) throw new Error('Pick the organization to share with.');
  return updateSurface(surfaceId, { organization_id: organizationId });
}

/** Back to private. Org members lose read access immediately. */
export async function unshareSurface(surfaceId) {
  return updateSurface(surfaceId, { organization_id: null });
}

export async function deleteSurface(surface) {
  const user = await requireUser();
  if (surface.storage_path?.startsWith(`${user.id}/`)) {
    const { error: rmError } = await supabase.storage.from(BUCKET).remove([surface.storage_path]);
    if (rmError) throw new Error(`Could not delete the surface grid: ${rmError.message}`);
  }
  const { data, error } = await supabase.from('geo_surfaces')
    .delete().eq('id', surface.id).select('id');
  if (error) throw new Error(`Could not delete surface: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete this surface (org sharing is read-only).');
  }
}
