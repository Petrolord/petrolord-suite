// seismic_faults persistence — direct RLS calls, sticks as compact jsonb
// (see the migration comment for why faults deviate from the horizon
// blob pattern: a stick set is a few KB of hand-picked polylines).

import { supabase } from '@/lib/customSupabaseClient';

/**
 * @typedef {{points: {il:number, xl:number, s:number}[]}} FaultStick
 *  il/xl are 0-based grid indices; s is a sub-sample float (time down).
 */

/** @param {{volumeId: string, name: string, sticks: FaultStick[]}} p */
export async function saveFault({ volumeId, name, sticks }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save faults.');
  const { data, error } = await supabase.from('seismic_faults')
    .insert({ user_id: user.id, volume_id: volumeId, name, sticks })
    .select().single();
  if (error) throw new Error(`Could not save fault: ${error.message}`);
  return data;
}

export async function listFaults(volumeId) {
  const { data, error } = await supabase.from('seismic_faults')
    .select('*')
    .eq('volume_id', volumeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load faults: ${error.message}`);
  return data || [];
}

export async function deleteFault(fault) {
  const { error } = await supabase.from('seismic_faults')
    .delete().eq('id', fault.id);
  if (error) throw new Error(`Could not delete fault: ${error.message}`);
}
