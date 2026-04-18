import React, { Suspense } from 'react';
import { MaterialBalanceProvider } from '@/contexts/MaterialBalanceContext';
import MBHeader from '@/components/materialBalance/MBHeader';
import MBBottomPanel from '@/components/materialBalance/MBBottomPanel';
import MBTabs from '@/components/materialBalance/MBTabs';
import MBErrorBoundary from '@/components/materialBalance/MBErrorBoundary';
import { Toaster } from '@/components/ui/toaster';

// Material Balance Pro - Main Application Entry
// Phase 5: Complete Integration with Error Boundaries, Project Management, and Unified Data Flow

const MaterialBalancePro = () => {
  return (
    <MBErrorBoundary>
      <MaterialBalanceProvider>
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
          
          {/* Application Header with Project Actions */}
          <MBHeader />
          
          {/* Main Workspace - Tabbed Interface */}
          <div className="flex-1 overflow-hidden relative">
            <Suspense fallback={
                <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4 bg-slate-950">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                    <span className="text-sm font-medium tracking-wide">Loading Material Balance Studio...</span>
                </div>
            }>
              <MBTabs />
            </Suspense>
          </div>

          {/* Status & Audit Footer */}
          <MBBottomPanel />
          
          <Toaster />
        </div>
      </MaterialBalanceProvider>
    </MBErrorBoundary>
  );
};

export default MaterialBalancePro;