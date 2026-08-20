// seismic_sessions CRUD (W1.2b): named workspace sessions and viewport
// bookmarks, user-scoped RLS, direct client calls (house pattern).
// (user_id, kind, name) is unique — saving under an existing name
// overwrites that row (upsert), which is the "save as" semantic users
// expect from session managers.

import { supabase } from '@/lib/customSupabaseClient';

export async function listSessions(kind = 'session') {
  const { data, error } = await supabase
    .from('seismic_sessions')
    .select('*')
    .eq('kind', kind)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load ${kind}s: ${error.message}`);
  return data || [];
}

export async function saveSession({ name, kind = 'session', payload }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('A session needs a name.');
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save sessions.');
  const { data, error } = await supabase
    .from('seismic_sessions')
    .upsert({
      user_id: user.id,
      kind,
      name: trimmed,
      payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,kind,name' })
    .select()
    .single();
  if (error) throw new Error(`Could not save ${kind}: ${error.message}`);
  return data;
}

export async function deleteSession(row) {
  const { error } = await supabase
    .from('seismic_sessions')
    .delete()
    .eq('id', row.id);
  if (error) throw new Error(`Could not delete ${row.kind}: ${error.message}`);
}
