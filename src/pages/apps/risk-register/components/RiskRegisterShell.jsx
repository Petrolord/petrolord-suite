import React from 'react';
import { ShieldAlert, LayoutDashboard, List, Grid, PieChart, FileBarChart } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackButton } from './BackButton';
import { SnapshotManager } from './SnapshotManager';
import { useRiskReporting } from '../contexts/RiskReportingContext';
import { useRiskRegister } from '../hooks/useRiskRegister';
import AssuranceHelp from '@/components/assurance/AssuranceHelp';

export const RiskRegisterShell = ({ children, activeTab, onTabChange }) => {
  // AS2: the snapshot needs the register it is capturing. It used to
  // capture nothing at all and say it had.
  const { risks } = useRiskRegister();

  // The app's reporting provider. This imported a standalone hook of the
  // same name from @/hooks, whose closeReport acted on private state that
  // nothing rendered, so leaving Advanced Reports never closed the
  // report (AS13). Outside the provider (the New, Edit and Detail routes)
  // there is no report to close.
  const { closeReport, activeReport } = useRiskReporting() || {};

  const handleTabChange = (val) => {
    // If navigating away from advanced reports, clean up active report state
    if (val !== 'advanced-reports' && activeReport) {
      if (closeReport) {
        closeReport();
      }
    }
    if (onTabChange) {
      onTabChange(val);
    }
  };

  const navItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'register', name: 'Risk Register', icon: List },
    { id: 'heatmap', name: 'Heatmap View', icon: Grid },
    { id: 'reports', name: 'Reports', icon: PieChart },
    { id: 'advanced-reports', name: 'Advanced Reports', icon: FileBarChart },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      <div className="flex-none bg-slate-900 border-b border-slate-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton />
            <div className="p-2 bg-cyan-500/20 rounded-lg">
               <ShieldAlert className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">Risk Register</h1>
              <p className="text-xs text-slate-400">Petrolord Assurance Suite</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <SnapshotManager risks={risks} />
            <AssuranceHelp appKey="risk" />
          </div>
        </div>
        
        {activeTab && onTabChange && (
          <div className="px-6">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="bg-transparent rounded-none w-full justify-start h-auto p-0 space-x-6 border-transparent">
                {navItems.map(item => (
                  <TabsTrigger 
                    key={item.id} 
                    value={item.id}
                    className="relative rounded-none px-0 py-3 text-sm font-medium text-slate-400 hover:text-slate-200 data-[state=active]:text-cyan-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-cyan-500"
                  >
                    <item.icon className="w-4 h-4 mr-2" />
                    {item.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto relative">
         {children}
      </div>
    </div>
  );
};