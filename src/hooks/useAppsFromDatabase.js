import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let globalCache = {
    data: null,
    timestamp: 0,
    promise: null
};

export const useAppsFromDatabase = (moduleFilter = null) => {
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const mounted = useRef(true);

    const applyFilter = useCallback((allApps) => {
        if (!moduleFilter) return allApps;
        return allApps.filter(app => 
            app.module?.toLowerCase() === moduleFilter.toLowerCase()
        );
    }, [moduleFilter]);

    const fetchApps = useCallback(async (forceRefresh = false) => {
        const now = Date.now();

        // Return cached data if valid
        if (!forceRefresh && globalCache.data && (now - globalCache.timestamp < CACHE_DURATION)) {
            if (mounted.current) {
                setApps(applyFilter(globalCache.data));
                setLoading(false);
            }
            return;
        }

        // Deduplicate ongoing requests
        if (globalCache.promise && !forceRefresh) {
            try {
                const data = await globalCache.promise;
                if (mounted.current) {
                    setApps(applyFilter(data));
                    setLoading(false);
                }
            } catch (err) {
                if (mounted.current) setError(err);
            }
            return;
        }

        try {
            setLoading(true);
            const fetchPromise = (async () => {
                // master_apps is only readable by the `authenticated` role (RLS). On a
                // cold page load this hook can fire BEFORE the Supabase session is
                // restored from storage, which would run the query as `anon` and return
                // []. Awaiting getSession() ensures the restored token is attached first.
                await supabase.auth.getSession();

                const { data, error } = await supabase
                    .from('master_apps')
                    .select('*')
                    .order('display_order', { ascending: true });

                if (error) throw error;

                // Process and normalize data
                const processedApps = data.map(app => ({
                    ...app,
                    isComingSoon: !app.is_built || app.status === 'coming_soon' || app.status === 'Coming Soon',
                    route: app.slug && app.module ? `/dashboard/apps/${app.module}/${app.slug}` : '#'
                }));
                
                return processedApps;
            })();

            globalCache.promise = fetchPromise;
            const result = await fetchPromise;

            // Never cache an empty result — an empty array almost always means the
            // query ran before auth was ready (see getSession above). Caching it would
            // pin "No Applications Found" for the whole 5-minute TTL. Leaving the cache
            // empty lets the next mount / auth change refetch.
            if (result.length > 0) {
                globalCache.data = result;
                globalCache.timestamp = Date.now();
            }
            globalCache.promise = null;

            if (mounted.current) {
                setApps(applyFilter(result));
                setError(null);
            }
        } catch (err) {
            console.error("[useAppsFromDatabase] ❌ Error fetching master_apps:", err);
            if (mounted.current) setError(err);
            globalCache.promise = null;
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [applyFilter, moduleFilter]);

    useEffect(() => {
        mounted.current = true;
        fetchApps();

        // If the session arrives/refreshes after the first (possibly anon) fetch,
        // force a refresh so the catalog appears without needing a manual reload.
        const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (!globalCache.data) fetchApps(true);
            }
        });

        return () => {
            mounted.current = false;
            authSub?.subscription?.unsubscribe?.();
        };
    }, [fetchApps]);

    return {
        apps,
        loading,
        error,
        refresh: () => fetchApps(true)
    };
};