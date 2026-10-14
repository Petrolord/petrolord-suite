// Named, reusable crop definitions (crop before upload, 2026-10-14). One
// definition cuts every volume of a study (the angle stacks, the velocity
// volumes, later the gathers) to the same inline and crossline area, so they
// line up trace for trace. Stored in public.seismic_crop_definitions
// (migration 20261014220000): owner rows, readable by the organisation when
// shared. Before that table exists the crops are kept in this browser only.
import { supabase } from '@/lib/customSupabaseClient';
import { myOrgId } from './surfacesService';

const TABLE = 'seismic_crop_definitions';
const LOCAL_KEY = 'seismolord.cropDefinitions.v1';

export const isMissingTable = (error) => {
  const msg = String(error?.message || '');
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202'
    || (/seismic_crop_definitions/.test(msg) && /does not exist|could not find/i.test(msg));
};

/** The saved form of a crop: what the user chose, not the snapped result. */
export function definitionPayload(def) {
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const range = (r) => (r && (num(r.from) != null || num(r.to) != null) ? { from: num(r.from), to: num(r.to) } : null);
  return {
    schema: 1,
    il: range(def.il),
    xl: range(def.xl),
    polygon: Array.isArray(def.polygon) && def.polygon.length >= 3 ? def.polygon.map(([a, b]) => [Number(a), Number(b)]) : null,
    window: range(def.window),
    domain: def.domain === 'depth' ? 'depth' : 'time',
    decimate: { il: Math.max(1, Number(def.decimate?.il) || 1), xl: Math.max(1, Number(def.decimate?.xl) || 1) },
    note: typeof def.note === 'string' ? def.note.slice(0, 500) : '',
  };
}

/** The velocity-volume preset: the same lateral crop, from 0 down to the window's end. */
export function velocityPreset(def) {
  return { ...def, window: def.window ? { from: 0, to: def.window.to } : null, startAtZero: true };
}

const localStore = (storage) => ({
  list() {
    try { return JSON.parse(storage?.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
  },
  write(rows) {
    try { storage?.setItem(LOCAL_KEY, JSON.stringify(rows)); } catch { /* private window */ }
  },
});

/**
 * @param {Object} [deps] client (supabase-like), orgId () => Promise<?string>,
 *   storage (localStorage-like), now () => ISO string
 */
export function createCropDefinitions(deps = {}) {
  const client = deps.client || supabase;
  const orgId = deps.orgId || myOrgId;
  const local = localStore(deps.storage ?? (typeof localStorage === 'undefined' ? null : localStorage));
  const now = deps.now || (() => new Date().toISOString());
  let missing = false;

  async function list() {
    if (!missing) {
      const { data, error } = await client.from(TABLE).select('*').order('name', { ascending: true });
      if (!error) {
        const { data: u } = await client.auth.getUser();
        const me = u?.user?.id;
        return { rows: (data || []).map((r) => ({ ...r, is_own: r.user_id === me })), saved: true };
      }
      if (!isMissingTable(error)) throw new Error(`Could not read the saved crops: ${error.message}`);
      missing = true;
    }
    return { rows: local.list().map((r) => ({ ...r, is_own: true, local: true })), saved: false };
  }

  async function save({ id = null, name, definition, shared = false }) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Give the crop a name.');
    if (clean.length > 120) throw new Error('A crop name has at most 120 characters.');
    const payload = definitionPayload(definition);
    if (!missing) {
      let organization_id = null;
      if (shared) {
        organization_id = await orgId();
        if (!organization_id) throw new Error('You belong to no organization, so there is nobody to share the crop with.');
      }
      const row = { name: clean, definition: payload, organization_id, updated_at: now() };
      const q = id ? client.from(TABLE).update(row).eq('id', id) : client.from(TABLE).insert(row);
      const { data, error } = await q.select().single();
      if (!error) return { ...data, is_own: true };
      if (error.code === '23505') throw new Error(`You already have a crop called "${clean}". Choose another name or update that one.`);
      if (!isMissingTable(error)) throw new Error(`Could not save the crop: ${error.message}`);
      missing = true;
    }
    const rows = local.list();
    const dup = rows.find((r) => r.name.toLowerCase() === clean.toLowerCase() && r.id !== id);
    if (dup) throw new Error(`You already have a crop called "${clean}". Choose another name or update that one.`);
    const rec = { id: id || `local-${Date.now().toString(36)}`, name: clean, definition: payload, organization_id: null, updated_at: now() };
    local.write([...rows.filter((r) => r.id !== rec.id), rec]);
    return { ...rec, is_own: true, local: true };
  }

  async function remove(id) {
    if (!missing && !String(id).startsWith('local-')) {
      const { error } = await client.from(TABLE).delete().eq('id', id);
      if (!error) return;
      if (!isMissingTable(error)) throw new Error(`Could not delete the crop: ${error.message}`);
      missing = true;
    }
    local.write(local.list().filter((r) => r.id !== id));
  }

  return { list, save, remove, isLocalOnly: () => missing };
}

let shared = null;
export const cropDefinitions = () => { if (!shared) shared = createCropDefinitions(); return shared; };
