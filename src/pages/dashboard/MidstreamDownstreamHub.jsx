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
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { HubHeader, HubPage, HubSearch, HubSectionTitle, HubToolbar } from '@/components/hubs/HubChrome';

export const MODULE_FILTER = 'Midstream & Downstream';

const MidstreamDownstreamHub = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <HubPage>
      <HubHeader
        title="Midstream & Downstream"
        description={(
          <>Refining, terminals and the fuel supply chain, with the carbon ledger kept beside the
          money from the start.</>
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

export default MidstreamDownstreamHub;
