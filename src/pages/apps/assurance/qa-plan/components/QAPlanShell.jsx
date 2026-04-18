import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, List, Plus, FileWarning, BarChart2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const QAPlanShell = ({ children, title = "Quality Assurance Plan", description = "Manage quality requirements and compliance" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const navItems = [
    { name: 'Dashboard', path: '/dashboard/apps/assurance/qa-plan', icon: LayoutDashboard },
    { name: 'QA Register', path: '/dashboard/apps/assurance/qa-plan/register', icon: List },
    { name: 'New Plan', path: '/dashboard/apps/assurance/qa-plan/new', icon: Plus },
    { name: 'NCRs', path: '/dashboard/apps/assurance/qa-plan/ncr-register', icon: FileWarning },
    { name: 'Reports', path: '/dashboard/apps/assurance/qa-plan/reports', icon: BarChart2 },
  ];

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Top Nav / Header */}
      <div className="flex-none border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/assurance')} className="mr-2 hover:bg-[hsl(var(--secondary))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">{title}</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
          </div>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" className="border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/qa-plan/new')}>
              <Plus className="w-4 h-4 mr-2" /> Create Plan
            </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Nav */}
        <div className="w-64 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 flex flex-col hidden md:flex">
          <div className="p-4 flex-1 space-y-1">
            <p className="px-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">Menu</p>
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path !== '/dashboard/apps/assurance/qa-plan' && location.pathname.startsWith(item.path));
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-3 py-2.5 text-sm rounded-md transition-colors ${
                    isActive 
                      ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-medium' 
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <item.icon className={`w-4 h-4 mr-3 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} />
                  {item.name}
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[hsl(var(--background))]">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QAPlanShell;