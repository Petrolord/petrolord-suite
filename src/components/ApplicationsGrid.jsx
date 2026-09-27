import React from 'react';
import { useNavigate } from 'react-router-dom';
import { appRoutePath } from '@/utils/appRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, ArrowRight, Clock, Hammer, AlertTriangle } from 'lucide-react';
import { usePurchasedModules } from '@/hooks/usePurchasedModules';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { getAppIcon } from '@/data/applications';
import { Skeleton } from '@/components/ui/skeleton';

// The catalogue grid every module hub renders. It is only mounted inside
// the hub design-system scope (HubScope), so it uses theme roles.
export default function ApplicationsGrid({ moduleFilter, searchQuery }) {
  const { apps, loading: dbLoading } = useAppsFromDatabase(moduleFilter);
  const { isAllowed, loading: authLoading } = usePurchasedModules();
  const { isSuperAdmin, user } = useAuth();
  const navigate = useNavigate();

  const hasSuperAdminPrivileges = isSuperAdmin || user?.role === 'super_admin';
  const loading = authLoading || dbLoading;

  if (loading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" aria-busy="true">
            <span className="sr-only" role="status">Loading applications</span>
            {[1,2,3,4].map(i => (
                <Skeleton key={i} className="h-48 rounded-xl bg-pl-sunken" />
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {filteredApps.map((app) => {
        // Superadmins bypass entitlement checks and status blocks
        const hasAccess = hasSuperAdminPrivileges || isAllowed(app.id) || isAllowed(app.slug);
        const Icon = getAppIcon(app.icon_url || app.icon); 
        
        // Superadmins bypass "coming soon" blocks as well to allow testing
        const isComingSoon = hasSuperAdminPrivileges ? false : app.isComingSoon; 
        const isClickable = hasSuperAdminPrivileges || (!isComingSoon && hasAccess);

        const open = () => {
          if (isComingSoon) return;
          if (hasAccess) {
            // One computation, shared with useAppsFromDatabase. This
            // block used to prefer `app.route`, which the hook built
            // from the raw module display name; that beat the correct
            // path computed here and broke every Midstream & Downstream
            // card. app.path is still honoured as an explicit override.
            let targetRoute = app.path || appRoutePath(app);
            if (!targetRoute) return;
            if (targetRoute.startsWith('/apps/')) {
                targetRoute = `/dashboard${targetRoute}`;
            } else if (!targetRoute.startsWith('/dashboard') && targetRoute.startsWith('/')) {
                targetRoute = `/dashboard${targetRoute}`;
            }
            navigate(targetRoute);
          } else {
            navigate('/dashboard/upgrade'); 
          }
        };
        // A card that goes somewhere (the app, or the upgrade page for a
        // locked one) is reachable by keyboard; a Coming Soon card is not.
        const interactive = !isComingSoon;

        return (
          <Card 
            key={app.id}
            data-testid="app-card"
            role={interactive ? 'link' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-disabled={interactive ? undefined : true}
            className={`
              group relative overflow-hidden transition-all duration-300 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 ring-offset-pl-bg
              ${isClickable 
                  ? 'hover:border-pl-border-strong hover:shadow-pl-md hover:-translate-y-0.5 cursor-pointer' 
                  : interactive ? 'cursor-pointer hover:border-pl-border-strong' : 'bg-pl-sunken/60 shadow-none'
              }
            `}
            onClick={open}
            onKeyDown={(e) => {
              if (!interactive) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            }}
          >
            <CardContent className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-start gap-3 mb-4">
                <div className={`p-3 rounded-lg ${hasAccess && !isComingSoon ? 'bg-pl-sunken text-pl-primary-text' : 'bg-pl-sunken text-pl-muted'}`}>
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </div>
                
                {app.isComingSoon ? (
                  <Badge variant={app.is_built === false ? 'secondary' : 'info'} className="flex items-center gap-1 whitespace-nowrap">
                    {app.is_built === false ? <Hammer className="w-3 h-3" aria-hidden="true"/> : <Clock className="w-3 h-3" aria-hidden="true"/>}
                    {app.is_built === false ? 'In Development' : 'Coming Soon'}
                  </Badge>
                ) : !hasAccess ? (
                  <Badge variant="warning" className="flex items-center whitespace-nowrap">
                    <Lock className="w-3 h-3 mr-1" aria-hidden="true" /> Locked
                  </Badge>
                ) : (
                   <div className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 duration-300">
                       <ArrowRight className="w-5 h-5 text-pl-primary-text" aria-hidden="true"/>
                   </div>
                )}
              </div>

              <h3 className={`text-lg font-semibold mb-2 transition-colors ${isClickable ? 'text-pl-text group-hover:text-pl-primary-text' : 'text-pl-text'}`}>
                {app.app_name || app.name}
              </h3>
              
              {/* The clamp sits on an inner element: on a flex-grown box the
                  clamp let a third line show below the ellipsis. */}
              <div className="mb-4 flex-grow">
                <p className="text-sm text-pl-muted line-clamp-2">
                  {app.description}
                </p>
              </div>
              
              {!hasAccess && !isComingSoon && (
                  <div className="mt-auto pt-2 text-xs text-pl-warning-text font-medium">
                      Requires License
                  </div>
              )}
              {hasSuperAdminPrivileges && app.isComingSoon && (
                  <div className="mt-auto pt-2 text-xs text-pl-info-text font-medium">
                      Admin Bypass Enabled
                  </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      
      {filteredApps.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border border-dashed border-pl-border-strong rounded-xl bg-pl-surface text-pl-muted">
              <AlertTriangle className="w-12 h-12 mb-4 text-pl-muted" aria-hidden="true" />
              <h3 className="text-lg font-medium text-pl-text mb-1">No Applications Found</h3>
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
