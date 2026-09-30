// Suite unit profile I/O (table public.suite_unit_settings, migration
// 20260930210000_suite_unit_settings.sql).
//
// Reads the caller's user row, the organisation default and the legacy
// geoscience_settings.depth_unit, once per page load (a module cache) with
// a sessionStorage snapshot so a reload paints the right units at once.
// When the table is not there yet (42P01 / PGRST205: the migration is not
// applied) everything falls back quietly: legacy depth plus the built-in
// preset, and "My units" is kept in this browser until the table exists.
//
// The profile is a display and input preference. Nothing here, and
// nothing that reads it, ever converts stored data.

import { supabase } from '@/lib/customSupabaseClient';
import { PLATFORM_BUILD } from '@/lib/platformBuild';
import { normalizeProfile } from './presets';

export const TABLE = 'suite_unit_settings';
const COLUMNS = 'id, scope, organization_id, user_id, profile, updated_by, updated_at';
export const SNAPSHOT_PREFIX = 'petrolord.units.layers.v1:';
export const LOCAL_USER_PREFIX = 'petrolord.units.user.v1:';

export const isMissingTable = (error) => !!error && (
  ['42P01', 'PGRST205'].includes(String(error.code))
  || /relation .*suite_unit_settings.* does not exist|Could not find the table .*suite_unit_settings/i.test(String(error.message || ''))
);

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const session = () => safe(() => (typeof window !== 'undefined' ? window.sessionStorage : null));
const local = () => safe(() => (typeof window !== 'undefined' ? window.localStorage : null));

/** The layers remembered for this browser tab, or null. */
export function readSnapshot(userId) {
  if (!userId) return null;
  return safe(() => {
    const raw = session()?.getItem(SNAPSHOT_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  });
}
function writeSnapshot(userId, layers) {
  if (!userId) return;
  safe(() => session()?.setItem(SNAPSHOT_PREFIX + userId, JSON.stringify(layers)));
}
export function clearSnapshot(userId) {
  if (!userId) return;
  safe(() => session()?.removeItem(SNAPSHOT_PREFIX + userId));
}

/** "My units" kept in this browser while the table is absent. */
export function readLocalUserProfile(userId) {
  return safe(() => normalizeProfile(JSON.parse(local()?.getItem(LOCAL_USER_PREFIX + (userId || 'anon')) || 'null')));
}
function writeLocalUserProfile(userId, profile) {
  safe(() => {
    const key = LOCAL_USER_PREFIX + (userId || 'anon');
    if (profile) local()?.setItem(key, JSON.stringify(profile)); else local()?.removeItem(key);
  });
}

async function readLegacyDepthUnit(client, userId) {
  // a plain read: getSettings() in crs/settingsService would create a row
  const { data, error } = await client.from('geoscience_settings').select('depth_unit').eq('user_id', userId).maybeSingle();
  if (error) return null;
  return data?.depth_unit === 'm' || data?.depth_unit === 'ft' ? data.depth_unit : null;
}

async function readAdminName(client, orgId, adminId) {
  if (!orgId || !adminId) return null;
  const { data, error } = await client.from('organization_members')
    .select('full_name, email').eq('organization_id', orgId).eq('user_id', adminId).maybeSingle();
  if (error || !data) return null;
  return data.full_name || data.email || null;
}

/**
 * Load the stored layers for a user and organisation.
 * @returns {Promise<{user: ?object, organization: ?object, legacyDepthUnit: ?string,
 *   tableAvailable: boolean, orgMeta: ?{updatedBy: ?string, updatedByName: ?string, updatedAt: ?string}}>}
 */
export async function fetchLayers({ userId, orgId, client = supabase } = {}) {
  const out = { user: null, organization: null, legacyDepthUnit: null, tableAvailable: true, orgMeta: null };
  if (!userId) return out;
  const legacyP = readLegacyDepthUnit(client, userId).catch(() => null);
  // two plain reads (user row, organisation row) run together
  const [userRes, orgRes] = await Promise.all([
    client.from(TABLE).select(COLUMNS).eq('scope', 'user').eq('user_id', userId).maybeSingle(),
    orgId
      ? client.from(TABLE).select(COLUMNS).eq('scope', 'organization').eq('organization_id', orgId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const error = userRes.error || orgRes.error;
  if (error) {
    if (!isMissingTable(error)) throw new Error(`Could not load unit settings: ${error.message}`);
    out.tableAvailable = false;
    out.user = readLocalUserProfile(userId);
  } else {
    const u = userRes.data || null;
    const o = orgRes.data || null;
    out.user = u ? normalizeProfile(u.profile) : null;
    out.organization = o ? normalizeProfile(o.profile) : null;
    if (o) {
      out.orgMeta = {
        updatedBy: o.updated_by || null,
        updatedByName: await readAdminName(client, orgId, o.updated_by).catch(() => null),
        updatedAt: o.updated_at || null,
      };
    }
  }
  out.legacyDepthUnit = await legacyP;
  return out;
}

// one load per page and user/organisation pair
let cache = { key: null, promise: null };
export function loadLayers({ userId, orgId, client = supabase, force = false } = {}) {
  const key = `${userId || ''}:${orgId || ''}`;
  if (!force && cache.key === key && cache.promise) return cache.promise;
  const promise = fetchLayers({ userId, orgId, client }).then((layers) => { writeSnapshot(userId, layers); return layers; });
  cache = { key, promise };
  promise.catch(() => { if (cache.promise === promise) cache = { key: null, promise: null }; });
  return promise;
}
export function invalidateLayers(userId) { cache = { key: null, promise: null }; clearSnapshot(userId); }

async function upsertRow(client, match, row) {
  const { data: found, error: findError } = await client.from(TABLE).select('id').match(match).maybeSingle();
  if (findError) throw findError;
  if (found) {
    // RLS turns a refused update into zero rows, not an error: count them
    const { data: changed, error } = await client.from(TABLE).update(row).eq('id', found.id).select('id');
    if (error) throw error;
    if (!changed || !changed.length) throw Object.assign(new Error('not permitted'), { code: '42501' });
    return;
  }
  const { error } = await client.from(TABLE).insert({ ...match, ...row });
  if (error && String(error.code) === '23505') {
    // a concurrent first save won the unique index; update the winner
    const { error: e2 } = await client.from(TABLE).update(row).match(match);
    if (e2) throw e2;
    return;
  }
  if (error) throw error;
}

/**
 * Save the caller's own units, or pass null to follow the organisation.
 * @returns {Promise<{stored: 'database'|'browser'}>}
 */
export async function saveUserProfile({ userId, profile, client = supabase }) {
  if (!userId) throw new Error('Sign in to save your units.');
  const clean = profile ? normalizeProfile(profile) : null;
  if (profile && !clean) throw new Error('That unit profile is not valid.');
  try {
    if (!clean) {
      const { error } = await client.from(TABLE).delete().match({ scope: 'user', user_id: userId });
      if (error) throw error;
    } else {
      await upsertRow(client, { scope: 'user', user_id: userId }, { profile: clean, updated_by: userId, app_build: PLATFORM_BUILD.sha });
    }
    writeLocalUserProfile(userId, null);
    invalidateLayers(userId);
    return { stored: 'database' };
  } catch (e) {
    if (!isMissingTable(e)) throw new Error(`Could not save your units: ${e.message}`);
    writeLocalUserProfile(userId, clean);
    invalidateLayers(userId);
    return { stored: 'browser' };
  }
}

/** Save (or clear with null) the organisation default. Organisation admins only (RLS). */
export async function saveOrgProfile({ userId, orgId, profile, client = supabase }) {
  if (!orgId) throw new Error('No organisation to save the default for.');
  const clean = profile ? normalizeProfile(profile) : null;
  if (profile && !clean) throw new Error('That unit profile is not valid.');
  try {
    if (!clean) {
      const { error } = await client.from(TABLE).delete().match({ scope: 'organization', organization_id: orgId });
      if (error) throw error;
    } else {
      await upsertRow(client, { scope: 'organization', organization_id: orgId }, { profile: clean, updated_by: userId, app_build: PLATFORM_BUILD.sha });
    }
  } catch (e) {
    if (isMissingTable(e)) {
      throw new Error('Organisation units are not switched on for this database yet. Your own units still work and stay in this browser.');
    }
    if (String(e.code) === '42501') throw new Error('Only an organisation admin can change the organisation default.');
    throw new Error(`Could not save the organisation default: ${e.message}`);
  }
  invalidateLayers(userId);
}
