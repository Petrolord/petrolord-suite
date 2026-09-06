// The real transport: the online-only edges of Wellsite Studio against
// Supabase (registry wells through src/lib/wellsRegistry.js, ws_wells and
// ws_well_members directly since they are this app's own tables). The
// record sync (push, pull) arrives in WS6 on the same object.

import { supabase } from '@/lib/customSupabaseClient';
import { listWells as listRegistry } from '@/lib/wellsRegistry';
import { writeStamped, registerStateKind } from '@/lib/stateVersion';

export const WS_WELL_KIND = 'ws-well';
registerStateKind(WS_WELL_KIND, { current: 1, label: 'wellsite well' });

export function makeSupabaseTransport() {
  return {
    kind: 'supabase',
    async currentUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: m } = await supabase.from('organization_members').select('organization_id, role, full_name').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      return { id: user.id, email: user.email, name: m?.full_name || user.email, organization_id: m?.organization_id || null, org_role: m?.role || null };
    },
    online() { return typeof navigator === 'undefined' ? true : navigator.onLine; },
    async listRegistryWells() { return listRegistry(); },
    async listWsWells() {
      const { data: wells, error } = await supabase.from('ws_wells').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      const ids = (wells || []).map((w) => w.id);
      let members = [];
      if (ids.length) {
        const { data: m, error: me } = await supabase.from('ws_well_members').select('*').in('well_id', ids);
        if (me) throw me;
        members = m || [];
      }
      return (wells || []).map((well) => ({ well, members: members.filter((m) => m.well_id === well.id) }));
    },
    async createWsWell(row) {
      const { data, error } = await writeStamped(WS_WELL_KIND, row, (r) => supabase.from('ws_wells').insert(r).select().single());
      if (error) throw new Error(error.message);
      const { data: members } = await supabase.from('ws_well_members').select('*').eq('well_id', data.id);
      return { well: data, members: members || [] };
    },
    async updateWsWell(id, patch) {
      const { data, error } = await supabase.from('ws_wells').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Only a well administrator can change the well settings.');
      return data[0];
    },
    async pullWell(id) {
      const { data: well, error } = await supabase.from('ws_wells').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!well) return null;
      const { data: members } = await supabase.from('ws_well_members').select('*').eq('well_id', id);
      return { well, members: members || [] };
    },
  };
}
