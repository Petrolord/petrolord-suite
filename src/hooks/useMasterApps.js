import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export const useMasterApps = (options = {}) => {
  const { isSuperAdminOverride = false } = options;
  const { user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchApps = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all columns including is_built
      let query = supabase
        .from('master_apps')
        .select('*')
        .order('display_order', { ascending: true });

      // If NOT overriding as super admin, apply strict display filters
      if (!isSuperAdminOverride) {
        // Only show apps that are Active or Coming Soon AND Functional AND Built
        query = query
          .in('status', ['Active', 'Coming Soon'])
          .eq('is_functional', true)
          .eq('is_built', true); 
      }

      const { data, error: err } = await query;

      if (err) throw err;
      setApps(data || []);
    } catch (err) {
      console.error('Error fetching master apps:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdminOverride]);

  useEffect(() => {
    if (user) {
      fetchApps();
    }
  }, [user, fetchApps]);

  const updateApp = async (id, updates) => {
    try {
      const { error } = await supabase
        .from('master_apps')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      await fetchApps(); // Refresh local state
      return { success: true };
    } catch (err) {
      console.error('Error updating app:', err);
      return { success: false, error: err };
    }
  };

  const getAppsByModule = useCallback((moduleId) => {
    if (!apps) return [];
    return apps.filter(app => app.module && app.module.toLowerCase() === moduleId.toLowerCase());
  }, [apps]);

  return {
    apps,
    loading,
    error,
    updateApp,
    getAppsByModule,
    refresh: fetchApps
  };
};