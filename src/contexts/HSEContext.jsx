import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { HSE_PERMISSIONS, canAccess, ROLES } from '@/constants/permissions';

const HSEContext = createContext(null);

export const HSEProvider = ({ children }) => {
  const { user, role: userRole } = useAuth();

  // In a real scenario, HSE role might differ from Suite role.
  // For now, we assume they map 1:1 or are stored in the same 'role' field.
  // If distinct, fetch here.
  const hseRole = userRole || ROLES.VIEWER;

  const value = useMemo(() => ({
    role: hseRole,
    can: (permission) => canAccess(hseRole, permission, 'hse'),
    isAdmin: () => [ROLES.OWNER, ROLES.ADMIN, ROLES.ORG_ADMIN, ROLES.SUPER_ADMIN].includes(hseRole),
    isSupervisor: () => [ROLES.OWNER, ROLES.ADMIN, ROLES.ORG_ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR].includes(hseRole),
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
    throw new Error('useHSEContext must be used within an HSEProvider');
  }
  return context;
};