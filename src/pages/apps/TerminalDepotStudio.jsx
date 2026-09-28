// Terminal & Depot Studio (Midstream & Downstream DS5).
//
// Doctrine 4: uninstrumented first. Everything starts from a dip.
import React from 'react';
import { Helmet } from 'react-helmet';
import { Warehouse } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { ThemedApp } from '@/design/ThemeProvider';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { TerminalDepotProvider, useTerminalDepot } from '@/contexts/TerminalDepotContext';
import TankPanel from '@/components/terminaldepot/TankPanel';
import TerminalResults from '@/components/terminaldepot/TerminalResults';
import TerminalDepotHelpGuide from '@/components/terminaldepot/TerminalDepotHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useTerminalDepot();
  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex min-h-screen flex-col bg-pl-bg text-pl-text md:h-screen">
        <AppHeader
          backTo="/dashboard/midstream-downstream"
          backLabel="Back to Midstream & Downstream"
          icon={Warehouse}
          title="Terminal & Depot Studio"
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
                  confirmDeleteMessage="Delete this terminal study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <TerminalDepotHelpGuide />
            </>
          )}
        />
        <div className="flex-shrink-0 border-b border-pl-border px-4 py-2 sm:px-6">
          <p className="text-xs text-pl-muted">Stock, gain and loss, rack throughput and margin, starting from a dip.</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
          <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
            <TankPanel />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
            <TerminalResults />
          </main>
        </div>
      </div>
    </>
  );
};

// Design system rollout batch 5D (docs/scope/DesignSystem-Rollout.md): the
// page wraps itself in <ThemedApp>, so it opens light and the header toggle
// switches it to dark per user. The gain and loss trend keeps the white
// chart standard.
const TerminalDepotStudio = () => (
  <>
    <Helmet>
      <title>Terminal &amp; Depot Studio - Petrolord Suite</title>
      <meta name="description" content="Terminal stock reconciliation from manual dips and strapping tables, gain and loss trending, loading rack queueing, tank farm cover and throughput economics." />
    </Helmet>
    <ThemedApp className="min-h-screen" data-testid="terminaldepot-theme-scope">
      <TerminalDepotProvider>
        <Workspace />
      </TerminalDepotProvider>
    </ThemedApp>
  </>
);

export default TerminalDepotStudio;
