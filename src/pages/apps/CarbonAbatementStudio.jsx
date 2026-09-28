// Carbon Footprint & Abatement Studio (Midstream & Downstream DS9).
//
// The roll-up of the dual ledger the rest of the module already produces.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Leaf } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { ThemedApp } from '@/design/ThemeProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { CarbonAbatementProvider, useCarbonAbatement } from '@/contexts/CarbonAbatementContext';
import CarbonInputs from '@/components/carbonabatement/CarbonInputs';
import InventoryResults from '@/components/carbonabatement/InventoryResults';
import AbatementResults from '@/components/carbonabatement/AbatementResults';
import CarbonAbatementHelpGuide from '@/components/carbonabatement/CarbonAbatementHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useCarbonAbatement();
  const [tab, setTab] = useState('inventory');

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <AppHeader
        title="Carbon Footprint & Abatement Studio"
        eyebrow="Midstream & Downstream"
        subtitle="Scope 1 and 2 from the same data the rest of the module holds, with an abatement curve that says where the measures overlap."
        icon={Leaf}
        backTo="/dashboard/midstream-downstream"
        backLabel="Midstream & Downstream"
        actions={(
          <>
            <div className="w-52">
              <StudioProjectManager
                label="Saved study"
                projects={persistence.projects}
                currentProjectId={persistence.currentProjectId}
                onCreate={persistence.createProject}
                onOpen={persistence.openProject}
                onDelete={persistence.deleteProject}
                confirmDeleteMessage="Delete this carbon study and its saved inputs? This cannot be undone."
              />
            </div>
            <StudioAutoSave
              isSaving={persistence.isSaving}
              saveError={persistence.saveError}
              lastSaveTime={persistence.lastSaveTime}
              onSave={persistence.manualSave}
              disabled={!persistence.currentProjectId}
            />
            <CarbonAbatementHelpGuide />
          </>
        )}
      />

      <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
        <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
          <CarbonInputs />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="inventory">Inventory &amp; intensity</TabsTrigger>
              <TabsTrigger value="abatement">Abatement &amp; path</TabsTrigger>
            </TabsList>
            <TabsContent value="inventory" className="mt-4"><InventoryResults /></TabsContent>
            <TabsContent value="abatement" className="mt-4"><AbatementResults /></TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
};

// Design system rollout w5e: the page wraps itself in <ThemedApp>, so the
// classes below are theme roles; the charts stay white (ChartFrame).
const CarbonAbatementStudio = () => (
  <ThemedApp className="flex min-h-screen flex-col" data-testid="carbon-theme-scope">
    <Helmet>
      <title>Carbon Footprint &amp; Abatement Studio - Petrolord Suite</title>
      <meta name="description" content="Scope 1 and 2 GHG inventory from stream and fuel data, carbon intensity per tonne, and a marginal abatement cost curve that flags interacting measures." />
    </Helmet>
    <CarbonAbatementProvider>
      <Workspace />
    </CarbonAbatementProvider>
  </ThemedApp>
);

export default CarbonAbatementStudio;
