// The Supabase transport of the sharing store (see store.js). Direct client
// calls under row level security; the database is the authority.

import { supabase } from '@/lib/customSupabaseClient';
import { resolveUserOrgId } from '@/lib/orgContext';
import { tableSpec, SHARING_COLUMNS } from './rules';

const sharingSelect = (table) => {
  const cols = SHARING_COLUMNS.filter((c) => !(c === 'visibility' && tableSpec(table).sharedWhen === 'organization_id'));
  return ['id', 'user_id', tableSpec(table).nameColumn, ...cols].join(', ');
};

export const supabaseTransport = {
  async user() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return { id: user.id, organizationId: await resolveUserOrgId(user.id).catch(() => null) };
  },
  /** True when the table has the sharing columns (the migration is applied). */
  async probe(table) {
    const { error } = await supabase.from(table).select('id, org_access, version').limit(1);
    return !error;
  },
  async getSharing(table, id) {
    const { data, error } = await supabase.from(table).select(sharingSelect(table)).eq('id', id).limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  },
  // no .single(): a write the policies hide comes back as zero rows, which
  // the store explains to the user
  async update(table, id, body, { select = '*' } = {}) {
    return supabase.from(table).update(body).eq('id', id).select(select);
  },
  async rpc(fn, args) {
    return supabase.rpc(fn, args);
  },
  async changes(table, id, limit) {
    return supabase.from('suite_record_changes')
      .select('id, action, summary, changed_fields, change_count, changed_by, changed_at')
      .eq('table_name', table).eq('record_id', id)
      .order('id', { ascending: false }).limit(limit);
  },
  /**
   * Display names from the membership list (the lookup Wellsite Studio uses):
   * the member's full name, or their email where no name is set. Row level
   * security shows a member only the rows of their own organisation, so a
   * person outside it has no entry here and reads "A colleague".
   */
  async names(ids) {
    const { data, error } = await supabase.from('organization_members').select('user_id, full_name, email').in('user_id', ids);
    if (error) return {};
    const out = {};
    for (const r of data || []) {
      const name = r.full_name || r.email || null;
      if (r.user_id && name && (!out[r.user_id] || r.full_name)) out[r.user_id] = name;
    }
    return out;
  },
};
