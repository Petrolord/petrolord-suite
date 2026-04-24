import { supabase } from '@/lib/customSupabaseClient';

export const complianceRecordsService = {
  async getRecords(orgId) {
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('regulatory_obligations')
      .select(`
        *,
        authority:regulatory_authorities(name, acronym),
        owner:users!regulatory_obligations_owner_id_fkey(email, raw_user_meta_data)
      `)
      .eq('org_id', orgId)
      .order('due_date', { ascending: true });
      
    if (error) throw error;
    return data || [];
  },

  async addRecord(recordData) {
    const { data, error } = await supabase
      .from('regulatory_obligations')
      .insert([recordData])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateRecord(id, recordData) {
    const { data, error } = await supabase
      .from('regulatory_obligations')
      .update({ ...recordData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteRecord(id) {
    const { error } = await supabase
      .from('regulatory_obligations')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }
};