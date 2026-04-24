import React, { useState, useEffect } from 'react';
import { Share2, Search, Plus, Droplets, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
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

      {/* Featured Core Workflows */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-white flex items-center">
          <Activity className="w-5 h-5 mr-2 text-amber-500" />
          Featured Applications
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/apps/produced-water-treatment" className="block group">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 hover:border-amber-500 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10">
              <div className="w-12 h-12 bg-amber-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Droplets className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2 group-hover:text-amber-400 transition-colors">Produced Water Treatment</h3>
              <p className="text-slate-400 text-sm">Advanced design and modeling for produced water treatment facilities. Analyze separation trains, OPEX, and efficiency metrics.</p>
            </div>
          </Link>
          {/* We can add more direct feature links here if needed */}
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