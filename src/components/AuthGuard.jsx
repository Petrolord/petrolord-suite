import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useLocation } from 'react-router-dom';
import { coldLoadTheme, ThemedLoadingScreen } from '@/design/coldLoad';

const AuthGuard = ({ children }) => {
  const { loading } = useAuth();
  const location = useLocation();

  // Explicitly allow access to auth-related public routes without waiting for loading
  // This prevents the loading spinner from blocking the initial render of reset password page
  const publicRoutes = ['/auth/reset-password', '/set-password'];
  const isPublicRoute = publicRoutes.some(route => location.pathname.startsWith(route));

  if (loading && !isPublicRoute) {
    // Design system: the themed loader in the theme the page will open in
    // (light where no scope follows).
    return <ThemedLoadingScreen theme={coldLoadTheme(location.pathname) || 'light'} />;
  }

  return <>{children}</>;
};

export default AuthGuard;