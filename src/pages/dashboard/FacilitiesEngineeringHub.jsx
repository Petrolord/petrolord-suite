// Facilities Engineering module hub.
//
// This hub promotes no individual application, and it should not. It
// carried a single hand-written card for Produced Water Treatment,
// linking to /apps/produced-water-treatment - a path that matches no route,
// since the app lives at /dashboard/apps/facilities/produced-water-treatment.
// So the one app it promoted was the one app on this page you could not
// open.
//
// Produced Water Treatment was rebuilt at F7 and is Active, so it sits in
// the catalog grid below with the other twelve. The catalog is the only
// list: anything hand-written here goes stale the moment an app ships,
// and it promotes by whoever edited the file last rather than by merit.
import React, { useState, useEffect } from 'react';
import { Share2, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';

const FacilitiesEngineeringHub = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const moduleFilter = 'facilities';
  const { apps, loading, error } = useAppsFromDatabase(moduleFilter);

  useEffect(() => {
    console.log(`Rendering [FacilitiesEngineeringHub] with ${apps?.length || 0} apps from master_apps`);
  }, [apps]);

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950 text-white">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Facilities Engineering Hub</h1>
          <p className="text-slate-400 mt-2">Comprehensive suite for design, operations, safety, and integrity management.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
            <Share2 className="w-4 h-4 mr-2" /> Share Workspace
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-500 text-white">
            <Plus className="w-4 h-4 mr-2" /> Add Custom App
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800 mb-6">
        <div className="w-full md:w-96 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input 
            placeholder="Search applications..." 
            className="pl-10 bg-slate-950 border-slate-800 text-white focus:ring-amber-500/50 placeholder:text-slate-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* DB Driven Grid */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4 text-white">All Applications</h2>
        <ApplicationsGrid moduleFilter={moduleFilter} searchQuery={searchTerm} />
      </div>

    </div>
  );
};

export default FacilitiesEngineeringHub;