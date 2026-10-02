// rcp_prospects persistence + an in-memory twin for the auth-free
// /dev/prospect-risking harness (the house harness pattern). A prospect is
// the owner's; the owner can share it with the organisation (U2-014,
// src/lib/recordSharing). The in-memory version mirrors the same interface
// and the same rules.

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';
import { supabaseSharingStore, makeHarnessSharing, colleagueShared } from '@/lib/recordSharing';

// PP0 state kind (docs/scope/ProjectPortability-PLAN.md §4.3): version 1 is
// the current row shape; a future shape change bumps `current` and adds
// migrations[n]. Rows open through openStateRow, writes go through writeStamped.
const RCP_PROSPECT_KIND = 'rcp-prospect';
registerStateKind(RCP_PROSPECT_KIND, { current: 1, label: 'prospect' });

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to save prospects.');
  return user;
}

export function makeRegistryProspectsBackend() {
  return {
    // U2-014: listProspects stays "my prospects" (the inventory, the portfolio
    // and Risked Reserves Valuation count these); the ones colleagues shared
    // with the organisation come from listSharedProspects.
    async listProspects() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.from('rcp_prospects')
        .select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
      if (error) throw new Error(`Could not load prospects: ${error.message}`);
      return (data || []).map((r) => openStateRow(RCP_PROSPECT_KIND, r));
    },
    async listSharedProspects() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.from('rcp_prospects')
        .select('*').neq('user_id', user.id).order('updated_at', { ascending: false });
      if (error) throw new Error(`Could not load shared prospects: ${error.message}`);
      return (data || []).map((r) => openStateRow(RCP_PROSPECT_KIND, r));
    },
    async saveProspect(p) {
      const user = await requireUser();
      const row = { name: p.name, pg_factors: p.pgFactors || {}, inputs: p.inputs || {}, risked: p.risked || {} };
      if (p.id) {
        const { data, error } = await writeStamped(RCP_PROSPECT_KIND,
          { ...row, updated_at: new Date().toISOString() },
          (stamped) => supabaseSharingStore().update('rcp_prospects', p.id, stamped, { note: 'Prospect updated' }));
        if (error) throw new Error(error.name === 'RecordConflict' ? error.message : `Could not update prospect: ${error.message}`);
        return data;
      }
      const { data, error } = await writeStamped(RCP_PROSPECT_KIND,
        { user_id: user.id, ...row },
        (stamped) => supabase.from('rcp_prospects').insert(stamped).select().single());
      if (error) throw new Error(`Could not save prospect: ${error.message}`);
      return data;
    },
    async deleteProspect(p) {
      const { data, error } = await supabase.from('rcp_prospects').delete().eq('id', p.id).select('id');
      if (error) throw new Error(`Could not delete prospect: ${error.message}`);
      if (!data || !data.length) throw new Error('Only the owner can delete a prospect.');
    },
    // U2-014: rcp_prospects rows now include the prospects colleagues shared
    sharing: supabaseSharingStore(),
  };
}

export function makeInMemoryProspectsBackend(seed = [], { sharing = makeHarnessSharing(), sharedRows = false } = {}) {
  // U2-014: the rows live in the in-memory mirror of the sharing rules
  const T = 'rcp_prospects';
  const ME = sharing.me;
  sharing.db.seed(T, seed.map((r, i) => ({ id: `prospect-${i + 1}`, ...r })), { owner: ME });
  if (sharedRows) {
    sharing.db.seed(T, [colleagueShared({
      id: 'prospect-shared', name: 'Ada Deep (shared)', pg_factors: { trap: 0.6, reservoir: 0.5, charge: 0.8, seal: 0.7 },
      inputs: { mean: 60, unit: 'MMbbl', basis: 'recoverable' }, risked: { pg: 0.168, risked_mean: 10.08 },
    })]);
  }
  let seq = seed.length;
  return {
    async listProspects() { return (sharing.db.select(T, ME).data || []).filter((r) => r.user_id === ME); },
    async listSharedProspects() { return (sharing.db.select(T, ME).data || []).filter((r) => r.user_id !== ME); },
    async saveProspect(p) {
      if (p.id) {
        const { data, error } = await sharing.store.update(T, p.id, { name: p.name, pg_factors: p.pgFactors, inputs: p.inputs, risked: p.risked }, { note: 'Prospect updated' });
        if (error) throw new Error(error.message);
        return data;
      }
      seq += 1;
      const { data, error } = sharing.db.insert(T, ME, { id: `prospect-${seq}`, user_id: ME, name: p.name, pg_factors: p.pgFactors || {}, inputs: p.inputs || {}, risked: p.risked || {} });
      if (error) throw new Error(error.message);
      return data;
    },
    async deleteProspect(p) {
      const { data } = sharing.db.remove(T, ME, p.id);
      if (!data || !data.length) throw new Error((sharing.db.select(T, ME).data || []).some((r) => r.id === p.id) ? 'Only the owner can delete a prospect.' : 'Prospect not found.');
    },
    sharing: sharing.store,
    /** test seam */
    _sharing: sharing,
  };
}
