// rcp_prospects persistence + an in-memory twin for the auth-free
// /dev/prospect-risking harness (the house harness pattern). Owner-only
// RLS; the in-memory version mirrors the same interface.

import { supabase } from '@/lib/customSupabaseClient';

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to save prospects.');
  return user;
}

export function makeRegistryProspectsBackend() {
  return {
    async listProspects() {
      const { data, error } = await supabase.from('rcp_prospects')
        .select('*').order('updated_at', { ascending: false });
      if (error) throw new Error(`Could not load prospects: ${error.message}`);
      return data || [];
    },
    async saveProspect(p) {
      const user = await requireUser();
      const row = { name: p.name, pg_factors: p.pgFactors || {}, inputs: p.inputs || {}, risked: p.risked || {} };
      if (p.id) {
        const { data, error } = await supabase.from('rcp_prospects')
          .update({ ...row, updated_at: new Date().toISOString() }).eq('id', p.id).select().single();
        if (error) throw new Error(`Could not update prospect: ${error.message}`);
        return data;
      }
      const { data, error } = await supabase.from('rcp_prospects')
        .insert({ user_id: user.id, ...row }).select().single();
      if (error) throw new Error(`Could not save prospect: ${error.message}`);
      return data;
    },
    async deleteProspect(p) {
      const { data, error } = await supabase.from('rcp_prospects').delete().eq('id', p.id).select('id');
      if (error) throw new Error(`Could not delete prospect: ${error.message}`);
      if (!data || !data.length) throw new Error('Prospect not found.');
    },
  };
}

export function makeInMemoryProspectsBackend(seed = []) {
  let rows = seed.map((r, i) => ({ id: `prospect-${i + 1}`, ...r }));
  let seq = seed.length;
  return {
    async listProspects() { return [...rows]; },
    async saveProspect(p) {
      if (p.id) {
        rows = rows.map((r) => (r.id === p.id ? { ...r, name: p.name, pg_factors: p.pgFactors, inputs: p.inputs, risked: p.risked } : r));
        return rows.find((r) => r.id === p.id);
      }
      seq += 1;
      const row = { id: `prospect-${seq}`, name: p.name, pg_factors: p.pgFactors || {}, inputs: p.inputs || {}, risked: p.risked || {} };
      rows = [row, ...rows];
      return row;
    },
    async deleteProspect(p) {
      const before = rows.length;
      rows = rows.filter((r) => r.id !== p.id);
      if (rows.length === before) throw new Error('Prospect not found.');
    },
  };
}
