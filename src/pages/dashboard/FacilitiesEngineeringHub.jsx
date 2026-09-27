// Facilities Engineering module hub.
//
// This hub promotes no individual application, and it should not. It
// carried a single hand-written card for Produced Water Treatment,
// linking to /apps/produced-water-treatment - a path that matches no route,
// since the app lives at /dashboard/apps/facilities/produced-water-treatment.
// So the one app it promoted was the one app on this page you could not
// open.
//
// Produced Water Treatment was rebuilt at F7 and is Active, so it sits in
// the catalog grid below with the other twelve. The catalog is the only
// list: anything hand-written here goes stale the moment an app ships,
// and it promotes by whoever edited the file last rather than by merit.
import React, { useState, useEffect } from 'react';
import { Share2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { HubHeader, HubPage, HubSearch, HubSectionTitle, HubToolbar } from '@/components/hubs/HubChrome';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';

const FacilitiesEngineeringHub = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const moduleFilter = 'facilities';
  const { apps, loading, error } = useAppsFromDatabase(moduleFilter);

  useEffect(() => {
    console.log(`Rendering [FacilitiesEngineeringHub] with ${apps?.length || 0} apps from master_apps`);
  }, [apps]);

  return (
    <HubPage>
      <HubHeader
        title="Facilities Engineering Hub"
        description="Comprehensive suite for design, operations, safety, and integrity management."
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

      {/* DB Driven Grid */}
      <section className="space-y-4">
        <HubSectionTitle>All Applications</HubSectionTitle>
        <ApplicationsGrid moduleFilter={moduleFilter} searchQuery={searchTerm} />
      </section>
    </HubPage>
  );
};

export default FacilitiesEngineeringHub;
