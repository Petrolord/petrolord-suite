// seismic_wells persistence — direct RLS calls (house pattern). Wells
// are PER-USER and volume-independent (world coordinates; they appear
// on any survey that contains them via the measured affine), so no
// volume id anywhere here. Payload shapes match the migration comment:
//   deviation:  [{md, inc, azi}]   md ascending (validated at import)
//   tops:       [{name, md}]
//   checkshots: [{tvdss_m, twt_ms}] strictly monotonic (validated)

import { supabase } from '@/lib/customSupabaseClient';

/**
 * @param {{name: string, uwi?: ?string, surfaceX: number, surfaceY: number,
 *   kbM?: number, tdMdM?: ?number, deviation?: Array, tops?: Array,
 *   checkshots?: Array}} w
 */
export async function saveWell(w) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save wells.');
  const { data, error } = await supabase.from('seismic_wells')
    .insert({
      user_id: user.id,
      name: w.name,
      uwi: w.uwi || null,
      surface_x: w.surfaceX,
      surface_y: w.surfaceY,
      kb_m: w.kbM ?? 0,
      td_md_m: w.tdMdM ?? null,
      deviation: w.deviation || [],
      tops: w.tops || [],
      checkshots: w.checkshots || [],
    })
    .select().single();
  if (error) throw new Error(`Could not save well: ${error.message}`);
  return data;
}

export async function listWells() {
  const { data, error } = await supabase.from('seismic_wells')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load wells: ${error.message}`);
  return data || [];
}

export async function deleteWell(well) {
  const { error } = await supabase.from('seismic_wells')
    .delete().eq('id', well.id);
  if (error) throw new Error(`Could not delete well: ${error.message}`);
}
