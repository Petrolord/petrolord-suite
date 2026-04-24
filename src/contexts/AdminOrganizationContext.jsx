import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

// Export the Context object itself
export const AdminOrganizationContext = createContext();

// Helper to validate UUID
const isValidUUID = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Export the Provider component with the specific name 'AdminOrgProvider'
export const AdminOrgProvider = ({ children, value }) => {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail'
  const { toast } = useToast();

  // --- Organization Actions ---

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrganizations(data);
    } catch (error) {
      console.error('Error fetching orgs:', error);
      toast({ variant: 'destructive', title: 'Failed to load organizations', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const selectOrganization = useCallback(async (orgId) => {
    if (!orgId) {
      setSelectedOrg(null);
      setViewMode('list');
      return;
    }

    setLoading(true);
    try {
      const org = organizations.find(o => o.id === orgId);
      
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();

      // If org is found in state use it, otherwise fetch it (handling direct link case)
      let orgData = org;
      if (!orgData) {
         const { data: fetchedOrg, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .single();
         if (!error) orgData = fetchedOrg;
      }

      if (orgData) {
          setSelectedOrg({ ...orgData, subscription: subData });
          setViewMode('detail');
      }
    } catch (error) {
      console.error('Error selecting org:', error);
      toast({ variant: 'destructive', title: 'Error loading organization details' });
    } finally {
      setLoading(false);
    }
  }, [organizations, toast]);

  const createOrganization = useCallback(async (orgData) => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .insert([orgData])
        .select()
        .single();

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'ORGANIZATION_CREATED',
        details: { name: orgData.name, email: orgData.contact_email },
        actor_id: (await supabase.auth.getUser()).data.user.id
      });

      setOrganizations(prev => [data, ...prev]);
      toast({ title: 'Organization Created', description: `${orgData.name} has been set up.` });
      return data;
    } catch (error) {
      toast({ variant: 'destructive', title: 'Creation Failed', description: error.message });
      return null;
    }
  }, [toast]);

  const updateOrganization = useCallback(async (orgId, updates) => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', orgId)
        .select()
        .single();

      if (error) throw error;

      setOrganizations(prev => prev.map(o => o.id === orgId ? data : o));
      if (selectedOrg?.id === orgId) {
        setSelectedOrg(prev => ({ ...prev, ...data }));
      }

      toast({ title: 'Organization Updated' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    }
  }, [selectedOrg, toast]);

  const deleteOrganization = useCallback(async (orgId) => {
    try {
      const { error } = await supabase.rpc('delete_organization', { org_id_to_delete: orgId });
      if (error) throw error;

      setOrganizations(prev => prev.filter(o => o.id !== orgId));
      if (selectedOrg?.id === orgId) {
        setSelectedOrg(null);
        setViewMode('list');
      }
      toast({ title: 'Organization Deleted' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: error.message });
    }
  }, [selectedOrg, toast]);

  // --- Personnel Actions ---

  const fetchOrgUsers = useCallback(async (orgId) => {
    // Guard: Ensure orgId is a valid UUID before calling RPC
    if (!orgId || !isValidUUID(orgId)) {
        console.warn("fetchOrgUsers called with invalid UUID:", orgId);
        return [];
    }

    const { data, error } = await supabase.rpc('get_users_for_organization', { org_id: orgId });
    if (error) {
      console.error("Fetch users error", error);
      return [];
    }
    return data;
  }, []);

  // Use provided value or internal state
  const contextValue = value || {
    organizations,
    selectedOrg,
    loading,
    viewMode,
    setViewMode,
    fetchOrganizations,
    selectOrganization,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    fetchOrgUsers
  };

  return (
    <AdminOrganizationContext.Provider value={contextValue}>
      {children}
    </AdminOrganizationContext.Provider>
  );
};

// Export hook
export const useAdminOrg = () => {
  const context = useContext(AdminOrganizationContext);
  if (!context) throw new Error('useAdminOrg must be used within AdminOrgProvider');
  return context;
};