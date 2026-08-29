// Modular Refinery Feasibility Studio (Midstream & Downstream DS4).
//
// Doctrine 1's app: modular scale first. The comparison between modular and
// stick-built capital scaling is the whole argument, and it is on the screen
// rather than inside a number.
import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { ModularRefineryProvider, useModularRefinery } from '@/contexts/ModularRefineryContext';
import FeasibilityPanel from '@/components/modularrefinery/FeasibilityPanel';
import ScaleResults from '@/components/modularrefinery/ScaleResults';
import ModularRefineryHelpGuide from '@/components/modularrefinery/ModularRefineryHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useModularRefinery();
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
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Modular Refinery Feasibility Studio</h1>
                <p className="text-slate-400 text-xs">
                  What the barrel becomes, what the plant costs at this scale, and whether the crude will be there.
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
                  confirmDeleteMessage="Delete this feasibility study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <ModularRefineryHelpGuide />
            </div>
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <FeasibilityPanel />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <ScaleResults />
          </main>
        </div>
      </div>
    </>
  );
};

const ModularRefineryFeasibility = () => (
  <>
    <Helmet>
      <title>Modular Refinery Feasibility Studio - Petrolord Suite</title>
      <meta name="description" content="Feasibility for a modular refinery: configuration, yields, modular versus stick-built capital scaling, product slate value, economics and crude supply risk." />
    </Helmet>
    <ModularRefineryProvider>
      <Workspace />
    </ModularRefineryProvider>
  </>
);

export default ModularRefineryFeasibility;
