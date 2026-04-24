import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loader2 } from 'lucide-react';
import { useHSEAccess } from '@/hooks/useHSEAccess';
import { useSuiteAccess } from '@/hooks/useSuiteAccess';
import AccessDenied from '@/components/AccessDenied';

const ProtectedRoute = ({ children, requiredPermission, requiredRole, appContext = 'suite' }) => {
  const { user, loading, isSuperAdmin } = useAuth();
  const location = useLocation();
  const { can: canSuite } = useSuiteAccess();
  const { can: canHSE } = useHSEAccess();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role-based gating for special roles like 'super_admin'
  if (requiredRole === 'super_admin') {
    if (!isSuperAdmin) {
      // Log for attempted org dashboard access by Super Admin if they try to access a non-super-admin-specific route
      if (location.pathname.startsWith('/dashboard')) {
        console.warn(`Attempted Org Dashboard Access: Super Admin (user_id: ${user.id}) cannot access org dashboard route: ${location.pathname}`);
      }
      return (
        <AccessDenied
          message="You do not have the required role to access this page. Only Super Administrators can view this content."
          requiredRole={requiredRole}
        />
      );
    }
    // If it's a super admin route and they are super admin, proceed
    return children;
  }

  // Feature-level gating using permissions for non-Super Admins or if requiredRole is not 'super_admin'
  if (requiredPermission) {
    const hasPermission = appContext === 'hse' 
      ? canHSE(requiredPermission)
      : canSuite(requiredPermission);

    if (!hasPermission) {
      return (
        <AccessDenied 
          message={`You do not have permission to access this resource (${requiredPermission}).`}
          requiredPermission={requiredPermission}
        />
      );
    }
  }

  return children;
};

export default ProtectedRoute;