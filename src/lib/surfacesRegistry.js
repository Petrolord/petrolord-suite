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

const BUCKET = 'surfaces';

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
 *   crsNote?, provenance?, grid: Float32Array}} s
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
