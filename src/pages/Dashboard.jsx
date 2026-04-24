import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Layers3, Database, HardHat, Fuel, DollarSign, Factory, Shield, 
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

const modules = [
  { id: 'geoscience', name: 'Geoscience', icon: Layers3, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { id: 'reservoir', name: 'Reservoir', icon: Database, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'drilling', name: 'Drilling', icon: HardHat, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { id: 'production', name: 'Production', icon: Fuel, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'economics', name: 'Economics', icon: DollarSign, color: 'text-lime-400', bg: 'bg-lime-500/10' },
  { id: 'facilities', name: 'Facilities', icon: Factory, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { id: 'assurance', name: 'Assurance', icon: Shield, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { 
    id: 'hse', 
    name: 'HSE', 
    icon: Shield, 
    color: 'text-cyan-400', 
    bg: 'bg-cyan-500/10', 
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
                .from('organization_users') 
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
    <div className="flex flex-col min-h-screen bg-slate-950">
      <ImpersonationBanner />
      
      <div className="p-6 md:p-8 space-y-8 flex-1">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Welcome back, {user?.user_metadata?.full_name?.split(' ')[0] || 'Explorer'}
            </h1>
            <p className="text-slate-400">Here's what's happening across your operations today.</p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            {isAdmin && (
                <>
                  <Button variant="outline" className="border-blue-500/30 text-blue-400 hover:text-white" onClick={() => navigate('/dashboard/access-requests')} disabled={isImpersonating}>
                      <ShieldCheck className="w-4 h-4 mr-2"/> Requests
                      {pendingRequestsCount > 0 && <Badge className="ml-2 bg-blue-600 text-white h-5 w-5 p-0 flex items-center justify-center rounded-full">{pendingRequestsCount}</Badge>}
                  </Button>
                  <Button variant="outline" className="border-green-500/30 text-green-400 hover:text-white" onClick={() => navigate('/dashboard/subscriptions')} disabled={isImpersonating}>
                      <CreditCard className="w-4 h-4 mr-2"/> Subscriptions
                  </Button>
                </>
            )}
            <Button 
              variant="ghost" 
              className="text-slate-400 hover:text-white" 
              onClick={handleSyncPayments}
              disabled={syncing || isImpersonating}
            >
               <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`}/> 
               {syncing ? 'Syncing...' : 'Sync'}
            </Button>
            
            {showTeamButton && (
              <Button variant="outline" className="border-slate-700 text-slate-300 hover:text-white" onClick={() => navigate('/dashboard/employees')}>
                 <Users className="w-4 h-4 mr-2"/> Team ({memberCount})
              </Button>
            )}

            <Button variant="outline" className="border-slate-700 text-slate-300 hover:text-white" onClick={() => navigate('/dashboard/modules')}>
               <Box className="w-4 h-4 mr-2"/> My Apps
            </Button>
            {!isImpersonating && <UpgradeSuiteButton />}
          </div>
        </div>

        {/* Module Grid */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              My Applications
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {modules.map((module) => {
              const isActive = isModuleActive(module.id);
              
              return (
              <motion.div
                key={module.id}
                whileHover={(isActive) ? { scale: 1.02 } : {}}
                className="group relative"
              >
                <Card className={`bg-slate-900 border transition-all h-full ${isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50'}`}>
                  <CardContent className="p-6 flex flex-col items-start gap-4">
                    <div className={`p-3 rounded-xl ${module.bg} ${module.color} flex justify-between w-full`}>
                      <module.icon className="w-8 h-8" />
                      {isActive ? <CheckCircle2 className="w-5 h-5 text-green-500/50"/> : <Lock className="w-5 h-5 text-slate-500"/>}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-lime-400 transition-colors flex items-center gap-2">
                        {module.name}
                        {isActive ? (
                            <Badge variant="outline" className="text-[10px] h-5 border-green-600 text-green-400">Available</Badge>
                        ) : (
                            <Badge variant="outline" className="text-[10px] h-5 border-slate-700 text-slate-600">Locked</Badge>
                        )}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        {module.description || `Access ${module.name.toLowerCase()} applications and workflows.`}
                      </p>
                    </div>
                    <div className="mt-auto pt-2 w-full">
                      {isActive ? (
                          <div 
                            className="flex items-center text-xs font-medium text-slate-500 group-hover:text-white transition-colors cursor-pointer" 
                            onClick={() => module.id === 'hse' && module.external ? window.open(module.url, '_blank') : navigate(`/dashboard/${module.id}`)}
                          >
                              Open Hub <ArrowRight className="w-3 h-3 ml-1" />
                          </div>
                      ) : (
                          isAdmin && !isImpersonating ? (
                              <Button size="sm" variant="outline" className="w-full border-amber-900 text-amber-500 hover:bg-amber-900/20" onClick={() => navigate('/dashboard/upgrade')}>Purchase</Button>
                          ) : (
                              <Button size="sm" variant="outline" className="w-full border-slate-700 text-slate-500" disabled>Contact Admin</Button>
                          )
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )})}
          </div>
        </div>
      </div>
    </div>
  );
}