import { usePurchasedModules } from '@/hooks/usePurchasedModules';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { isValidUUID } from '@/lib/utils';

/**
 * REFACTORED: Now serves as a wrapper around usePurchasedModules for backward compatibility
 * and seat-specific logic if needed.
 */
export const useAppAccess = () => {
  const { user, isSuperAdmin, organization } = useAuth();
  const { isAllowed, isModuleActive, loading: pmLoading, refresh, purchasedApps, purchasedModules } = usePurchasedModules();
  
  const [accessData, setAccessData] = useState({
    modules: [],
    apps: [],
    assignments: [],
    orgId: null,
    isAdmin: false,
    isSuperAdmin: false
  });
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);

  useEffect(() => {
    const fetchSeatAssignments = async () => {
      if (!user) {
        setAssignmentsLoading(false);
        return;
      }

      try {
        // Fetch User Role in Org
        const { data: orgUser } = await supabase
          .from('organization_users')
          .select('role, user_role')
          .eq('user_id', user.id)
          .single();

        const dbRole = orgUser?.user_role || orgUser?.role || 'viewer';
        const isAdmin = isSuperAdmin || user?.role === 'super_admin' || dbRole === 'admin' || dbRole === 'owner' || dbRole === 'org_admin';

        // Fetch seat assignments (legacy/seat specific check)
        const { data: assignments } = await supabase
          .from('app_seat_assignments')
          .select('*')
          .eq('user_id', user.id);

        setAccessData(prev => ({
          ...prev,
          assignments: assignments || [],
          orgId: (organization?.id && isValidUUID(organization.id)) ? organization.id : null,
          isAdmin,
          isSuperAdmin: isSuperAdmin || user?.role === 'super_admin',
          // Sync these with the purchased modules hook
          modules: purchasedModules,
          apps: purchasedApps
        }));

      } catch (err) {
        console.warn('Error fetching detailed seat assignments:', err);
      } finally {
        setAssignmentsLoading(false);
      }
    };

    fetchSeatAssignments();
  }, [user, isSuperAdmin, organization, purchasedApps, purchasedModules]);

  // Backward compatible 'hasAccess'
  const hasAccess = (appId) => {
    if (isSuperAdmin || user?.role === 'super_admin') {
      return true;
    }
    return isAllowed(appId);
  };

  return {
    ...accessData,
    hasAccess, // Primary check
    isAllowed, // Alias
    isModuleActive,
    loading: (isSuperAdmin || user?.role === 'super_admin') ? false : (pmLoading || assignmentsLoading),
    refreshAccess: refresh
  };
};