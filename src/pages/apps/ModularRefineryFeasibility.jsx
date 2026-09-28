// Modular Refinery Feasibility Studio (Midstream & Downstream DS4).
//
// Doctrine 1's app: modular scale first. The comparison between modular and
// stick-built capital scaling is the whole argument, and it is on the screen
// rather than inside a number.
import React from 'react';
import { Helmet } from 'react-helmet';
import { Building2 } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
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
      <AppHeader
        title="Modular Refinery Feasibility Studio"
        eyebrow="Midstream & Downstream"
        subtitle="What the barrel becomes, what the plant costs at this scale, and whether the crude will be there."
        icon={Building2}
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
          </>
        )}
      />
      <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
        <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
          <FeasibilityPanel />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
          <ScaleResults />
        </main>
      </div>
    </>
  );
};

// Design system rollout w5e: the page wraps itself in <ThemedApp>, so the
// classes below are theme roles; the scale chart stays white (ChartFrame).
const ModularRefineryFeasibility = () => (
  <div className="flex min-h-screen flex-col" data-testid="modular-theme-scope">
    <Helmet>
      <title>Modular Refinery Feasibility Studio - Petrolord Suite</title>
      <meta name="description" content="Feasibility for a modular refinery: configuration, yields, modular versus stick-built capital scaling, product slate value, economics and crude supply risk." />
    </Helmet>
    <ModularRefineryProvider>
      <Workspace />
    </ModularRefineryProvider>
  </div>
);

export default ModularRefineryFeasibility;
