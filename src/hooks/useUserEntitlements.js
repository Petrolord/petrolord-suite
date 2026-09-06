import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { isTransientError, usableSnapshot, readSnapshot, writeSnapshot } from '@/lib/entitlementCache';
import { readOnline } from '@/hooks/useOnlineStatus';

// Per-user cache (Wellsite Studio WS6): the old single global key leaked one user's licence to the next on a
// shared laptop, and a failed fetch left nothing to fall back on. The snapshot lives in entitlementCache.
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const snapshotKey = (user) => `ent:${user.id}`;

export function useUserEntitlements() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const [stampedAt, setStampedAt] = useState(null);

  const fetchEntitlements = useCallback(async (force = false) => {
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. The cache: fresh enough, or the only thing we have while offline
    const snap = readSnapshot(snapshotKey(user));
    const fresh = snap && Date.now() - snap.stamp < CACHE_DURATION;
    if ((!force || !readOnline()) && snap && (fresh || !readOnline())) {
      setData(snap.data);
      setStale(!fresh);
      setStampedAt(snap.stamp);
      setLoading(false);
      if (!readOnline()) return;
      if (!force) return;
    }

    setLoading(true);
    try {
      // 2. Fetch from Edge Function
      const { data: responseData, error: responseError } = await supabase.functions.invoke('get-user-entitlements');

      if (responseError) throw responseError;

      // 3. Cache & Set
      setData(responseData);
      writeSnapshot(snapshotKey(user), responseData);
      setStale(false);
      setStampedAt(Date.now());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch entitlements:', err);
      // the network's fault: the last successful answer for this user, marked stale
      const usable = isTransientError(err) ? usableSnapshot(snapshotKey(user)) : null;
      if (usable && !usable.expired) {
        setData(usable.data);
        setStale(true);
        setStampedAt(usable.stampedAt);
        setError(null);
      } else {
        setError(err);
      }
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
    stale,        // served from the last-known snapshot because the network failed
    stampedAt,    // when that snapshot was verified
    refetch: () => fetchEntitlements(true),
    refresh: () => fetchEntitlements(true), // Alias
    hasAccessToApp,
    checkAccess,
    getAppAccessInfo,
    isSubscriptionActive,
    getExpiry
  };
}