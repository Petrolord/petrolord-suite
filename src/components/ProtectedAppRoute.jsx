import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lock, AlertCircle, ShoppingCart } from 'lucide-react';

/**
 * A wrapper component that guards routes based on purchased entitlements.
 * @param {string} appId - The UUID of the app to check access for.
 * @param {string} appName - Display name for the error message.
 */
const ProtectedAppRoute = ({ children, appId, appName }) => {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const { 
    loading: entLoading, 
    hasAccessToApp, 
    refetch 
  } = useUserEntitlements();

  // Ensure fresh data on mount
  useEffect(() => {
    if (!isSuperAdmin) {
      refetch();
    }
  }, [isSuperAdmin, refetch]);

  if (authLoading || (entLoading && !isSuperAdmin)) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-lime-400"></div>
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

  const hasAccess = hasAccessToApp(appId);

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950 p-6 min-h-screen">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-8 w-8 text-amber-500" />
            </div>
            <CardTitle className="text-2xl text-white">Access Restricted</CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              You do not have an active license for <strong>{appName || 'this application'}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-950 p-4 rounded border border-slate-800 text-sm text-slate-300 flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-400 shrink-0" />
              <p>Your organization needs to purchase a subscription or renew an expired license to access this feature.</p>
            </div>
            
            <div className="grid gap-3">
              <Button className="w-full bg-lime-500 hover:bg-lime-600 text-slate-900 font-bold" onClick={() => window.location.href = '/dashboard/upgrade'}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Purchase License
              </Button>
              <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => window.history.back()}>
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