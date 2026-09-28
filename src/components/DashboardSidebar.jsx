import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
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
  Container,
  Flame,
  ScatterChart,
  ShieldCheck, 
  Settings, 
  Users, 
  CreditCard, 
  BarChart, 
  HardHat,
  Monitor,
  DatabaseBackup,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

// Design system, lead decision 1 (2026-09-27): the dashboard sidebar stays
// a dark brand rail in the homepage ink green in both themes. The root
// carries data-pl-theme="dark" as a fixed scope (no provider, no toggle),
// so the pl-* roles below resolve to the dark ink palette whatever the
// page next to it uses. Status colours only for status; gold for eyebrows.
const ITEM = 'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus';

const SidebarItem = ({ icon: Icon, label, to, exact = false, disabled = false, onNavigate }) => {
  if (disabled) {
      return (
        <div className={cn(ITEM, 'text-pl-muted cursor-not-allowed opacity-60')} aria-disabled="true">
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
        </div>
      )
  }
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          ITEM,
          isActive
            ? "bg-pl-raised text-pl-text shadow-[inset_3px_0_0_rgb(var(--pl-accent))]"
            : "text-pl-muted hover:text-pl-text hover:bg-pl-raised/60"
        )
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
};

const SectionLabel = ({ children }) => (
  <div className="pt-4 pb-2">
    <p className="px-3 text-[11px] font-semibold text-pl-accent-text uppercase tracking-[0.14em]">{children}</p>
  </div>
);

const DashboardSidebar = ({ onNavigate, className }) => {
  const { can: canSuite } = useSuiteAccess();
  const { can: canHSE } = useHSEAccess();
  const { isSuperAdmin, actualUser, signOut } = useAuth();
  const { isImpersonating, exitImpersonation } = useImpersonation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  // Log role visibility for debugging
  React.useEffect(() => {
    console.log(`DashboardSidebar: Rendered. SuperAdmin: ${isSuperAdmin}, Impersonating: ${isImpersonating}`);
  }, [isSuperAdmin, isImpersonating]);

  return (
    <nav
      data-pl-theme="dark"
      data-testid="dashboard-sidebar-rail"
      aria-label="Dashboard"
      className={cn("w-64 bg-pl-surface border-r border-pl-border h-full flex flex-col overflow-y-auto font-pl-sans", className)}
    >
      <div className="p-6">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2 mb-8 group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus" title="Go to home page">
          <img
            src="/petrolord-icon.png"
            alt="Petrolord"
            className="h-8 w-8 rounded-lg object-contain shrink-0"
          />
          <div>
            <p className="text-pl-text font-bold text-sm tracking-tight group-hover:text-pl-accent-text transition-colors">Petrolord Suite</p>
            <span className="text-pl-muted text-xs">Enterprise Edition</span>
          </div>
        </Link>

        {isImpersonating && (
            <div className="mb-4 p-3 bg-pl-warning-bg border border-pl-warning/40 rounded-lg text-pl-warning-text text-xs" role="status">
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
          <SidebarItem icon={LayoutDashboard} label="Dashboard" to="/dashboard" onNavigate={onNavigate} exact />
          
          {/* Super Admin Console - Visible ONLY for Super Admins (Not in Impersonation Mode) */}
          {isSuperAdmin && !isImpersonating && (
            <>
              <SectionLabel>Platform Admin</SectionLabel>
              <SidebarItem icon={Monitor} label="Super Admin Console" to="/super-admin" onNavigate={onNavigate} />
            </>
          )}

          {/* Module Links */}
          <SectionLabel>Modules</SectionLabel>
          <SidebarItem icon={Layers} label="Geoscience" to="/dashboard/geoscience" onNavigate={onNavigate} />
          <SidebarItem icon={Reservoir} label="Reservoir" to="/dashboard/reservoir" onNavigate={onNavigate} />
          <SidebarItem icon={Anchor} label="Drilling" to="/dashboard/drilling" onNavigate={onNavigate} />
          <SidebarItem icon={Zap} label="Production" to="/dashboard/production" onNavigate={onNavigate} />
          <SidebarItem icon={DollarSign} label="Economics" to="/dashboard/economics" onNavigate={onNavigate} />
          <SidebarItem icon={Factory} label="Facilities" to="/dashboard/facilities" onNavigate={onNavigate} />
          <SidebarItem icon={ShieldCheck} label="Assurance" to="/dashboard/assurance" onNavigate={onNavigate} />
          <SidebarItem icon={Container} label="Midstream & Downstream" to="/dashboard/midstream-downstream" onNavigate={onNavigate} />
          <SidebarItem icon={Flame} label="Process Safety" to="/dashboard/process-safety" onNavigate={onNavigate} />
          <SidebarItem icon={ScatterChart} label="Data & AI" to="/dashboard/data-ai" onNavigate={onNavigate} />
          
          <SidebarItem icon={HardHat} label="HSE Portal" to="/hse" onNavigate={onNavigate} />

          {/* Admin Section - Disable sensitive areas if Impersonating */}
          {/* Shown to super admins too: they administer their OWN org here
              (e.g. inviting Lordsway staff); the Console is for cross-org work.
              Items still gate on the caller's role in their org via canSuite. */}
          {(
            <>
              <SectionLabel>Organization Administration</SectionLabel>
              
              {canSuite(SUITE_PERMISSIONS.MANAGE_USERS) && (
                <>
                  <SidebarItem icon={Users} label="Employees" to="/dashboard/employees" onNavigate={onNavigate} disabled={isImpersonating} />
                  <SidebarItem icon={Users} label="Team Management" to="/dashboard/teams" onNavigate={onNavigate} disabled={isImpersonating} />
                </>
              )}
              
              {canSuite(SUITE_PERMISSIONS.MANAGE_APP_ACCESS) && (
                <SidebarItem icon={ShieldCheck} label="Access Control" to="/dashboard/modules" onNavigate={onNavigate} disabled={isImpersonating} />
              )}

              {canSuite(SUITE_PERMISSIONS.MANAGE_BILLING) && (
                <SidebarItem icon={CreditCard} label="Billing" to="/dashboard/subscriptions" onNavigate={onNavigate} disabled={isImpersonating} />
              )}
              
              {canSuite(SUITE_PERMISSIONS.VIEW_ANALYTICS) && (
                <SidebarItem icon={BarChart} label="Analytics" to="/dashboard/analytics" onNavigate={onNavigate} />
              )}

              {canSuite(SUITE_PERMISSIONS.MANAGE_ORGANIZATION) && (
                <SidebarItem icon={DatabaseBackup} label="Data Export" to="/dashboard/data-export" onNavigate={onNavigate} disabled={isImpersonating} />
              )}

              {canSuite(SUITE_PERMISSIONS.MANAGE_ORGANIZATION) && (
                <SidebarItem icon={Settings} label="Settings" to="/admin/center" onNavigate={onNavigate} disabled={isImpersonating} />
              )}
            </>
          )}
        </div>
      </div>
      
      {/* User Profile Link + Logout (always visible) */}
      <div className="mt-auto p-4 border-t border-pl-border space-y-1">
        <NavLink to="/profile" onClick={onNavigate} className={cn(ITEM, "text-pl-muted hover:text-pl-text hover:bg-pl-raised/60")}>
          <div className="h-8 w-8 rounded-full bg-pl-raised flex items-center justify-center">
            <Users className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-pl-text text-xs font-medium truncate">My Profile</p>
            <p className="text-pl-muted text-[11px] truncate">View account</p>
          </div>
        </NavLink>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className={cn(ITEM, "w-full text-pl-muted hover:text-pl-danger-text hover:bg-pl-danger-bg")}
            >
              <div className="h-8 w-8 rounded-full bg-pl-raised flex items-center justify-center">
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="flex-1 min-w-0 text-left truncate">Log out</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent data-pl-theme="dark" className="bg-pl-raised border-pl-border text-pl-text shadow-pl-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Log out of Petrolord Suite?</AlertDialogTitle>
              <AlertDialogDescription className="text-pl-muted">
                You'll be returned to the login screen and will need to sign in again to continue.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-transparent border-pl-border-strong text-pl-text hover:bg-pl-sunken hover:text-pl-text focus-visible:ring-pl-focus">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout} className="bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90 focus-visible:ring-pl-focus">
                Log out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </nav>
  );
};

// Fix Icon reference
const Reservoir = Droplet;

export default DashboardSidebar;