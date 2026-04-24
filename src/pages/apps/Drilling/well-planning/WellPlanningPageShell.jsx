import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { wellsData } from '../../../../data/wellPlanningData';
import WellList from './WellList';
import WellDetails from './WellDetails';
import { Shovel as Pickaxe } from 'lucide-react';

export default function WellPlanningPageShell() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex h-full w-full bg-background overflow-hidden border border-border rounded-lg">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-card border-r border-border flex flex-col hidden md:flex shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 text-primary rounded-md">
            <Pickaxe className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-foreground tracking-tight">Active Wells</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <button
            onClick={() => navigate('/dashboard/apps/Drilling/well-planning')}
            className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm font-medium ${
              location.pathname.endsWith('well-planning') || location.pathname.endsWith('well-planning/')
                ? 'bg-secondary text-secondary-foreground' 
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
          >
            All Wells Dashboard
          </button>
          
          <div className="pt-4 pb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
              Well Directory
            </p>
          </div>
          
          {wellsData.map(well => (
            <button
              key={well.id}
              onClick={() => navigate(`/dashboard/apps/Drilling/well-planning/${well.id}`)}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm ${
                location.pathname.includes(well.id) 
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm' 
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              {well.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-background relative">
        <Routes>
          <Route path="/" element={<WellList />} />
          <Route path=":wellId" element={<WellDetails />} />
        </Routes>
      </div>
    </div>
  );
}