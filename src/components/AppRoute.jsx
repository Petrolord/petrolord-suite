import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePurchasedModules } from '@/hooks/usePurchasedModules';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';
import { getAppById as getStaticAppById } from '@/data/applications';
import AccessDenied from '@/components/AccessDenied';
import ComingSoon from '@/components/ComingSoon';
import { Loader2 } from 'lucide-react';

const AppRoute = ({ children, appName }) => {
  console.group(`🚦 [AppRoute] Rendering Route Wrapper for: ${appName}`);
  
  const auth = useAuth();
  const { user, isSuperAdmin, loading: authLoading } = auth;
  const { isAllowed, loading: entitlementsLoading, debugData, accessible_app_ids } = usePurchasedModules();
  const { apps, loading: appsLoading } = useAppsFromDatabase();
  const location = useLocation();

  if (authLoading) {
      console.log('⏳ [AppRoute] Loading dependencies...');
      console.groupEnd();
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950">
            <Loader2 className="w-8 h-8 animate-spin text-lime-500" />
        </div>
      );
  }

  if (!user) {
    console.log('🚫 [AppRoute] No user found. Redirecting.');
    console.groupEnd();
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Task 4: SUPER ADMIN BYPASS CHECK - Unconditional bypass
  if (isSuperAdmin || user?.role === 'super_admin') {
      console.log('🛡️ [AppRoute] SUPER ADMIN BYPASS ACTIVE.');
      console.groupEnd();
      return children;
  }

  if (entitlementsLoading || appsLoading) {
      console.log('⏳ [AppRoute] Loading app data...');
      console.groupEnd();
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950">
            <Loader2 className="w-8 h-8 animate-spin text-lime-500" />
        </div>
      );
  }

  // Helper to find app definition from DB or Static fallback
  const getAppDefinition = (id) => {
      if (!id) return undefined;
      // Try DB first
      if (apps && apps.length > 0) {
          const dbApp = apps.find(a => a.id === id || a.slug === id);
          if (dbApp) return dbApp;
      }
      // Fallback to static
      return getStaticAppById(id);
  };

  const appDefinition = getAppDefinition(appName);
  
  const isBuilt = appDefinition ? appDefinition.is_built : true; // Default true if not found
  const isComingSoon = appDefinition ? (appDefinition.status === 'coming_soon' || appDefinition.status === 'Coming Soon') : false;

  console.log('📦 [AppRoute] App Definition:', { 
      appName, 
      found: !!appDefinition, 
      isBuilt, 
      isComingSoon 
  });

  // Check Build Status
  if (appDefinition && (!isBuilt || isComingSoon)) {
      console.warn('🚧 [AppRoute] App is not built or Coming Soon.');
      console.groupEnd();
      return <ComingSoon appName={appDefinition.app_name || appName} />;
  }

  // Permission Check
  let canAccess = isAllowed(appName);
  
  // Specific Seat Check Logic
  const isModuleHub = debugData?.purchasedItems?.modules?.has(appName?.toLowerCase());
  
  if (!isModuleHub && appName !== 'hse' && appDefinition) {
      const hasSeat = accessible_app_ids?.includes(appName?.toLowerCase()) || accessible_app_ids?.includes(appDefinition.id);
      if (!hasSeat) {
          canAccess = false;
      }
  }

  console.log('📝 [AppRoute] Decision:', { canAccess });
  console.groupEnd();

  if (!canAccess) {
      return (
        <AccessDenied 
            moduleId={appName} 
            appName={appDefinition?.app_name || appName} 
            debugInfo={{
                checkedId: appName,
                userModules: Array.from(debugData?.purchasedItems?.modules || []),
                isSuperAdmin: isSuperAdmin
            }}
        />
      );
  }

  return children;
};

export default AppRoute;