import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart2, CalendarRange, ClipboardCheck, FileWarning, LayoutDashboard, ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const BASE = '/dashboard/apps/assurance/audit-manager';

/**
 * AS10 — the app frame, for an app that had no frame because it had no
 * code. The five places an audit programme is actually worked: the
 * programme, the checklists it is run against, the audits themselves,
 * the findings they raise, and the reports.
 */
export const AuditShell = ({
  children,
  title = 'Audit & Findings Manager',
  description = 'The audit programme, its checklists, and the findings they raise',
  actions,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { name: 'Dashboard', path: BASE, icon: LayoutDashboard, exact: true },
    { name: 'Programmes', path: `${BASE}/programmes`, icon: CalendarRange },
    { name: 'Checklists', path: `${BASE}/checklists`, icon: ListChecks },
    { name: 'Audits', path: `${BASE}/audits`, icon: ClipboardCheck },
    { name: 'Findings', path: `${BASE}/findings`, icon: FileWarning },
    { name: 'Reports', path: `${BASE}/reports`, icon: BarChart2 },
  ];

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="flex-none border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/assurance')}
            className="hover:bg-[hsl(var(--secondary))] shrink-0" title="Back to Assurance">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{title}</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] truncate">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-60 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 flex-col hidden lg:flex">
          <div className="p-4 flex-1 space-y-1">
            <p className="px-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">
              Menu
            </p>
            {navItems.map((item) => {
              const isActive = item.exact
                ? location.pathname === item.path || location.pathname === `${item.path}/`
                : location.pathname.startsWith(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.exact}
                  className={`flex items-center px-3 py-2.5 text-sm rounded-md transition-colors ${
                    isActive
                      ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-medium'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <item.icon className="w-4 h-4 mr-3" />
                  {item.name}
                </NavLink>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[hsl(var(--background))]">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default AuditShell;
