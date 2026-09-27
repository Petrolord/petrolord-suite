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
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { HubHeader, HubPage, HubSearch, HubSectionTitle, HubToolbar } from '@/components/hubs/HubChrome';

export const MODULE_FILTER = 'Process Safety';

const ProcessSafetyHub = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <HubPage>
      <HubHeader
        title="Process Safety"
        description={(
          <>Layers of protection analysis and SIL determination, consequence modelling of releases,
          fires and explosions, and quantitative risk assessment. Each application opens here once
          it is built and checked against published worked examples.</>
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

export default ProcessSafetyHub;
