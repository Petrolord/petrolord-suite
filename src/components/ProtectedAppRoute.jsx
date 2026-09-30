import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lock, AlertCircle, ShoppingCart } from 'lucide-react';

/**
 * A wrapper component that guards routes based on purchased entitlements.
 * @param {string|string[]} appId - The slug (or UUID) of the app to check access for; an
 *   array opens the route on a licence for any one of them (a companion tool).
 * @param {string} appName - Display name for the error message.
 */
// Design system (batch 7A): every route this guard protects is under
// /dashboard, inside the one dashboard theme scope (DashboardLayout), so its
// loading, licence-banner and access-restricted states use theme roles.
const ProtectedAppRoute = ({ children, appId, appName }) => {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const { 
    loading: entLoading, 
    hasAccessToApp, 
    refetch,
    stale,
    stampedAt,
  } = useUserEntitlements();

  // Ensure fresh data on mount. Keyed on who is asking, never on the identity
  // of refetch: this effect flips `loading`, which swaps the app below for a
  // full-screen spinner, so re-running it on every render makes the app
  // flicker instead of open (2026-09-11).
  const userId = user?.id || null;
  useEffect(() => {
    if (!isSuperAdmin && userId) {
      refetch();
    }
    // refetch is intentionally not a dependency; it is keyed on userId above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, userId]);

  if (authLoading || (entLoading && !isSuperAdmin)) {
    return (
      <div className="flex items-center justify-center h-screen bg-pl-bg" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-pl-border border-t-pl-primary" aria-hidden="true"></div>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Task 3: Unconditional superadmin bypass
  if (isSuperAdmin || user?.role === 'super_admin') {
    return children;
  }

  // MAP-U1-004: a companion tool (the Contour Map Digitizer beside Mapping &
  // Surface Studio) passes several ids; any licence among them opens it
  const hasAccess = [].concat(appId).some((id) => hasAccessToApp(id));

  if (hasAccess && stale) {
    // offline boot on a cached licence (Wellsite Studio WS6): the app opens, the banner says so
    return (
      <>
        <div className="bg-pl-warning-bg border-b border-pl-warning/40 text-pl-warning-text text-[11px] px-3 py-1" data-testid="entitlement-stale">
          Working from the licence last verified {stampedAt ? new Date(stampedAt).toLocaleDateString() : 'earlier'}; it is checked again when a connection returns.
        </div>
        {children}
      </>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full bg-pl-bg p-6 min-h-screen">
        <Card className="w-full max-w-md shadow-pl-lg">
          <CardHeader className="text-center">
            <div className="mx-auto bg-pl-warning-bg border border-pl-warning/40 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-8 w-8 text-pl-warning-text" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl text-pl-text">Access Restricted</CardTitle>
            <CardDescription className="text-pl-muted mt-2">
              You do not have an active license for <strong>{appName || 'this application'}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-pl-info-bg p-4 rounded border border-pl-info/40 text-sm text-pl-info-text flex gap-3">
              <AlertCircle className="h-5 w-5 text-pl-info-text shrink-0" aria-hidden="true" />
              <p>Your organization needs to purchase a subscription or renew an expired license to access this feature.</p>
            </div>
            
            <div className="grid gap-3">
              <Button className="w-full font-bold" onClick={() => window.location.href = '/dashboard/upgrade'}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Purchase License
              </Button>
              <Button variant="outline" className="w-full" onClick={() => window.history.back()}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
};

export default ProtectedAppRoute;