// LPG & CNG Rollout Studio (Midstream & Downstream DS7).
//
// Two fuels, one commercial question. The fleet model and the queue model
// are each written once and used on both sides.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Flame } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { ThemedApp } from '@/design/ThemeProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { LpgCngProvider, useLpgCng } from '@/contexts/LpgCngContext';
import RolloutInputs from '@/components/lpgcng/RolloutInputs';
import LpgResults from '@/components/lpgcng/LpgResults';
import CngResults from '@/components/lpgcng/CngResults';
import ConversionResults from '@/components/lpgcng/ConversionResults';
import LpgCngHelpGuide from '@/components/lpgcng/LpgCngHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useLpgCng();
  const [tab, setTab] = useState('lpg');

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex min-h-screen flex-col bg-pl-bg text-pl-text md:h-screen">
        <AppHeader
          backTo="/dashboard/midstream-downstream"
          backLabel="Back to Midstream & Downstream"
          icon={Flame}
          title="LPG & CNG Rollout Studio"
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
                  confirmDeleteMessage="Delete this rollout study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <LpgCngHelpGuide />
            </>
          )}
        />
        <div className="flex-shrink-0 border-b border-pl-border px-4 py-2 sm:px-6">
          <p className="text-xs text-pl-muted">Bottling, storage and cylinder logistics for LPG; cascade, compression and dispensing for CNG; and whether the customer is better off switching.</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
          <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
            <RolloutInputs />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="lpg">LPG</TabsTrigger>
                <TabsTrigger value="cng">CNG</TabsTrigger>
                <TabsTrigger value="conversion">Conversion case</TabsTrigger>
              </TabsList>
              <TabsContent value="lpg" className="mt-4"><LpgResults /></TabsContent>
              <TabsContent value="cng" className="mt-4"><CngResults /></TabsContent>
              <TabsContent value="conversion" className="mt-4"><ConversionResults /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

// Design system rollout batch 5D (docs/scope/DesignSystem-Rollout.md): the
// page wraps itself in <ThemedApp>, so it opens light and the header toggle
// switches it to dark per user. The cylinder, trailer and cost charts keep
// the white chart standard.
const LpgCngRolloutStudio = () => (
  <>
    <Helmet>
      <title>LPG &amp; CNG Rollout Studio - Petrolord Suite</title>
      <meta name="description" content="LPG bottling, storage and cylinder-fleet logistics; CNG cascade storage, compression and dispensing; and vehicle conversion economics with the emissions avoided." />
    </Helmet>
    <ThemedApp className="min-h-screen" data-testid="lpgcng-theme-scope">
      <LpgCngProvider>
        <Workspace />
      </LpgCngProvider>
    </ThemedApp>
  </>
);

export default LpgCngRolloutStudio;
