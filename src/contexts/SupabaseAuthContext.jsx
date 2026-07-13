import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { ImpersonationProvider, useImpersonation } from '@/contexts/ImpersonationContext';

const AuthContext = createContext(undefined);

// Internal Auth Provider Content that uses Impersonation
const AuthProviderContent = ({ children }) => {
  const { toast } = useToast();
  const { 
    isImpersonating, 
    impersonatedOrgId, 
    impersonatedUserId, 
    impersonatedUserEmail 
  } = useImpersonation();

  const [user, setUser] = useState(null); // This acts as the "effective" user
  const [actualUser, setActualUser] = useState(null); // The real logged-in user
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userModules, setUserModules] = useState([]);
  const [userApps, setUserApps] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [profileSetupComplete, setProfileSetupComplete] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [role, setRole] = useState(null);

  const allModules = useMemo(() => [
    'geoscience', 'reservoir', 'drilling', 'production', 'economics', 'facilities', 'assurance'
  ], []);

  const allApps = useMemo(() => [
    'earth-model-studio', 'basinflow-genesis', 'quickvol', 'well-correlation-panel', 
    'crossplot-generator', 'petrophysics-estimator', 'seismic-interpreter', 'automated-log-digitizer',
    'contour-map-digitizer', 'log-facies-analysis', 'velocity-model-builder', 'fluid-systems-studio',
    'waterflood-dashboard', 'voidage-replacement-monitor', 'fractional-flow-calculator', 'relative-permeability-designer', 'recovery-factor-estimator', 'aquifer-influx-calculator', 'decline-curve-analysis', 'reservoir-balance', 'scenario-planner',
    'eor-designer', 'uncertainty-analysis', 'reservoir-simulation-connector', 'well-planning',
    'casing-tubing-design', 'drilling-fluids-hydraulics', 'torque-drag-predictor', 'cementing-simulation',
    'frac-completion', 'pore-pressure-fracture-gradient', 'rto-dashboard', 'incident-finder',
    'wellbore-stability-analyzer', 'surveillance-dashboard', 'well-test-analyzer', 'wellbore-flow-simulator',
    'artificial-lift-designer', 'flow-assurance-monitor', 'integrated-asset-modeler', 'well-schematic-designer',
    'network-diagram-pro', 'project-management-pro', 'afe-cost-control', 'npv-scenario-builder',
    'fiscal-regime-designer', 'capital-portfolio-studio', 'fdp-accelerator', 'report-autopilot',
    'voi-analyzer', 'breakeven-analyzer', 'epe', 'pipeline-sizer', 'separator-slug-catcher-designer',
    'compressor-pump-pack', 'heat-exchanger-sizer', 'gas-treating-dehydration', 'relief-blowdown-sizer',
    'facility-layout-mapper', 'corrosion-rate-predictor', 'mechanical-earth-model', 'well-log-analyzer'
  ], []);

  const fetchUserOrgAndPermissions = useCallback(async (userId) => {
    if (!userId) return { modules: [], apps: [], org: null, role: null, isProfileSetup: false };
    try {
      // Membership consolidation (20260713300000): organization_members is the
      // single membership table; per-user module/app arrays no longer exist —
      // org-level entitlements live in organization_apps (and purchased_modules
      // for gating, via usePurchasedModules).
      const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id, role, status, organizations ( * )')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) throw error;

      if (!data || data.length === 0) {
        return { modules: [], apps: [], org: null, role: null, isProfileSetup: false };
      }

      let selectedRecord = data[0];
      if (data.length > 1) {
        const suiteOrg = data.find(record => {
          const orgData = record.organizations;
          return orgData && orgData.is_hse_only_legacy !== true;
        });
        if (suiteOrg) selectedRecord = suiteOrg;
      }

      const { data: orgApps } = await supabase
        .from('organization_apps')
        .select('app_id, module_id, status')
        .eq('organization_id', selectedRecord.organization_id);
      const activeApps = (orgApps || []).filter(a => (a.status || '').toLowerCase() === 'active');

      return {
        modules: [...new Set(activeApps.map(a => a.module_id).filter(Boolean))],
        apps: [...new Set(activeApps.map(a => a.app_id).filter(Boolean))],
        org: selectedRecord.organizations || { id: selectedRecord.organization_id },
        role: selectedRecord.role || null,
        isProfileSetup: true
      };
    } catch (error) {
      console.error("Error fetching user organization and permissions:", error);
      return { modules: [], apps: [], org: null, role: null, isProfileSetup: false };
    }
  }, []);

  const handleAuthChange = useCallback(async (currentSession) => {
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setActualUser(currentUser);
      
      // Default: effective user is real user
      let effectiveUser = currentUser;
      
      if (currentUser) {
        try {
          // Check Super Admin Status
          const userMetadata = currentUser.user_metadata || {};
          const rawIsSuperAdmin = userMetadata.is_super_admin === true;
          const hardcodedSuperAdminEmails = ['info@petrolord.com','ayoasaolu@gmail.com','ayodejiasaolu1@gmail.com', 'support@petrolord.com'];
          const isHardcodedSuperAdmin = hardcodedSuperAdminEmails.includes(currentUser.email);
          const finalIsSuperAdmin = rawIsSuperAdmin || isHardcodedSuperAdmin;
          
          setIsSuperAdmin(finalIsSuperAdmin);
          console.log(`AuthContext: isSuperAdmin = ${finalIsSuperAdmin}`);

          // IMPERSONATION LOGIC
          if (finalIsSuperAdmin && isImpersonating) {
             console.log("AuthContext: Impersonation Active");
             
             if (impersonatedOrgId) {
                 // Fetch the impersonated organization
                 const { data: orgData } = await supabase.from('organizations').select('*').eq('id', impersonatedOrgId).single();
                 
                 // If impersonating a specific user
                 if (impersonatedUserId) {
                     // We construct a "fake" user object for the effective user
                     effectiveUser = {
                         ...currentUser,
                         id: impersonatedUserId,
                         email: impersonatedUserEmail || 'impersonated@user.com',
                         user_metadata: { ...currentUser.user_metadata, full_name: 'Impersonated User' }
                     };
                     // Fetch that user's specific permissions
                     const { modules, apps, org, role: orgRole, isProfileSetup } = await fetchUserOrgAndPermissions(impersonatedUserId);
                     setUserModules(modules);
                     setUserApps(apps);
                     setOrganization(org || orgData); // Fallback to fetching org if user query fails (e.g. RLS issues)
                     setRole(orgRole);
                     setProfileSetupComplete(isProfileSetup);
                 } else {
                     // Impersonating Organization Only (Super Admin view of that Org)
                     // We keep the Super Admin as the user ID, but force the Organization Context
                     // And give full modules for that org (or all modules if we want to see what's possible)
                     
                     // Typically, if impersonating an Org, we want to see what the Org owns.
                     // Let's fetch the Org's modules directly from subscriptions/purchased_modules
                     // For simplicity here, we assume full access or specific logic
                     setOrganization(orgData);
                     setRole('super_admin');

                     // Fetch purchased modules for this org to simulate access
                     // This is handled by usePurchasedModules usually, but we set some defaults here
                     setUserModules(orgData?.modules || []); // Legacy field or just empty
                     setUserApps(allApps); // Or filter?
                     setProfileSetupComplete(true);
                 }
             }
          } else {
              // NORMAL FLOW
              if (finalIsSuperAdmin) {
                setUserModules(allModules);
                setUserApps(allApps);
                const { org } = await fetchUserOrgAndPermissions(currentUser.id);
                setOrganization(org);
                setRole('super_admin');
                setProfileSetupComplete(true);
              } else {
                const { modules, apps, org, role: orgRole, isProfileSetup } = await fetchUserOrgAndPermissions(currentUser.id);
                setUserModules(modules);
                setUserApps(apps);
                setOrganization(org);
                setRole(orgRole);
                setProfileSetupComplete(isProfileSetup);
              }
          }
          
          setUser(effectiveUser);

        } catch (err) {
          console.error("Auth initialization error:", err);
        }
      } else {
        setUser(null);
        setActualUser(null);
        setUserModules([]);
        setUserApps([]);
        setIsSuperAdmin(false);
        setProfileSetupComplete(false);
        setOrganization(null);
        setRole(null);
      }
      setLoading(false);
  }, [fetchUserOrgAndPermissions, allModules, allApps, isImpersonating, impersonatedOrgId, impersonatedUserId, impersonatedUserEmail]);

  useEffect(() => {
    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
       handleAuthChange(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        handleAuthChange(session);
      }
    );
    return () => {
      subscription.unsubscribe();
    };
  }, [handleAuthChange]);

  const signUp = useCallback(async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, display_name: fullName.split(' ')[0], profile_setup_complete: false } },
    });
    if (error) toast({ variant: "destructive", title: "Sign up Failed", description: error.message });
    return { error };
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast({ variant: "destructive", title: "Sign in Failed", description: error.message });
    return { error };
  }, [toast]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast({ variant: "destructive", title: "Sign out Failed", description: error.message });
    return { error };
  }, [toast]);
  
  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/set-password` });
    if (error) toast({ variant: 'destructive', title: 'Error sending reset link', description: error.message });
    else toast({ title: 'Password Reset Email Sent', description: 'Check your inbox for a link to reset your password.' });
  }, [toast]);

  const value = useMemo(() => ({
    user, // Effective user (impersonated or real)
    actualUser, // Always real user
    session,
    loading,
    userModules,
    userApps,
    isSuperAdmin,
    profileSetupComplete,
    organization, // Effective organization
    role, // Effective suite role (owner/admin/member/viewer/super_admin)
    setProfileSetupComplete,
    signUp,
    signIn,
    signOut,
    resetPassword,
    // Expose impersonation status for consumers
    isImpersonating,
    impersonatedOrgId,
    impersonatedUserId
  }), [user, actualUser, session, loading, userModules, userApps, isSuperAdmin, profileSetupComplete, organization, role, signUp, signIn, signOut, resetPassword, isImpersonating, impersonatedOrgId, impersonatedUserId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Wrapper to provide ImpersonationContext
export const AuthProvider = ({ children }) => (
  <ImpersonationProvider>
    <AuthProviderContent>{children}</AuthProviderContent>
  </ImpersonationProvider>
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};