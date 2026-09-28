// Flare Gas to Value Studio (Midstream & Downstream DS10).
//
// The module's last app and its bridge back upstream.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Flame } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { FlareToValueProvider, useFlareToValue } from '@/contexts/FlareToValueContext';
import FlareInputs from '@/components/flaretovalue/FlareInputs';
import ScreeningResults from '@/components/flaretovalue/ScreeningResults';
import AbatementResults from '@/components/flaretovalue/AbatementResults';
import FlareToValueHelpGuide from '@/components/flaretovalue/FlareToValueHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useFlareToValue();
  const [tab, setTab] = useState('screening');

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <AppHeader
        title="Flare Gas to Value Studio"
        eyebrow="Midstream & Downstream"
        subtitle="Which route the gas you actually have can take, what it is worth, and what recovering it really abates."
        icon={Flame}
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
                confirmDeleteMessage="Delete this flare study and its saved inputs? This cannot be undone."
              />
            </div>
            <StudioAutoSave
              isSaving={persistence.isSaving}
              saveError={persistence.saveError}
              lastSaveTime={persistence.lastSaveTime}
              onSave={persistence.manualSave}
              disabled={!persistence.currentProjectId}
            />
            <FlareToValueHelpGuide />
          </>
        )}
      />

      <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
        <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
          <FlareInputs />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="screening">Gas, screening &amp; bid</TabsTrigger>
              <TabsTrigger value="abatement">Abatement &amp; credits</TabsTrigger>
            </TabsList>
            <TabsContent value="screening" className="mt-4"><ScreeningResults /></TabsContent>
            <TabsContent value="abatement" className="mt-4"><AbatementResults /></TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
};

// Design system rollout w5e: the page sits in the dashboard scope, so the
// classes below are theme roles; the charts stay white (ChartFrame).
const FlareToValueStudio = () => (
  <div className="flex min-h-screen flex-col" data-testid="flare-theme-scope">
    <Helmet>
      <title>Flare Gas to Value Studio - Petrolord Suite</title>
      <meta name="description" content="Flared and associated gas screened against CNG, mini LNG, liquids extraction and gas to power, with route economics and a counterfactual-based abatement." />
    </Helmet>
    <FlareToValueProvider>
      <Workspace />
    </FlareToValueProvider>
  </div>
);

export default FlareToValueStudio;
