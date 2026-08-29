// Midstream & Downstream module hub (DS0).
//
// Follows the FacilitiesEngineeringHub pattern: the grid is driven from
// master_apps, so a tile appears here when the catalog says it exists and
// carries the status the catalog gives it. Every app in this module is Coming
// Soon on the day this ships, and each goes Active in the migration that
// ships its own build.
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

// The three tracks, in the order the roadmap builds them. Stated here so the
// hub explains the module's shape rather than presenting ten tiles as a flat
// list of things that do not exist yet.
const TRACKS = [
  {
    id: 'refining',
    title: 'Refining core',
    blurb: 'Crude in, products out: what a barrel becomes, what a blend must meet, what the plan says and what actually happened.',
    apps: ['Crude Assay & Blending Studio', 'Product Blending Optimizer', 'Refinery Planning & Scheduling Studio', 'Modular Refinery Feasibility Studio'],
  },
  {
    id: 'commercial',
    title: 'Commercial and logistics',
    blurb: 'Terminals, pricing and distribution, built for operations that run on a dip tape and a spreadsheet rather than full instrumentation.',
    apps: ['Terminal & Depot Studio', 'Fuel Pricing & Supply Chain Studio', 'LPG & CNG Rollout Studio'],
  },
  {
    id: 'transition',
    title: 'Energy transition',
    blurb: 'Energy waste found and priced, carbon accounted from the same data the rest of the module already holds, and flared gas turned into something.',
    apps: ['Energy & Utilities Efficiency Studio', 'Carbon Footprint & Abatement Studio', 'Flare Gas to Value Studio'],
  },
];

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

      <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4">
        <p className="text-sm text-amber-100/90">
          This module is being built. Every application below is listed as Coming Soon and each one
          becomes available as it ships. Nothing here is sold before it works.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {TRACKS.map((track) => (
          <div key={track.id} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white">{track.title}</h2>
            <p className="text-sm text-slate-400 mt-2">{track.blurb}</p>
            <ul className="mt-4 space-y-1">
              {track.apps.map((app) => (
                <li key={app} className="text-sm text-slate-300 flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5">•</span>
                  <span>{app}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
