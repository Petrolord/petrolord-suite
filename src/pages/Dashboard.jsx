import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Layers3, Database, HardHat, Fuel, DollarSign, Factory, Shield, Container, Flame, ScatterChart,
  ArrowRight, Lock, Box, RefreshCw, CheckCircle2, Users, ShieldCheck, CreditCard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { supabase } from '@/lib/customSupabaseClient';
import UpgradeSuiteButton from '@/components/UpgradeSuiteButton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import RequestAccessModal from '@/components/RequestAccessModal';
import { usePurchasedModules } from '@/hooks/usePurchasedModules';
import { isValidUUID } from '@/lib/utils';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import { HubHeader, HubPage, HubSectionTitle } from '@/components/hubs/HubChrome';

const modules = [
  { id: 'geoscience', name: 'Geoscience', icon: Layers3 },
  { id: 'reservoir', name: 'Reservoir', icon: Database },
  { id: 'drilling', name: 'Drilling', icon: HardHat },
  { id: 'production', name: 'Production', icon: Fuel },
  { id: 'economics', name: 'Economics', icon: DollarSign },
  { id: 'facilities', name: 'Facilities', icon: Factory },
  { id: 'assurance', name: 'Assurance', icon: Shield },
  { id: 'midstream-downstream', name: 'Midstream & Downstream', icon: Container },
  { id: 'process-safety', name: 'Process Safety', icon: Flame },
  { id: 'data-ai', name: 'Data & AI', icon: ScatterChart },
  { 
    id: 'hse', 
    name: 'HSE', 
    icon: Shield, 
    description: 'Access health, safety and environment applications and workflows.',
    external: true,
    url: 'https://hse.petrolord.com/'
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, organization, isSuperAdmin } = useAuth();
  const { isImpersonating } = useImpersonation();
  const { toast } = useToast();
  
  const { isModuleActive, refresh, loading: modulesLoading } = usePurchasedModules();
  
  const [syncing, setSyncing] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  
  const isAdmin = user?.user_metadata?.role === 'owner' || user?.user_metadata?.role === 'admin' || user?.user_metadata?.role === 'org_admin' || isSuperAdmin;

  // Logic for Team button visibility
  const userRole = user?.user_metadata?.role;
  const showTeamButton = !isSuperAdmin && userRole !== 'super_admin';
  console.log(`Dashboard: Team button visibility check - user_role=${userRole}, show_team_button=${showTeamButton}`);

  useEffect(() => {
      if(user && organization?.id) {
          fetchMemberCount();
          if (isAdmin) fetchPendingRequests();
      }
  }, [user, organization, isAdmin]);

  const fetchPendingRequests = async () => {
      if(organization?.id && isValidUUID(organization.id)) {
          const { count } = await supabase.from('access_requests')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organization.id)
            .eq('status', 'pending');
          setPendingRequestsCount(count || 0);
      }
  }

  const fetchMemberCount = async () => {
      try {
          if (organization?.id && isValidUUID(organization.id)) {
              const { count } = await supabase
                .from('organization_members')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization.id);
              setMemberCount(count || 1); 
          }
      } catch (e) {
          console.error("Member count error", e);
      }
  };

  const handleSyncPayments = async () => {
      if (isImpersonating) {
          toast({ title: "Disabled", description: "Actions are disabled in impersonation mode.", variant: "secondary" });
          return;
      }
      setSyncing(true);
      try {
          if (!organization?.id) {
              if (isSuperAdmin) {
                  await refresh();
                  toast({ title: "Sync Successful", description: "Dashboard entitlements refreshed (Super Admin Mode).", className: "bg-green-600 text-white" });
                  setSyncing(false);
                  return;
              }
              throw new Error("Organization not found yet.");
          }
          
          if (!isValidUUID(organization.id)) {
             toast({ title: "Sync Skipped", description: "Invalid organization context.", variant: "destructive" });
             setSyncing(false);
             return;
          }

          await refresh();
          
          toast({ title: "Sync Successful", description: "Dashboard entitlements refreshed.", className: "bg-green-600 text-white" });
      } catch (err) {
          console.error("Sync failed:", err);
          toast({ title: "Sync Failed", description: "Could not refresh data.", variant: "destructive" });
      } finally {
          setSyncing(false);
      }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <ImpersonationBanner />
      
      <HubPage className="flex-1">
        <HubHeader
          eyebrow="Petrolord Suite"
          title={`Welcome back, ${user?.user_metadata?.full_name?.split(' ')[0] || 'Explorer'}`}
          description="Here's what's happening across your operations today."
          actions={(
            <>
              {isAdmin && (
                  <>
                    <Button variant="outline" onClick={() => navigate('/dashboard/access-requests')} disabled={isImpersonating}>
                        <ShieldCheck className="w-4 h-4 mr-2" aria-hidden="true"/> Requests
                        {pendingRequestsCount > 0 && <Badge variant="info" className="ml-2 h-5 min-w-5 px-1.5 flex items-center justify-center font-pl-mono tabular-nums" aria-label={`${pendingRequestsCount} pending`}>{pendingRequestsCount}</Badge>}
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/dashboard/subscriptions')} disabled={isImpersonating}>
                        <CreditCard className="w-4 h-4 mr-2" aria-hidden="true"/> Subscriptions
                    </Button>
                  </>
              )}
              <Button 
                variant="ghost" 
                onClick={handleSyncPayments}
                disabled={syncing || isImpersonating}
              >
                 <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true"/> 
                 {syncing ? 'Syncing...' : 'Sync'}
              </Button>
              
              {showTeamButton && (
                <Button variant="outline" onClick={() => navigate('/dashboard/employees')}>
                   <Users className="w-4 h-4 mr-2" aria-hidden="true"/> Team ({memberCount})
                </Button>
              )}

              <Button variant="outline" onClick={() => navigate('/dashboard/modules')}>
                 <Box className="w-4 h-4 mr-2" aria-hidden="true"/> My Apps
              </Button>
              {!isImpersonating && <UpgradeSuiteButton />}
            </>
          )}
        />

        {/* Module Grid */}
        <section className="space-y-4">
          <HubSectionTitle>My Applications</HubSectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy={modulesLoading || undefined}>
            {modules.map((module) => {
              const isActive = isModuleActive(module.id);
              
              return (
              <motion.div
                key={module.id}
                whileHover={(isActive) ? { scale: 1.02 } : {}}
                className="group relative"
                data-testid="module-card"
              >
                <Card className={`h-full transition-all ${isActive ? 'hover:border-pl-border-strong hover:shadow-pl-md' : 'bg-pl-sunken/60 shadow-none'}`}>
                  <CardContent className="p-6 flex flex-col items-start gap-4 h-full">
                    <div className="p-3 rounded-xl bg-pl-sunken flex justify-between items-start w-full">
                      <module.icon className={`w-8 h-8 ${isActive ? 'text-pl-primary-text' : 'text-pl-muted'}`} aria-hidden="true" />
                      {isActive ? <CheckCircle2 className="w-5 h-5 text-pl-success-text" aria-hidden="true"/> : <Lock className="w-5 h-5 text-pl-muted" aria-hidden="true"/>}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-pl-text group-hover:text-pl-primary-text transition-colors flex flex-wrap items-center gap-2">
                        {module.name}
                        {isActive ? (
                            <Badge variant="success" className="text-[10px] h-5">Available</Badge>
                        ) : (
                            <Badge variant="secondary" className="text-[10px] h-5">Locked</Badge>
                        )}
                      </h3>
                      <p className="text-sm text-pl-muted mt-1">
                        {module.description || `Access ${module.name.toLowerCase()} applications and workflows.`}
                      </p>
                    </div>
                    <div className="mt-auto pt-2 w-full">
                      {isActive ? (
                          <button
                            type="button"
                            className="inline-flex items-center rounded-sm text-sm font-medium text-pl-primary-text hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 ring-offset-pl-surface"
                            aria-label={`Open ${module.name} hub`}
                            onClick={() => module.id === 'hse' && module.external ? window.open(module.url, '_blank') : navigate(`/dashboard/${module.id}`)}
                          >
                              Open Hub <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                          </button>
                      ) : (
                          isAdmin && !isImpersonating ? (
                              <Button size="sm" className="w-full" onClick={() => navigate('/dashboard/upgrade')}>Purchase</Button>
                          ) : (
                              <Button size="sm" variant="outline" className="w-full" disabled>Contact Admin</Button>
                          )
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )})}
          </div>
        </section>
      </HubPage>
    </div>
  );
}
