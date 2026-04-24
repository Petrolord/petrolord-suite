import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { startOrgImpersonation, startMemberImpersonation, exitImpersonation as logExit } from '@/utils/impersonationUtils';

const ImpersonationContext = createContext();

export const ImpersonationProvider = ({ children }) => {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedOrgId, setImpersonatedOrgId] = useState(null);
  const [impersonatedUserId, setImpersonatedUserId] = useState(null);
  const [impersonationSessionId, setImpersonationSessionId] = useState(null);
  const [impersonationStartTime, setImpersonationStartTime] = useState(null);
  const [impersonatedUserEmail, setImpersonatedUserEmail] = useState(null);
  const [impersonatedOrgName, setImpersonatedOrgName] = useState(null);

  useEffect(() => {
    // Restore state from localStorage on mount
    const storedState = localStorage.getItem('impersonationState');
    if (storedState) {
      const state = JSON.parse(storedState);
      console.log("ImpersonationContext: Restoring state", state);
      setIsImpersonating(state.isImpersonating);
      setImpersonatedOrgId(state.impersonatedOrgId);
      setImpersonatedUserId(state.impersonatedUserId);
      setImpersonationSessionId(state.impersonationSessionId);
      setImpersonationStartTime(state.impersonationStartTime);
      setImpersonatedUserEmail(state.impersonatedUserEmail);
      setImpersonatedOrgName(state.impersonatedOrgName);
    }
  }, []);

  const saveState = (newState) => {
    localStorage.setItem('impersonationState', JSON.stringify(newState));
  };

  const clearState = () => {
    localStorage.removeItem('impersonationState');
    setIsImpersonating(false);
    setImpersonatedOrgId(null);
    setImpersonatedUserId(null);
    setImpersonationSessionId(null);
    setImpersonationStartTime(null);
    setImpersonatedUserEmail(null);
    setImpersonatedOrgName(null);
  };

  const startOrg = async (orgId, orgName, superAdminId) => {
    console.log("ImpersonationContext: startOrg", orgId);
    const sessionId = await startOrgImpersonation(orgId, superAdminId);
    const newState = {
      isImpersonating: true,
      impersonatedOrgId: orgId,
      impersonatedUserId: null,
      impersonatedUserEmail: null,
      impersonatedOrgName: orgName,
      impersonationSessionId: sessionId,
      impersonationStartTime: new Date().toISOString()
    };
    
    setIsImpersonating(true);
    setImpersonatedOrgId(orgId);
    setImpersonatedOrgName(orgName);
    setImpersonatedUserId(null);
    setImpersonatedUserEmail(null);
    setImpersonationSessionId(sessionId);
    setImpersonationStartTime(newState.impersonationStartTime);
    
    saveState(newState);
    // Force reload to refresh AuthContext and App state
    window.location.href = '/dashboard';
  };

  const startMember = async (orgId, orgName, userId, userEmail, superAdminId) => {
    console.log("ImpersonationContext: startMember", userId);
    const sessionId = await startMemberImpersonation(orgId, userId, superAdminId);
    const newState = {
      isImpersonating: true,
      impersonatedOrgId: orgId,
      impersonatedUserId: userId,
      impersonatedUserEmail: userEmail,
      impersonatedOrgName: orgName,
      impersonationSessionId: sessionId,
      impersonationStartTime: new Date().toISOString()
    };

    setIsImpersonating(true);
    setImpersonatedOrgId(orgId);
    setImpersonatedOrgName(orgName);
    setImpersonatedUserId(userId);
    setImpersonatedUserEmail(userEmail);
    setImpersonationSessionId(sessionId);
    setImpersonationStartTime(newState.impersonationStartTime);

    saveState(newState);
    // Force reload
    window.location.href = '/dashboard';
  };

  const exit = async (superAdminId) => {
    console.log("ImpersonationContext: exit");
    if (impersonationSessionId) {
      await logExit(impersonationSessionId, superAdminId);
    }
    clearState();
    window.location.href = '/super-admin';
  };

  return (
    <ImpersonationContext.Provider value={{
      isImpersonating,
      impersonatedOrgId,
      impersonatedUserId,
      impersonatedOrgName,
      impersonatedUserEmail,
      impersonationSessionId,
      impersonationStartTime,
      startOrgImpersonation: startOrg,
      startMemberImpersonation: startMember,
      exitImpersonation: exit
    }}>
      {children}
    </ImpersonationContext.Provider>
  );
};

export const useImpersonation = () => useContext(ImpersonationContext);