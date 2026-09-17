import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Users, LayoutDashboard, List, PlusCircle, BarChart2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const BASE = '/dashboard/apps/assurance/peer-review-manager';

export const PeerReviewShell = ({ children, title = "Peer Review Manager", subtitle = "Technical assurance and decision quality workflow" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const navItems = [
    { name: 'Dashboard', path: BASE, icon: LayoutDashboard, exact: true },
    { name: 'Register', path: `${BASE}/register`, icon: List },
    { name: 'New Review', path: `${BASE}/new`, icon: PlusCircle },
    { name: 'Reports', path: `${BASE}/reports`, icon: BarChart2 },
  ];

  // AS5: the Export button that stood in this header toasted
  // "Downloading complete peer review archive as CSV" and downloaded
  // nothing. Export lives on the register and the reports page, where
  // the rows are.

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))] overflow-hidden">
      <div className="flex-none border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => navigate('/dashboard/assurance')}
              className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] text-[hsl(var(--primary-foreground))] shadow-sm rounded-md flex items-center gap-2 px-4 py-2"
              size="sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Assurance
            </Button>
            
            <div className="h-8 w-px bg-[hsl(var(--border))] hidden md:block"></div>
            
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[hsl(var(--primary))]/10 rounded-lg">
                 <Users className="w-6 h-6 text-[hsl(var(--primary))]" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">{title}</h1>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 flex gap-6 mt-2 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = item.exact ? path === item.path : path.startsWith(item.path);
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

      <div className="flex-1 overflow-y-auto p-6 bg-[hsl(var(--background))]">
        <div className="mx-auto max-w-7xl h-full">
          {children}
        </div>
      </div>
    </div>
  );
};

export default PeerReviewShell;
