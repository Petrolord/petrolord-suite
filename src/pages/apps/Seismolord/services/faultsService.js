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
export async function saveFault({ volumeId, name, sticks, params }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save faults.');
  const { data, error } = await supabase.from('seismic_faults')
    .insert({
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
  // is_own drives read-only affordances on org-shared volumes (W4.1)
  return (data || []).map((f) => ({
    ...f, is_own: !!user && f.user_id === user.id,
  }));
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

export async function deleteFault(fault) {
  const { error } = await supabase.from('seismic_faults')
    .delete().eq('id', fault.id);
  if (error) throw new Error(`Could not delete fault: ${error.message}`);
}
