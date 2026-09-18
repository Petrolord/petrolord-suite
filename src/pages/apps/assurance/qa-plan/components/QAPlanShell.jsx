import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart2, FileWarning, LayoutDashboard, List, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const BASE = '/dashboard/apps/assurance/qa-plan';

/**
 * AS7 — the app frame.
 *
 * The header's Create Plan button is kept, and now reaches a form that
 * writes to a database. A Raise NCR button is added beside it, because
 * the old app's only route to one was a button on the NCR register that
 * toasted "Raise NCR form..." — so a non-conformance could not be
 * raised from anywhere at all.
 */
export const QAPlanShell = ({
  children,
  title = 'Quality Assurance Plan',
  description = 'Quality plans, inspection and test plans, non-conformance and corrective action',
  actions,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (item) => (item.exact
    ? location.pathname === item.path || location.pathname === `${item.path}/`
    : location.pathname.startsWith(item.path));

  const navItems = [
    { name: 'Dashboard', path: BASE, icon: LayoutDashboard, exact: true },
    { name: 'Quality plans', path: `${BASE}/register`, icon: List },
    { name: 'New plan', path: `${BASE}/new`, icon: Plus },
    { name: 'Non-conformance', path: `${BASE}/ncr-register`, icon: FileWarning },
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
        <div className="flex flex-wrap gap-2">
          {/* AS13: AssuranceHelp appKey="quality" goes here */}
          {actions}
          <Button variant="outline" onClick={() => navigate(`${BASE}/ncr-register?raise=1`)}>
            <FileWarning className="w-4 h-4 mr-2" /> Raise NCR
          </Button>
          <Button onClick={() => navigate(`${BASE}/new`)}>
            <Plus className="w-4 h-4 mr-2" /> Create plan
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-60 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 flex-col hidden lg:flex">
          <div className="p-4 flex-1 space-y-1">
            <p className="px-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">
              Menu
            </p>
            {navItems.map((item) => {
              const active = isActive(item);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.exact}
                  className={`flex items-center px-3 py-2.5 text-sm rounded-md transition-colors ${
                    active
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

        <div className="flex-1 overflow-y-auto bg-[hsl(var(--background))]">
          {/* AS13: the sidebar is lg-only, and below that there was no menu
              at all, only the two header buttons. */}
          <nav aria-label="Quality assurance sections"
            className="lg:hidden flex gap-1 overflow-x-auto border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={`flex items-center shrink-0 px-3 py-1.5 text-sm rounded-md ${
                  isActive(item)
                    ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-medium'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                }`}
              >
                <item.icon className="w-4 h-4 mr-2" />
                {item.name}
              </NavLink>
            ))}
          </nav>
          <div className="p-4 md:p-6">
            <div className="max-w-7xl mx-auto">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QAPlanShell;
