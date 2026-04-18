import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Droplets, Search } from 'lucide-react';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { Input } from '@/components/ui/input';

export default function ReservoirManagement() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Helmet>
        <title>Reservoir Management | PetroLord Suite</title>
        <meta name="description" content="Reservoir engineering and management applications." />
      </Helmet>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Droplets className="w-8 h-8 text-blue-500" />
            Reservoir Management
          </h1>
          <p className="text-slate-400 mt-2">Manage reservoir engineering, simulation, and analysis workflows.</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input 
            placeholder="Search applications..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-900 border-slate-800 text-white"
          />
        </div>
      </div>

      <ApplicationsGrid moduleFilter="reservoir" searchQuery={searchQuery} />
    </div>
  );
}