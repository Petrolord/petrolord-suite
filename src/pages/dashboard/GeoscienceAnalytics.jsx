import React, { useState } from 'react';
import { Share2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { HubHeader, HubPage, HubSearch, HubSectionTitle, HubToolbar } from '@/components/hubs/HubChrome';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';

const GeoscienceAnalytics = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const { apps } = useAppsFromDatabase();

  const moduleFilter = "geoscience";

  return (
    <HubPage>
      <HubHeader
        title="Geoscience Analytics Hub"
        description="Explore and analyze subsurface data with advanced geological and geophysical tools."
        actions={(
          <>
            <Button variant="outline">
              <Share2 className="w-4 h-4 mr-2" aria-hidden="true" /> Share Workspace
            </Button>
            <Button>
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> Add Custom App
            </Button>
          </>
        )}
      />

      <HubToolbar>
        <HubSearch value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </HubToolbar>

      {/* DB Driven Grid handles routing (the retired earthmodel-pro slugs redirect to Earth Modeling in App.jsx) */}
      <section className="space-y-4">
        <HubSectionTitle>All Applications</HubSectionTitle>
        <ApplicationsGrid moduleFilter={moduleFilter} searchQuery={searchTerm} />
      </section>
    </HubPage>
  );
};

export default GeoscienceAnalytics;
