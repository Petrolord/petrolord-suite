// Midstream & Downstream module hub.
//
// The grid is driven from master_apps, so a tile appears here when the
// catalog says it exists and carries the status the catalog gives it. All
// ten applications went Active on 2026-08-30.
//
// This hub deliberately holds no hand-written list of applications. It had
// one - three "track" cards naming the ten apps as bullet points - and it
// went stale the moment the apps shipped, while also looking clickable
// without being clickable. The catalog is the only list.
//
// The module filter matches `master_apps.module`, which is the display name
// rather than the slug (useAppsFromDatabase compares that column
// case-insensitively), so it has to be the exact module text the DS0 seed
// writes.
import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ApplicationsGrid from '@/components/ApplicationsGrid';

export const MODULE_FILTER = 'Midstream & Downstream';

const MidstreamDownstreamHub = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950 text-white">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-2">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-white">Midstream &amp; Downstream</h1>
          <p className="text-slate-400 mt-2">
            Refining, terminals and the fuel supply chain, with the carbon ledger running beside the
            money rather than bolted on afterwards.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        <div className="w-full md:w-96 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input
            placeholder="Search applications..."
            className="pl-10 bg-slate-950 border-slate-800 text-white focus:ring-orange-500/50 placeholder:text-slate-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4 text-white">All Applications</h2>
        <ApplicationsGrid moduleFilter={MODULE_FILTER} searchQuery={searchTerm} />
      </div>
    </div>
  );
};

export default MidstreamDownstreamHub;
