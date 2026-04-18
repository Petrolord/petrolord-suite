import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { isValidUUID } from '@/lib/utils';

/**
 * Hook to manage and check purchased modules/apps entitlements.
 * 
 * CORE LOGIC:
 * 1. Fetches 'purchased_modules' for the current organization (for Module/Hub access).
 * 2. Fetches 'app_seat_assignments' for the current user (for App Access).
 * 3. Builds a robust entitlement set.
 * 4. Provides 'isAllowed(identifier)' which checks these paths strictly.
 * 
 * SUPER ADMIN OVERRIDE:
 * - If the current user is a Super Admin (checked via useAuth), ALL CHECKS are bypassed.
 */
export const usePurchasedModules = () => {
  const { user, organization, isSuperAdmin } = useAuth();
  const [purchasedItems, setPurchasedItems] = useState({
    modules: new Set(),
    apps: new Set()
  });
  const [appToModuleMap, setAppToModuleMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const fetchedRef = useRef({ orgId: null, userId: null });
  
  const hasSuperAdminPrivileges = isSuperAdmin || user?.role === 'super_admin';

  const fetchPurchasedModules = useCallback(async () => {
    // ---------------------------------------------------------
    // SUPER ADMIN BYPASS:
    // Super Admins have implicit full access to everything.
    // ---------------------------------------------------------
    if (hasSuperAdminPrivileges) {
      setLoading(false);
      return;
    }

    if (!user || !organization?.id) {
      if (!user) setLoading(false);
      return;
    }

    fetchedRef.current = { orgId: organization.id, userId: user.id };

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch purchased entitlements for this org (Access to Hubs/Modules)
      const { data: purchases, error: dbError } = await supabase
        .from('purchased_modules')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('status', 'active')
        .gt('expiry_date', new Date().toISOString());

      if (dbError) throw dbError;

      // 2. Fetch Seat Assignments for this user (Access to Specific Apps)
      // Task 1: Check public.app_seat_assignments
      const { data: seatAssignments, error: seatError } = await supabase
        .from('app_seat_assignments')
        .select('app_id')
        .eq('user_id', user.id)
        .eq('organization_id', organization.id);

      if (seatError) throw seatError;
      
      // 3. Fetch master apps for ID <-> Slug mapping
      const { data: masterApps, error: appsError } = await supabase
        .from('master_apps')
        .select('id, slug, module_id, module');
      
      if (appsError) console.warn('Error fetching master apps for mapping:', appsError);

      // 4. Build Mappings
      const uuidToSlug = {};
      const slugToUuid = {};
      const appToModule = {}; 

      masterApps?.forEach(app => {
        if (app.id) {
            const id = app.id.toLowerCase();
            const slug = app.slug ? app.slug.toLowerCase() : null;
            const moduleSlug = app.module ? app.module.toLowerCase() : null;
            
            if (slug) {
                uuidToSlug[id] = slug;
                slugToUuid[slug] = id;
                if (moduleSlug) appToModule[slug] = moduleSlug;
            }
            if (moduleSlug) appToModule[id] = moduleSlug;
        }
      });

      setAppToModuleMap(appToModule);

      // 5. Populate Entitlements
      const modules = new Set();
      const apps = new Set();

      // Org Purchases define accessible MODULES (Hubs)
      purchases?.forEach(item => {
        if (item.module_id) modules.add(item.module_id.toLowerCase());
        if (item.module_uuid) modules.add(item.module_uuid.toLowerCase());
        if (item.module_name) modules.add(item.module_name.toLowerCase());
      });

      // User Seats define accessible APPS (Task 1: Filter/Add based on seat assignments)
      seatAssignments?.forEach(seat => {
          if (seat.app_id) {
              const id = seat.app_id.toLowerCase();
              apps.add(id); // Add UUID
              if (uuidToSlug[id]) apps.add(uuidToSlug[id]); // Add Slug for easier checking
          }
      });

      // Special Case: HSE Free
      if (organization.hse_enabled || organization.modules?.includes('HSE')) {
          modules.add('hse');
          apps.add('hse'); 
      }

      setPurchasedItems({ modules, apps });

    } catch (err) {
      console.error('Error fetching purchased modules:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user, organization, hasSuperAdminPrivileges]);

  useEffect(() => {
    fetchPurchasedModules();
  }, [fetchPurchasedModules]);

  /**
   * Check if user is allowed to access a specific app or module.
   */
  const isAllowed = useCallback((identifier, parentModuleId = null) => {
    // Super Admin Bypass
    if (hasSuperAdminPrivileges) {
        return true; 
    }

    if (loading) return false;
    if (!identifier) return false;

    const id = identifier.toLowerCase();
    
    // 1. Check Explicit App Seat (Strict App Check)
    if (purchasedItems.apps.has(id)) {
        return true;
    }

    // 2. Check Module Entitlement (Hub Access)
    if (purchasedItems.modules.has(id)) {
        return true;
    }

    // 3. HSE Special Case
    if (id === 'hse') return true; 

    return false;
  }, [purchasedItems, hasSuperAdminPrivileges, loading]);

  const isModuleActive = useCallback((moduleId) => {
    if (hasSuperAdminPrivileges) return true;
    if (loading) return false;
    if (!moduleId) return false;
    
    const id = moduleId.toLowerCase();
    if (id === 'hse') return true;

    return purchasedItems.modules.has(id);
  }, [purchasedItems, hasSuperAdminPrivileges, loading]);

  return {
    isAllowed,
    isModuleActive,
    loading: hasSuperAdminPrivileges ? false : loading,
    error,
    refresh: fetchPurchasedModules,
    purchasedApps: Array.from(purchasedItems.apps),
    purchasedModules: Array.from(purchasedItems.modules),
    accessible_app_ids: Array.from(purchasedItems.apps),
    debugData: { purchasedItems, appToModuleMap }
  };
};