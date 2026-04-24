import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export const useRiskRegister = () => {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { organization, user } = useAuth();

  const fetchRisks = useCallback(async () => {
    if (!organization?.id) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('risk_register')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setRisks(data || []);
    } catch (error) {
      console.error('Error fetching risks:', error);
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  const addRisk = async (riskData) => {
    try {
      const newRisk = {
        ...riskData,
        org_id: organization.id,
        created_by: user.id,
        risk_id: `RSK-${Math.floor(Math.random() * 10000)}`
      };
      const { data, error } = await supabase.from('risk_register').insert([newRisk]).select().single();
      if (error) throw error;
      setRisks([data, ...risks]);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const updateRisk = async (id, updates) => {
    try {
      const { data, error } = await supabase.from('risk_register').update(updates).eq('id', id).select().single();
      if (error) throw error;
      setRisks(risks.map(r => r.id === id ? data : r));
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const deleteRisk = async (id) => {
    try {
      const { error } = await supabase.from('risk_register').delete().eq('id', id);
      if (error) throw error;
      setRisks(risks.filter(r => r.id !== id));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return { risks, loading, addRisk, updateRisk, deleteRisk, refresh: fetchRisks };
};