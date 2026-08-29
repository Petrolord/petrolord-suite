// Terminal & Depot Studio (Midstream & Downstream DS5).
//
// Doctrine 4: uninstrumented first. Everything starts from a dip.
import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="flex flex-col h-full bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/midstream-downstream">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0 mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Midstream &amp; Downstream
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-2 rounded-xl shadow-lg">
                <Warehouse className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Terminal &amp; Depot Studio</h1>
                <p className="text-slate-400 text-xs">
                  Stock, gain and loss, rack throughput and margin, starting from a dip.
                </p>
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-52">
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
            </div>
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <TankPanel />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <TerminalResults />
          </main>
        </div>
      </div>
    </>
  );
};

const TerminalDepotStudio = () => (
  <>
    <Helmet>
      <title>Terminal &amp; Depot Studio - Petrolord Suite</title>
      <meta name="description" content="Terminal stock reconciliation from manual dips and strapping tables, gain and loss trending, loading rack queueing, tank farm cover and throughput economics." />
    </Helmet>
    <TerminalDepotProvider>
      <Workspace />
    </TerminalDepotProvider>
  </>
);

export default TerminalDepotStudio;
