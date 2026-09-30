// Where the Contour Map Digitizer keeps its projects and publishes its
// surfaces (MAP-U1-028, 2026-09-30). The page uses the registry backend
// (contour_projects under RLS, geo_surfaces through surfacesRegistry); the
// /dev/contour-map-digitizer harness uses the in-memory one, so the browser
// path runs without auth or a database. Same contract both ways.

import { supabase } from '@/lib/customSupabaseClient';
import { saveSurface } from '@/lib/surfacesRegistry';

export const registryDigitizerBackend = {
  async listProjects() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from('contour_projects')
      .select('id, project_name, created_at').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async getProject(id) {
    const { data, error } = await supabase.from('contour_projects').select('*').eq('id', id).single();
    if (error) throw new Error(error.message);
    return data;
  },
  async saveProject(row) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sign in to save a digitizer project.');
    // a new project has no id yet: leave it to the column default
    const { id, ...rest } = row;
    const { data, error } = await supabase.from('contour_projects')
      .upsert({ ...(id ? { id } : {}), ...rest, user_id: user.id }, { onConflict: 'id' }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  saveSurface,
};

/** In-memory projects and surfaces for the dev harness and tests. */
export function makeInMemoryDigitizerBackend() {
  const projects = [];
  const surfaces = [];
  let n = 0;
  return {
    surfaces,
    async listProjects() { return projects.map(({ id, project_name, created_at }) => ({ id, project_name, created_at })); },
    async getProject(id) {
      const p = projects.find((x) => x.id === id);
      if (!p) throw new Error('Project not found.');
      return JSON.parse(JSON.stringify(p));
    },
    async saveProject(row) {
      const id = row.id || `proj-${++n}`;
      const saved = { ...JSON.parse(JSON.stringify(row)), id, created_at: new Date(2026, 8, 30, 12, 0, n).toISOString() };
      const i = projects.findIndex((x) => x.id === id);
      if (i >= 0) projects[i] = saved; else projects.push(saved);
      return { ...saved };
    },
    async saveSurface(s) {
      const id = `dig-surf-${++n}`;
      const row = { id, name: s.name, kind: s.kind || 'structure', z_domain: s.zDomain || 'depth', z_unit: s.zUnit || null, crs: s.crs || null, nx: s.spec.nx, ny: s.spec.ny, dx: s.spec.dx, dy: s.spec.dy, origin_x: s.spec.x0, origin_y: s.spec.y0, provenance: s.provenance || {} };
      surfaces.push({ row, grid: s.grid });
      return row;
    },
  };
}
