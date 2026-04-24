import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useLocation } from 'react-router-dom';

const AuthGuard = ({ children }) => {
  const { loading } = useAuth();
  const location = useLocation();

  // Explicitly allow access to auth-related public routes without waiting for loading
  // This prevents the loading spinner from blocking the initial render of reset password page
  const publicRoutes = ['/auth/reset-password', '/set-password'];
  const isPublicRoute = publicRoutes.some(route => location.pathname.startsWith(route));

  if (loading && !isPublicRoute) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-lime-400"></div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGuard;