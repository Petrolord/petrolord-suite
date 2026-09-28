import React, { Suspense } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

import Dashboard from './Dashboard';
import Register from './Register';
import NewCompliance from './NewCompliance';
import ComplianceDetail from './ComplianceDetail';
import Directory from './Directory';
import Reports from './Reports';
import AssuranceHelp from '@/components/assurance/AssuranceHelp';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ThemedApp } from '@/design/ThemeProvider';

export default function RegulatoryCompliancePageShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const navItems = [
    { name: 'Dashboard', path: '/dashboard/apps/assurance/regulatory-compliance' },
    { name: 'Register', path: '/dashboard/apps/assurance/regulatory-compliance/register' },
    { name: 'Directory', path: '/dashboard/apps/assurance/regulatory-compliance/directory' },
    { name: 'Reports', path: '/dashboard/apps/assurance/regulatory-compliance/reports' }
  ];

  // The tabs are hidden on the two form routes only. The old test
  // counted path segments and hid them on every detail route as well,
  // so opening an obligation lost the app's navigation entirely.
  const isFormView = currentPath.endsWith('/new') || currentPath.endsWith('/edit');

  return (
    <ThemedApp className="flex flex-col h-full w-full bg-[hsl(var(--background))] overflow-hidden" data-testid="regulatory-theme-scope">
      {/* Top Application Header */}
      <div className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm z-20 relative">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 min-w-0">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[hsl(var(--muted-foreground))] hover:text-pl-text hover:bg-pl-sunken -ml-2 transition-colors"
            onClick={() => navigate('/dashboard/assurance')}
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Assurance
          </Button>
          <div className="hidden sm:block h-6 w-px bg-[hsl(var(--border))]"></div>
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-pl-sunken rounded-md">
               <Shield className="w-5 h-5 text-pl-primary-text" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">Regulatory Compliance</h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Identify, track, and manage compliance obligations</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AssuranceHelp appKey="regulatory" />
          <ThemeToggle />
          {/* The Search button that stood here had no handler, no state
              and no target. Search lives on the register and the
              directory, where the rows are. */}
          <Button size="sm" onClick={() => navigate('new')}>
            <Plus className="w-4 h-4 mr-2" /> Add Obligation
          </Button>
        </div>
      </div>

      {/* Sticky Tab Navigation */}
      {!isFormView && (
        <div className="bg-[hsl(var(--card))]/95 backdrop-blur-md border-b border-[hsl(var(--border))] px-4 sm:px-6 flex items-center gap-6 sm:gap-8 shrink-0 z-10 overflow-x-auto">
          {navItems.map(item => {
            const isActive = currentPath === item.path || (item.path !== '/dashboard/apps/assurance/regulatory-compliance' && currentPath.startsWith(item.path));
            return (
              <Link 
                key={item.name} 
                to={item.path}
                className={`py-4 text-sm font-medium transition-all relative outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-sm
                  ${isActive 
                    ? 'text-pl-primary-text' 
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/50 px-2 -mx-2'
                  }
                `}
              >
                {item.name}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-pl-primary"></div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto relative bg-[hsl(var(--background))]">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center h-full w-full opacity-50">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-pl-primary mb-4"></div>
            <p className="text-[hsl(var(--muted-foreground))]">Loading workspace...</p>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="register" element={<Register />} />
            <Route path="new" element={<NewCompliance />} />
            <Route path="directory" element={<Directory />} />
            <Route path="reports" element={<Reports />} />
            <Route path=":id/edit" element={<NewCompliance />} />
            <Route path=":id" element={<ComplianceDetail />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </Suspense>
      </div>
    </ThemedApp>
  );
}
