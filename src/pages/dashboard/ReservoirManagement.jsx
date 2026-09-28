import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { HubHeader, HubPage, HubSearch, HubSectionTitle, HubToolbar } from '@/components/hubs/HubChrome';

export default function ReservoirManagement() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <HubPage>
      <Helmet>
        <title>Reservoir Management | PetroLord Suite</title>
        <meta name="description" content="Reservoir engineering and management applications." />
      </Helmet>

      <HubHeader
        title="Reservoir Management"
        description="Manage reservoir engineering, simulation, and analysis workflows."
      />

      <HubToolbar>
        <HubSearch value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </HubToolbar>

      <section className="space-y-4">
        <HubSectionTitle>All Applications</HubSectionTitle>
        <ApplicationsGrid moduleFilter="reservoir" searchQuery={searchQuery} />
      </section>
    </HubPage>
  );
}
