import { useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { SUITE_PERMISSIONS, canAccess, ROLES } from '@/constants/permissions';

export const useSuiteAccess = () => {
  const { role: userRole } = useAuth();
  
  // Default to viewer if no role found
  const role = userRole || ROLES.VIEWER;

  const can = useCallback((permission) => {
    return canAccess(role, permission, 'suite');
  }, [role]);

  const isAdmin = useCallback(() => 
    [ROLES.OWNER, ROLES.ADMIN, ROLES.ORG_ADMIN, ROLES.SUPER_ADMIN].includes(role), 
  [role]);

  const isMember = useCallback(() => role === ROLES.MEMBER, [role]);
  const isViewer = useCallback(() => role === ROLES.VIEWER, [role]);

  // Feature helpers
  const canViewDashboard = useCallback(() => can(SUITE_PERMISSIONS.VIEW_DASHBOARD), [can]);
  const canManageOrganization = useCallback(() => can(SUITE_PERMISSIONS.MANAGE_ORGANIZATION), [can]);
  const canManageBilling = useCallback(() => can(SUITE_PERMISSIONS.MANAGE_BILLING), [can]);
  const canManageUsers = useCallback(() => can(SUITE_PERMISSIONS.MANAGE_USERS), [can]);
  const canViewAnalytics = useCallback(() => can(SUITE_PERMISSIONS.VIEW_ANALYTICS), [can]);
  const canManageAppAccess = useCallback(() => can(SUITE_PERMISSIONS.MANAGE_APP_ACCESS), [can]);

  return {
    role,
    can,
    isAdmin,
    isMember,
    isViewer,
    // Feature helpers
    canViewDashboard,
    canManageOrganization,
    canManageBilling,
    canManageUsers,
    canViewAnalytics,
    canManageAppAccess
  };
};