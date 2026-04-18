import { supabase } from '@/lib/customSupabaseClient';

export const complianceRegulatorsService = {
  async getRegulators(orgId) {
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('regulatory_authorities')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async addRegulator(regulatorData) {
    const { data, error } = await supabase
      .from('regulatory_authorities')
      .insert([regulatorData])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateRegulator(id, regulatorData) {
    const { data, error } = await supabase
      .from('regulatory_authorities')
      .update({ ...regulatorData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteRegulator(id) {
    const { error } = await supabase
      .from('regulatory_authorities')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }
};