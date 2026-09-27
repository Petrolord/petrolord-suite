import React, { useState, useEffect } from 'react';
import { Share2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { HubHeader, HubPage, HubSearch, HubSectionTitle, HubToolbar } from '@/components/hubs/HubChrome';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';

const ProductionOperationsHub = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const moduleFilter = 'production';
  const { apps, loading, error } = useAppsFromDatabase(moduleFilter);

  useEffect(() => {
    console.log(`Rendering [ProductionOperationsHub] with ${apps?.length || 0} apps from master_apps`);
  }, [apps]);

  return (
    <HubPage>
      <HubHeader
        title="Production Operations Hub"
        description="Central command for field operations, surveillance, maintenance, and optimization."
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

export default ProductionOperationsHub;
