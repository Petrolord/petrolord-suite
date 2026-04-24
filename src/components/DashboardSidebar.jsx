import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSuiteAccess } from '@/hooks/useSuiteAccess';
import { useHSEAccess } from '@/hooks/useHSEAccess';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { SUITE_PERMISSIONS, HSE_PERMISSIONS } from '@/constants/permissions';
import { 
  LayoutDashboard, 
  Layers, 
  Droplet, 
  Anchor, 
  Zap, 
  DollarSign, 
  Factory, 
  ShieldCheck, 
  Settings, 
  Users, 
  CreditCard, 
  BarChart, 
  HardHat, 
  Monitor,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const SidebarItem = ({ icon: Icon, label, to, exact = false, disabled = false }) => {
  if (disabled) {
      return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 cursor-not-allowed opacity-50">
            <Icon className="h-4 w-4" />
            <span>{label}</span>
        </div>
      )
  }
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          isActive
            ? "bg-slate-800 text-white"
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  );
};

const DashboardSidebar = () => {
  const { can: canSuite } = useSuiteAccess();
  const { can: canHSE } = useHSEAccess();
  const { isSuperAdmin, actualUser } = useAuth();
  const { isImpersonating, exitImpersonation } = useImpersonation();

  // Log role visibility for debugging
  React.useEffect(() => {
    console.log(`DashboardSidebar: Rendered. SuperAdmin: ${isSuperAdmin}, Impersonating: ${isImpersonating}`);
  }, [isSuperAdmin, isImpersonating]);

  return (
    <div className="w-64 bg-slate-950 border-r border-slate-800 h-full flex flex-col">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-sm tracking-tight">Petrolord Suite</h1>
            <span className="text-slate-500 text-xs">Enterprise Edition</span>
          </div>
        </div>

        {isImpersonating && (
            <div className="mb-4 p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg text-amber-500 text-xs">
                <p className="font-bold mb-2">Impersonation Mode</p>
                <Button 
                    size="sm" 
                    variant="destructive" 
                    className="w-full h-7 text-xs" 
                    onClick={() => exitImpersonation(actualUser?.id)}
                >
                    <LogOut className="w-3 h-3 mr-1"/> Exit View
                </Button>
            </div>
        )}

        <div className="space-y-1">
          {/* Always show Dashboard link */}
          <SidebarItem icon={LayoutDashboard} label="Dashboard" to="/dashboard" exact />
          
          {/* Super Admin Console - Visible ONLY for Super Admins (Not in Impersonation Mode) */}
          {isSuperAdmin && !isImpersonating && (
            <>
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Platform Admin</p>
              </div>
              <SidebarItem icon={Monitor} label="Super Admin Console" to="/super-admin" />
            </>
          )}

          {/* Module Links */}
          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Modules</p>
          </div>
          <SidebarItem icon={Layers} label="Geoscience" to="/dashboard/geoscience" />
          <SidebarItem icon={Reservoir} label="Reservoir" to="/dashboard/reservoir" />
          <SidebarItem icon={Anchor} label="Drilling" to="/dashboard/drilling" />
          <SidebarItem icon={Zap} label="Production" to="/dashboard/production" />
          <SidebarItem icon={DollarSign} label="Economics" to="/dashboard/economics" />
          <SidebarItem icon={Factory} label="Facilities" to="/dashboard/facilities" />
          <SidebarItem icon={ShieldCheck} label="Assurance" to="/dashboard/assurance" />
          
          <SidebarItem icon={HardHat} label="HSE Portal" to="/hse" />

          {/* Admin Section - Disable sensitive areas if Impersonating */}
          {/* HIDE for Super Admins unless Impersonating. Super Admins use Console. */}
          {(!isSuperAdmin || isImpersonating) && (
            <>
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Organization Administration</p>
              </div>
              
              {canSuite(SUITE_PERMISSIONS.MANAGE_USERS) && (
                <>
                  <SidebarItem icon={Users} label="Employees" to="/dashboard/employees" disabled={isImpersonating} />
                  <SidebarItem icon={Users} label="Team Management" to="/dashboard/teams" disabled={isImpersonating} />
                </>
              )}
              
              {canSuite(SUITE_PERMISSIONS.MANAGE_APP_ACCESS) && (
                <SidebarItem icon={ShieldCheck} label="Access Control" to="/dashboard/modules" disabled={isImpersonating} />
              )}

              {canSuite(SUITE_PERMISSIONS.MANAGE_BILLING) && (
                <SidebarItem icon={CreditCard} label="Billing" to="/dashboard/subscriptions" disabled={isImpersonating} />
              )}
              
              {canSuite(SUITE_PERMISSIONS.VIEW_ANALYTICS) && (
                <SidebarItem icon={BarChart} label="Analytics" to="/dashboard/analytics" />
              )}

              {canSuite(SUITE_PERMISSIONS.MANAGE_ORGANIZATION) && (
                <SidebarItem icon={Settings} label="Settings" to="/admin/center" disabled={isImpersonating} />
              )}
            </>
          )}
        </div>
      </div>
      
      {/* User Profile Link (always visible) */}
      <div className="mt-auto p-4 border-t border-slate-800">
        <NavLink to="/profile" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors">
          <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">My Profile</p>
            <p className="text-slate-500 text-[10px] truncate">View account</p>
          </div>
        </NavLink>
      </div>
    </div>
  );
};

// Fix Icon reference
const Reservoir = Droplet;

export default DashboardSidebar;