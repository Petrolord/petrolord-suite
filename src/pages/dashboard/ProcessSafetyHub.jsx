// Process Safety module hub (PS0).
//
// The Suite's ninth module. It will hold three applications, one per
// NextGen HSE course H3 to H5 (NextGen-Remaining-Courses-PLAN.md §14):
// LOPA & SIL Studio, Consequence Modelling Studio and QRA Studio. At PS0
// none of them is written, and the catalog seed lands all three as Coming
// Soon, so the grid below shows exactly that.
//
// Like every other hub, this one holds no hand-written list of applications
// (moduleHubs.test.js): the catalog is the only list, and each tile goes
// Active in the migration that ships its build (ProcessSafety-ROADMAP.md).
//
// The module filter matches `master_apps.module`, which is the display name
// rather than the slug (useAppsFromDatabase compares that column
// case-insensitively), so it has to be the exact module text the PS0 seed
// writes.
//
// The slug is `process-safety`, never `hse`: `hse` already names the
// external HSE portal (the /dashboard/hse redirect, the HSE dashboard tile
// and the hse_free / hse_premium entitlements).
import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ApplicationsGrid from '@/components/ApplicationsGrid';

export const MODULE_FILTER = 'Process Safety';

const ProcessSafetyHub = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950 text-white">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-2">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-white">Process Safety</h1>
          <p className="text-slate-400 mt-2">
            Layers of protection analysis and SIL determination, consequence modelling of releases,
            fires and explosions, and quantitative risk assessment. Each application opens here once
            it is built and checked against published worked examples.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        <div className="w-full md:w-96 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input
            placeholder="Search applications..."
            className="pl-10 bg-slate-950 border-slate-800 text-white focus:ring-red-500/50 placeholder:text-slate-500"
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

export default ProcessSafetyHub;
