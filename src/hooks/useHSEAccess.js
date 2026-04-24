import { useCallback } from 'react';
import { useHSEContext } from '@/contexts/HSEContext';
import { HSE_PERMISSIONS } from '@/constants/permissions';

export const useHSEAccess = () => {
  const { role, can, isAdmin, isSupervisor, isMember, isViewer } = useHSEContext();

  const canViewDashboard = useCallback(() => can(HSE_PERMISSIONS.VIEW_DASHBOARD), [can]);
  const canReportIncident = useCallback(() => can(HSE_PERMISSIONS.REPORT_INCIDENT), [can]);
  const canManageIncidents = useCallback(() => can(HSE_PERMISSIONS.MANAGE_INCIDENTS), [can]);
  const canApprovePermits = useCallback(() => can(HSE_PERMISSIONS.APPROVE_PERMITS), [can]);
  const canCreatePermits = useCallback(() => can(HSE_PERMISSIONS.CREATE_PERMITS), [can]);
  const canViewReports = useCallback(() => can(HSE_PERMISSIONS.VIEW_REPORTS), [can]);
  const canManageSettings = useCallback(() => can(HSE_PERMISSIONS.MANAGE_SETTINGS), [can]);
  const canConductAudits = useCallback(() => can(HSE_PERMISSIONS.CONDUCT_AUDITS), [can]);
  const canManageTeam = useCallback(() => can(HSE_PERMISSIONS.MANAGE_TEAM), [can]);

  return {
    role,
    can,
    isAdmin,
    isSupervisor,
    isMember,
    isViewer,
    // Feature helpers
    canViewDashboard,
    canReportIncident,
    canManageIncidents,
    canApprovePermits,
    canCreatePermits,
    canViewReports,
    canManageSettings,
    canConductAudits,
    canManageTeam,
  };
};