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
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { HubHeader, HubPage, HubSearch, HubSectionTitle, HubToolbar } from '@/components/hubs/HubChrome';

export const MODULE_FILTER = 'Data & AI';

const DataAiHub = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <HubPage>
      <HubHeader
        title="Data & AI"
        description={(
          <>Statistics and machine learning on oilfield data: quality checks and outlier tests,
          regression and classification validated on held-out wells, electrofacies by clustering,
          production forecasts by exponential smoothing, and the evaluation of search and
          question-answering systems by ranking metrics and groundedness checks. Each application
          opens here once it is built and checked against published reference results.</>
        )}
      />

      <HubToolbar>
        <HubSearch value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </HubToolbar>

      <section className="space-y-4">
        <HubSectionTitle>All Applications</HubSectionTitle>
        <ApplicationsGrid moduleFilter={MODULE_FILTER} searchQuery={searchTerm} />
      </section>
    </HubPage>
  );
};

export default DataAiHub;
