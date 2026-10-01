// seismic_faults persistence — direct RLS calls, sticks as compact jsonb
// (see the migration comment for why faults deviate from the horizon
// blob pattern: a stick set is a few KB of hand-picked polylines).

import { supabase } from '@/lib/customSupabaseClient';
import { loftFaultSurface } from '../engine/faultObjects';

/**
 * @typedef {{points: {il:number, xl:number, s:number}[]}} FaultStick
 *  il/xl are 0-based grid indices; s is a sub-sample float (time down).
 */

/** @param {{volumeId: string, name: string, sticks: FaultStick[],
 *   params?: Object}} p params carries provenance (import source) in
 *   the seismic_horizons.params shape; omitted for hand-picked faults.
 *  The lofted surface (W3.1) is derived here — the single write choke
 *  point — so every writer (draft save, undo restore, stick import)
 *  persists it consistently; single-stick faults store null. */
export async function saveFault({
  volumeId, name, sticks, params, id = null,
}) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save faults.');
  const { data, error } = await supabase.from('seismic_faults')
    .insert({
      // U2-017: an undo of a delete restores the fault under its own id
      ...(id ? { id } : {}),
      user_id: user.id,
      volume_id: volumeId,
      name,
      sticks,
      surface: loftFaultSurface(sticks),
      // W4.3 attribution (the version-chain columns are schema-ready;
      // the fault History UI is a recorded follow-on)
      interpreter: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
      ...(params ? { params } : {}),
    })
    .select().single();
  if (error) throw new Error(`Could not save fault: ${error.message}`);
  return data;
}

export async function listFaults(volumeId) {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('seismic_faults')
      .select('*')
      .eq('volume_id', volumeId)
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load faults: ${error.message}`);
  // is_own drives read-only affordances on org-shared volumes (W4.1);
  // U2-017: archived versions are listed by listFaultVersions, not here
  return (data || []).filter((f) => !f.archived_at).map((f) => ({
    ...f, is_own: !!user && f.user_id === user.id,
  }));
}

/** U2-017: a fault's archived versions on a volume (the History menu). */
export async function listFaultVersions(volumeId) {
  const { data, error } = await supabase.from('seismic_faults')
    .select('*')
    .eq('volume_id', volumeId)
    .not('archived_at', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load fault versions: ${error.message}`);
  return data || [];
}

/** Archived ancestors of a head, newest first (parent_version_id walk). */
export function faultChainOf(head, versions) {
  const byId = new Map((versions || []).map((v) => [v.id, v]));
  const chain = [];
  const seen = new Set();
  let cur = byId.get(head?.parent_version_id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = byId.get(cur.parent_version_id);
  }
  return chain;
}

/**
 * U2-017: a new head version of a fault (the W4.3 chain columns): a fresh
 * row with version + 1 pointing at the old head, which is archived.
 * History never rewrites; restoring a version is another new head.
 */
export async function saveFaultVersion({ fault, sticks = null, params = null }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save versions.');
  const useSticks = sticks || fault.sticks;
  const { data: head, error } = await supabase.from('seismic_faults')
    .insert({
      user_id: user.id,
      volume_id: fault.volume_id,
      name: fault.name,
      sticks: useSticks,
      surface: loftFaultSurface(useSticks),
      params: { ...(fault.params || {}), ...(params || {}) },
      version: (fault.version || 1) + 1,
      parent_version_id: fault.id,
      interpreter: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
    })
    .select().single();
  if (error) throw new Error(`Could not save the fault version: ${error.message}`);
  const { error: archiveError } = await supabase.from('seismic_faults')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', fault.id);
  if (archiveError) throw new Error(`Version created, but the old head could not be archived: ${archiveError.message}`);
  return head;
}

/** Replace a fault's sticks in place (stick edit session save). Goes
 *  through the same loft choke point as saveFault so the derived
 *  surface never drifts from the sticks. */
export async function updateFaultSticks(fault, sticks) {
  const { data, error } = await supabase.from('seismic_faults')
    .update({
      sticks,
      surface: loftFaultSurface(sticks),
      updated_at: new Date().toISOString(),
    })
    .eq('id', fault.id)
    .select().single();
  if (error) throw new Error(`Could not update fault: ${error.message}`);
  return data;
}

/**
 * Persist fault display settings (colour, line weight, opacity) and/or a
 * rename WITHOUT touching the sticks: params.display is merged into the
 * stored params jsonb, the mirror of updateHorizonMeta. No schema change
 * (params already exists on seismic_faults).
 *
 * @param {Object} p
 * @param {Object} p.fault seismic_faults row
 * @param {Object} [p.display] display settings stored under params.display
 * @param {string} [p.name] new fault name
 * @returns {Promise<Object>} the refreshed row
 */
export async function updateFaultMeta({ fault, display, name }) {
  const patch = {};
  if (display !== undefined) {
    patch.params = { ...(fault.params || {}), display };
  }
  if (name !== undefined && name !== fault.name) patch.name = name;
  if (!Object.keys(patch).length) return fault;
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('seismic_faults')
    .update(patch)
    .eq('id', fault.id)
    .select().single();
  if (error) throw new Error(`Could not save fault settings: ${error.message}`);
  return data;
}

export async function deleteFault(fault, chain = []) {
  const ids = [fault.id, ...(chain || []).map((v) => v.id)];
  const { error } = await supabase.from('seismic_faults')
    .delete().in('id', ids);
  if (error) throw new Error(`Could not delete fault: ${error.message}`);
}
