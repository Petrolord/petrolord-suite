import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { BarChart2, CheckSquare, ChevronLeft, FilePlus2, FileText, LayoutDashboard, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AssuranceHelp from '@/components/assurance/AssuranceHelp';

export const BASE = '/dashboard/apps/assurance/document-control';

/**
 * AS4 — the app shell, on the UI tokens.
 *
 * Every colour in this file, and in all six pages under it, was a
 * hardcoded hex: #0F1419, #232B3A, #2D3748, #E2E8F0, #A0AEC0, #3B82F6.
 * The app was a dark theme painted on by hand, so it ignored the user's
 * theme entirely and sat inside the Suite shell looking like a
 * different product. The tokens are what every other rebuilt module
 * uses.
 */
export const DocControlShell = ({
  children,
  title = 'Document Control',
  subtitle = 'Controlled documents, revisions and review dates',
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const navItems = [
    { name: 'Dashboard', path: BASE, icon: LayoutDashboard, exact: true },
    { name: 'Library', path: `${BASE}/library`, icon: Library },
    { name: 'New document', path: `${BASE}/new`, icon: FilePlus2 },
    { name: 'Approvals', path: `${BASE}/approvals`, icon: CheckSquare },
    { name: 'Reports', path: `${BASE}/reports`, icon: BarChart2 },
  ];

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="flex-none border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 -ml-2"
              onClick={() => navigate('/dashboard/assurance')}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Assurance
            </Button>
            <div className="h-8 w-px bg-[hsl(var(--border))] hidden md:block" />
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[hsl(var(--primary))]/10 rounded-lg">
                <FileText className="w-6 h-6 text-[hsl(var(--primary))]" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">{title}</h1>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p>
              </div>
            </div>
          </div>
          <AssuranceHelp appKey="documents" />
        </div>

        <div className="px-6 flex gap-6 mt-2 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.path : pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-sm ${
                  isActive
                    ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--border))]'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </NavLink>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl h-full">{children}</div>
      </div>
    </div>
  );
};

export default DocControlShell;
