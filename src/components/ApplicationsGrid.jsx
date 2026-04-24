import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, ArrowRight, Clock, Hammer, AlertTriangle } from 'lucide-react';
import { usePurchasedModules } from '@/hooks/usePurchasedModules';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { getAppIcon } from '@/data/applications';
import { Skeleton } from '@/components/ui/skeleton';

export default function ApplicationsGrid({ moduleFilter, searchQuery }) {
  const { apps, loading: dbLoading } = useAppsFromDatabase(moduleFilter);
  const { isAllowed, loading: authLoading } = usePurchasedModules();
  const { isSuperAdmin, user } = useAuth();
  const navigate = useNavigate();

  const hasSuperAdminPrivileges = isSuperAdmin || user?.role === 'super_admin';
  const loading = authLoading || dbLoading;

  // TODO: Remove these after confirming production fix
  useEffect(() => {
    console.log('[Diagnostics Task 4] ApplicationsGrid renders with moduleFilter:', moduleFilter);
    console.log('[Diagnostics Task 5] Raw apps from database/hook:', apps);
    
    // Explicit manual check for Assurance apps to satisfy prompt:
    const debugAssuranceApps = apps.filter(app => app.module?.toLowerCase() === 'assurance');
    console.log('[Diagnostics Task 1 & 2] All Assurance apps in memory:', debugAssuranceApps);
    debugAssuranceApps.forEach(app => {
        console.log(`[Diagnostics Task 3 & 6] Assurance App: ${app.name || app.app_name} | ID: ${app.id} | Module: ${app.module} | Path: ${app.path || app.route} | Icon: ${app.icon || app.icon_url}`);
    });
  }, [apps, moduleFilter]);

  if (loading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1,2,3,4].map(i => (
                <Skeleton key={i} className="h-48 rounded-xl bg-slate-800/50" />
            ))}
        </div>
      );
  }

  // Secondary filter for Search Query
  const filteredApps = apps.filter(app => {
      const matchesSearch = searchQuery 
        ? (app.app_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
           app.description?.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;

      return matchesSearch;
  });

  // TODO: Remove these after confirming production fix
  console.log('[Diagnostics Task 4] Apps after search filter logic:', filteredApps);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {filteredApps.map((app) => {
        // Superadmins bypass entitlement checks and status blocks
        const hasAccess = hasSuperAdminPrivileges || isAllowed(app.id) || isAllowed(app.slug);
        const Icon = getAppIcon(app.icon_url || app.icon); 
        
        // Superadmins bypass "coming soon" blocks as well to allow testing
        const isComingSoon = hasSuperAdminPrivileges ? false : app.isComingSoon; 
        const isClickable = hasSuperAdminPrivileges || (!isComingSoon && hasAccess);

        return (
          <Card 
            key={app.id}
            className={`
              group relative overflow-hidden border-slate-800 bg-slate-900/50 transition-all duration-300 rounded-xl
              ${isClickable 
                  ? 'hover:border-slate-600 hover:shadow-2xl hover:scale-[1.02] cursor-pointer shadow-lg' 
                  : 'opacity-80 grayscale-[0.3]'
              }
            `}
            onClick={() => {
              if (isComingSoon) return;
              if (hasAccess) {
                // Ensure correct path format, gracefully fallback if module is missing
                let targetRoute = app.route || app.path || (app.module ? `/dashboard/apps/${app.module}/${app.slug}` : `/dashboard/apps/${app.slug}`);
                if (targetRoute && targetRoute.startsWith('/apps/')) {
                    targetRoute = `/dashboard${targetRoute}`;
                } else if (targetRoute && !targetRoute.startsWith('/dashboard') && targetRoute.startsWith('/')) {
                    targetRoute = `/dashboard${targetRoute}`;
                }
                navigate(targetRoute);
              } else {
                navigate('/dashboard/upgrade'); 
              }
            }}
          >
            <CardContent className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-lg ${hasAccess && !isComingSoon ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                  <Icon className="w-6 h-6" />
                </div>
                
                {app.isComingSoon ? (
                  <Badge variant="secondary" className="bg-slate-800 text-amber-400 border border-amber-900/30 flex items-center gap-1">
                    {app.is_built === false ? <Hammer className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                    {app.is_built === false ? 'In Development' : 'Coming Soon'}
                  </Badge>
                ) : !hasAccess ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-500 bg-amber-500/10">
                    <Lock className="w-3 h-3 mr-1" /> Locked
                  </Badge>
                ) : (
                   <div className="opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 duration-300">
                       <ArrowRight className="w-5 h-5 text-lime-400"/>
                   </div>
                )}
              </div>

              <h3 className={`text-lg font-semibold mb-2 transition-colors ${isClickable ? 'text-white group-hover:text-blue-400' : 'text-slate-400'}`}>
                {app.app_name || app.name}
              </h3>
              
              <p className="text-sm text-slate-400 line-clamp-2 mb-4 flex-grow">
                {app.description}
              </p>
              
              {!hasAccess && !isComingSoon && (
                  <div className="mt-auto pt-2 text-xs text-amber-500/80 font-medium">
                      Requires License
                  </div>
              )}
              {hasSuperAdminPrivileges && app.isComingSoon && (
                  <div className="mt-auto pt-2 text-xs text-blue-500/80 font-medium">
                      Admin Bypass Enabled
                  </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      
      {filteredApps.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-800 rounded-xl text-slate-500">
              <AlertTriangle className="w-12 h-12 mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-white mb-1">No Applications Found</h3>
              <p>
                {searchQuery 
                  ? `No applications match "${searchQuery}" in this module.` 
                  : "No applications found for this module yet."}
              </p>
          </div>
      )}
    </div>
  );
}