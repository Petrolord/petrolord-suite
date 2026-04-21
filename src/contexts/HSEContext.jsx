import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { HSE_PERMISSIONS, ROLES, canAccess } from '@/constants/permissions';

const HSEContext = createContext(null);

export const HSEProvider = ({ children }) => {
  const { user } = useAuth();
  const hseRole = user?.hseRole || user?.role || ROLES.VIEWER;

  const value = useMemo(() => ({
    role: hseRole,
    can: (permission) => canAccess(hseRole, permission, 'hse'),
    isAdmin: () => [ROLES.OWNER, ROLES.ADMIN, ROLES.ORG_ADMIN, ROLES.SUPER_ADMIN].includes(hseRole),
    isSupervisor: () => [ROLES.SUPERVISOR].includes(hseRole),
    isMember: () => [ROLES.MEMBER].includes(hseRole),
    isViewer: () => [ROLES.VIEWER].includes(hseRole),
  }), [hseRole]);

  return (
    <HSEContext.Provider value={value}>
      {children}
    </HSEContext.Provider>
  );
};

export const useHSEContext = () => {
  const context = useContext(HSEContext);
  if (!context) {
    // Safe defaults when used outside HSEProvider (e.g., Suite-only routes).
    // ProtectedRoute gates real access via appContext, so inert values are safe.
    return {
      role: null,
      can: () => false,
      isAdmin: () => false,
      isSupervisor: () => false,
      isMember: () => false,
      isViewer: () => false,
    };
  }
  return context;
};
