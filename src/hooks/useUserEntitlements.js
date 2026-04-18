import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const CACHE_KEY = 'user_entitlements_v1';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useUserEntitlements() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEntitlements = useCallback(async (force = false) => {
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Check Cache
    if (!force) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_DURATION) {
            console.log('Using cached entitlements');
            setData(parsed.data);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error('Cache parse error', e);
          localStorage.removeItem(CACHE_KEY);
        }
      }
    }

    setLoading(true);
    try {
      // 2. Fetch from Edge Function
      const { data: responseData, error: responseError } = await supabase.functions.invoke('get-user-entitlements');

      if (responseError) throw responseError;

      // 3. Cache & Set
      setData(responseData);
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: responseData
      }));
      setError(null);
    } catch (err) {
      console.error('Failed to fetch entitlements:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEntitlements();
  }, [fetchEntitlements]);

  // --- Helpers ---

  /**
   * Checks if the user has access to a specific App ID.
   * @param {string} appId - The UUID of the master_app
   * @returns {boolean}
   */
  const hasAccessToApp = (appId) => {
    if (!data || !data.accessible_app_ids) return false;
    return data.accessible_app_ids.includes(appId);
  };

  /**
   * Alias for hasAccessToApp to maintain compatibility with older code if any
   */
  const checkAccess = hasAccessToApp;

  /**
   * Returns detailed access info for an app (expiry, seats, etc).
   * Finds the most relevant entitlement (direct app or module).
   * @param {string} appId 
   */
  const getAppAccessInfo = (appId) => {
    if (!data || !data.entitlements) return null;
    
    // Try to find specific app entitlement first
    let entitlement = data.entitlements.find(e => e.target_id === appId && e.type === 'app');
    
    // If not found, look for a module entitlement that covers this app?
    // This is harder without mapping the app to its module locally.
    // However, the edge function returns a flattened list of entitlements.
    // We might need to know the module_id of the app to check module entitlement.
    // For now, if we can't find direct app entitlement, return generic valid status if accessible.
    
    if (!entitlement && hasAccessToApp(appId)) {
        // Fallback: Return a generic "Active via Module" object if we know they have access 
        // but can't pinpoint the exact module entitlement object without more metadata.
        // Ideally, we'd pass the module_id here too, or the edge function would return a map.
        return { status: 'active', source: 'module_bundle' };
    }

    return entitlement || null;
  };

  /**
   * Checks if there is ANY active subscription.
   */
  const isSubscriptionActive = () => {
    if (!data || !data.entitlements) return false;
    return data.entitlements.some(e => e.status === 'active' && new Date(e.expiry_date) > new Date());
  };

  /**
   * Get expiry date string for an app if available
   */
  const getExpiry = (appId) => {
    const info = getAppAccessInfo(appId);
    return info ? info.expiry_date : null;
  };

  return {
    entitlements: data, // raw data
    loading,
    error,
    refetch: () => fetchEntitlements(true),
    refresh: () => fetchEntitlements(true), // Alias
    hasAccessToApp,
    checkAccess,
    getAppAccessInfo,
    isSubscriptionActive,
    getExpiry
  };
}