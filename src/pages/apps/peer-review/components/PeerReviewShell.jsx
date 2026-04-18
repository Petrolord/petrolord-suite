import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Users, LayoutDashboard, List, PlusCircle, BarChart2, ChevronLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export const PeerReviewShell = ({ children, title = "Peer Review Manager", subtitle = "Technical assurance and decision quality workflow" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const path = location.pathname;

  const navItems = [
    { name: 'Dashboard', path: '/dashboard/apps/assurance/peer-review-manager', icon: LayoutDashboard, exact: true },
    { name: 'Review Register', path: '/dashboard/apps/assurance/peer-review-manager/register', icon: List },
    { name: 'New Review', path: '/dashboard/apps/assurance/peer-review-manager/new', icon: PlusCircle },
    { name: 'Reports', path: '/dashboard/apps/assurance/peer-review-manager/reports', icon: BarChart2 },
  ];

  const handleExport = () => {
     toast({ title: "Export Initiated", description: "Downloading complete peer review archive as CSV." });
  };

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
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleExport} className="border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
               <Download className="w-4 h-4 mr-2" /> Export All
            </Button>
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