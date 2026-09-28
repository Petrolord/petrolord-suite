// Crude Assay & Blending Studio (Midstream & Downstream DS1).
//
// The module's first app, and the first tile in it to go Active. Everything
// on screen is derived from the assays entered; nothing is stored but the
// inputs.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Beaker } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { CrudeAssayProvider, useCrudeAssay } from '@/contexts/CrudeAssayContext';
import AssayPanel from '@/components/crudeassay/AssayPanel';
import BlendResults from '@/components/crudeassay/BlendResults';
import YieldsPanel from '@/components/crudeassay/YieldsPanel';
import CrudeAssayHelpGuide from '@/components/crudeassay/CrudeAssayHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useCrudeAssay();
  const [tab, setTab] = useState('blend');

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex min-h-screen flex-col bg-pl-bg text-pl-text md:h-screen">
        <AppHeader
          backTo="/dashboard/midstream-downstream"
          backLabel="Back to Midstream & Downstream"
          icon={Beaker}
          title="Crude Assay & Blending Studio"
          actions={(
            <>
              <div className="w-full sm:w-52">
                <StudioProjectManager
                  label="Saved study"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this assay study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <CrudeAssayHelpGuide />
            </>
          )}
        />
        <div className="flex-shrink-0 border-b border-pl-border px-4 py-2 sm:px-6">
          <p className="text-xs text-pl-muted">What the barrel becomes, what the blend looks like, whether it is stable, and what it is worth.</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
          <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
            <AssayPanel />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="blend">Blend &amp; stability</TabsTrigger>
                <TabsTrigger value="yields">Yields &amp; netback</TabsTrigger>
              </TabsList>
              <TabsContent value="blend" className="mt-4">
                <BlendResults />
              </TabsContent>
              <TabsContent value="yields" className="mt-4">
                <YieldsPanel />
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

// Design system rollout batch 5D (docs/scope/DesignSystem-Rollout.md): the
// page wraps itself in <ThemedApp>, so it opens light and the header toggle
// switches it to dark per user. The distillation curves keep the white chart
// standard.
const CrudeAssayBlendingStudio = () => (
  <>
    <Helmet>
      <title>Crude Assay &amp; Blending Studio - Petrolord Suite</title>
      <meta name="description" content="Crude assay cut yields, blend property prediction, asphaltene stability screening and netback valuation." />
    </Helmet>
    <div className="min-h-screen" data-testid="crudeassay-theme-scope">
      <CrudeAssayProvider>
        <Workspace />
      </CrudeAssayProvider>
    </div>
  </>
);

export default CrudeAssayBlendingStudio;
