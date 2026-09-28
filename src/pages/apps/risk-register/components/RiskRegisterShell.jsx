import React from 'react';
import { ShieldAlert, LayoutDashboard, List, Grid, PieChart, FileBarChart } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackButton } from './BackButton';
import { SnapshotManager } from './SnapshotManager';
import { useRiskReporting } from '../contexts/RiskReportingContext';
import { useRiskRegister } from '../hooks/useRiskRegister';
import AssuranceHelp from '@/components/assurance/AssuranceHelp';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ThemedApp } from '@/design/ThemeProvider';

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
    // Design system (W4E): every Risk Register route renders this shell,
    // so the one theme scope lives here.
    <ThemedApp className="flex flex-col h-full bg-pl-bg text-pl-text" data-testid="risk-theme-scope">
      <div className="flex-none bg-pl-surface border-b border-pl-border">
        <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <BackButton />
            <div className="p-2 bg-pl-sunken rounded-lg">
               <ShieldAlert className="w-6 h-6 text-pl-primary-text" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-pl-text leading-tight">Risk Register</h1>
              <p className="text-xs text-pl-muted">Petrolord Assurance Suite</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <SnapshotManager risks={risks} />
            <AssuranceHelp appKey="risk" />
            <ThemeToggle />
          </div>
        </div>
        
        {activeTab && onTabChange && (
          <div className="px-4 sm:px-6 overflow-x-auto">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="bg-transparent rounded-none w-full min-w-max justify-start h-auto p-0 space-x-6 border-transparent">
                {navItems.map(item => (
                  <TabsTrigger 
                    key={item.id} 
                    value={item.id}
                    className="relative rounded-none px-0 py-3 text-sm font-medium text-pl-muted hover:text-pl-text data-[state=active]:text-pl-primary-text data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-pl-primary"
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
    </ThemedApp>
  );
};
