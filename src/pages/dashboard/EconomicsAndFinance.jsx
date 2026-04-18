import React, { useState, useEffect } from 'react';
import { Share2, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';

/*
  DIAGNOSTIC & VERIFICATION:
  a) Is useAppsFromDatabase called? YES
  b) Module filter: 'economics'
  c) Is any hardcoded app list imported/used? NO
  d) How does ApplicationsGrid receive its data? Via internal hook call using passed moduleFilter
  e) Filters in use: 'economics' (Database)
  
  FINAL VERIFICATION:
  - Runtime Data Source: Database (master_apps table) via useAppsFromDatabase hook
  - Module Filter: 'economics'
  - Hardcoded Lists: None remaining
*/

const EconomicsAndFinance = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const moduleFilter = 'economics';
  const { apps, loading, error } = useAppsFromDatabase(moduleFilter);

  // Diagnostic log just before render logic (placed in effect for cleaner lifecycle logging)
  useEffect(() => {
    console.log(`Rendering [EconomicsAndFinance] with ${apps?.length || 0} apps from master_apps`);
  }, [apps]);

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950 text-white">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Economics & Finance
          </h1>
          <p className="text-slate-400 mt-2">
            Analyze project economics, manage portfolios, and optimize investments.
          </p>
        </div>

        <div className="flex items-center gap-3">
           <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-800 text-white w-64 focus:ring-emerald-500/50"
            />
          </div>
          <Button variant="outline" size="icon" className="border-slate-800 hover:bg-slate-800 text-slate-400">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            <Plus className="h-4 w-4" />
            <span>Add App</span>
          </Button>
        </div>
      </div>

      {/* Applications Grid */}
      <ApplicationsGrid 
        moduleFilter={moduleFilter} 
        searchTerm={searchTerm}
      />
    </div>
  );
};

export default EconomicsAndFinance;