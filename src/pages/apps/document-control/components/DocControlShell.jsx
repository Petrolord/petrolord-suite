import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FileText, LayoutDashboard, Library, FilePlus2, CheckSquare, BarChart2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const DocControlShell = ({ children, title = "Document Control", subtitle = "Enterprise Document Management System" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const navItems = [
    { name: 'Dashboard', path: '/dashboard/apps/assurance/document-control', icon: LayoutDashboard, exact: true },
    { name: 'Library', path: '/dashboard/apps/assurance/document-control/library', icon: Library },
    { name: 'New Document', path: '/dashboard/apps/assurance/document-control/new', icon: FilePlus2 },
    { name: 'Approvals', path: '/dashboard/apps/assurance/document-control/approvals', icon: CheckSquare },
    { name: 'Reports', path: '/dashboard/apps/assurance/document-control/reports', icon: BarChart2 },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0F1419] text-[#E2E8F0]">
      {/* Header */}
      <div className="flex-none border-b border-[#2D3748] bg-[#232B3A]">
        <div className="px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => navigate('/dashboard/assurance')}
              className="bg-[#3B82F6] hover:bg-[#2563EB] text-[#FFFFFF] shadow-sm rounded-md flex items-center gap-2 px-4 py-2"
              size="sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Assurance
            </Button>
            
            <div className="h-8 w-px bg-[#2D3748] hidden md:block"></div>
            
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#3B82F6]/10 rounded-lg">
                 <FileText className="w-6 h-6 text-[#3B82F6]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#E2E8F0] tracking-tight">{title}</h1>
                <p className="text-sm text-[#A0AEC0]">{subtitle}</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Global Actions could go here */}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 flex gap-6 mt-2 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = item.exact ? path === item.path : path.startsWith(item.path);
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive 
                    ? 'border-[#3B82F6] text-[#3B82F6]' 
                    : 'border-transparent text-[#A0AEC0] hover:text-[#E2E8F0] hover:border-[#2D3748]'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-[#0F1419] p-6">
        <div className="mx-auto max-w-7xl h-full">
          {children}
        </div>
      </div>
    </div>
  );
};