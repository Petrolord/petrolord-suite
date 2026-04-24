import React, { Suspense } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Search as SearchIcon, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

import Dashboard from './Dashboard';
import Register from './Register';
import NewCompliance from './NewCompliance';
import ComplianceDetail from './ComplianceDetail';
import Directory from './Directory';
import Reports from './Reports';

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

  const isFormView = currentPath.includes('/new') || (currentPath.split('/').length > 5 && !currentPath.endsWith('register') && !currentPath.endsWith('directory') && !currentPath.endsWith('reports'));

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--background))] overflow-hidden">
      {/* Top Application Header */}
      <div className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-20 relative">
        <div className="flex items-center gap-6">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10 -ml-2 transition-colors"
            onClick={() => navigate('/dashboard/assurance')}
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Assurance
          </Button>
          <div className="h-6 w-px bg-[hsl(var(--border))]"></div>
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-[hsl(var(--warning))]/10 rounded-md">
               <Shield className="w-5 h-5 text-[hsl(var(--warning))]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">Regulatory Compliance</h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Identify, track, and manage compliance obligations</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]">
            <SearchIcon className="w-4 h-4 mr-2" /> Search
          </Button>
          <Button size="sm" className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 transition-colors border-0" onClick={() => navigate('new')}>
            <Plus className="w-4 h-4 mr-2" /> Add Obligation
          </Button>
        </div>
      </div>

      {/* Sticky Tab Navigation */}
      {!isFormView && (
        <div className="bg-[hsl(var(--card))]/95 backdrop-blur-md border-b border-[hsl(var(--border))] px-6 flex items-center gap-8 shrink-0 z-10">
          {navItems.map(item => {
            const isActive = currentPath === item.path || (item.path !== '/dashboard/apps/assurance/regulatory-compliance' && currentPath.startsWith(item.path));
            return (
              <Link 
                key={item.name} 
                to={item.path}
                className={`py-4 text-sm font-medium transition-all relative outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-sm
                  ${isActive 
                    ? 'text-[hsl(var(--warning))]' 
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/50 px-2 -mx-2'
                  }
                `}
              >
                {item.name}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--warning))] shadow-[0_-2px_10px_rgba(245,158,11,0.5)]"></div>
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
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[hsl(var(--warning))] mb-4"></div>
            <p className="text-[hsl(var(--muted-foreground))]">Loading workspace...</p>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="register" element={<Register />} />
            <Route path="new" element={<NewCompliance />} />
            <Route path="directory" element={<Directory />} />
            <Route path="reports" element={<Reports />} />
            <Route path=":id" element={<ComplianceDetail />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}