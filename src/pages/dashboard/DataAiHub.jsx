// Data & AI module hub (DA0).
//
// The Suite's tenth module. It holds five applications, one per NextGen
// Data & AI course D1 to D5 (NextGen-Remaining-Courses-PLAN.md §15): Data
// Quality Studio, ML Workbench, Electrofacies Studio, the Production
// Forecasting ML Workbench and the AI Evaluation Studio. At DA0 none of them
// was written, and the catalog seed landed the first four as Coming Soon; D5
// seeds its own tile the same way.
//
// Like every other hub, this one holds no hand-written list of applications
// (moduleHubs.test.js): the catalog is the only list, and each tile goes
// Active in the migration that ships its build (DataAI-ROADMAP.md).
//
// The module filter matches `master_apps.module`, which is the display name
// rather than the slug (useAppsFromDatabase compares that column
// case-insensitively), so it has to be the exact module text the DA0 seed
// writes. appRoutePath slugifies that name to `data-ai` for app URLs.
import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ApplicationsGrid from '@/components/ApplicationsGrid';

export const MODULE_FILTER = 'Data & AI';

const DataAiHub = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950 text-white">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-2">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-white">Data &amp; AI</h1>
          <p className="text-slate-400 mt-2">
            Statistics and machine learning on oilfield data: quality checks and outlier tests,
            regression and classification validated on held-out wells, electrofacies by clustering,
            production forecasts by exponential smoothing, and the evaluation of search and
            question-answering systems by ranking metrics and groundedness checks. Each application
            opens here once it is built and checked against published reference results.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        <div className="w-full md:w-96 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input
            placeholder="Search applications..."
            className="pl-10 bg-slate-950 border-slate-800 text-white focus:ring-sky-500/50 placeholder:text-slate-500"
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

export default DataAiHub;
