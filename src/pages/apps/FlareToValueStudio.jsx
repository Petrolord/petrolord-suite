// Flare Gas to Value Studio (Midstream & Downstream DS10).
//
// The module's last app and its bridge back upstream.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="flex flex-col h-full bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/midstream-downstream">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0 mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Midstream &amp; Downstream
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 p-2 rounded-xl shadow-lg">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Flare Gas to Value Studio</h1>
                <p className="text-slate-400 text-xs">
                  Which route the gas you actually have can take, what it is worth, and what recovering it really abates.
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
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <FlareInputs />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-900 border border-slate-800">
                <TabsTrigger value="screening">Gas, screening &amp; bid</TabsTrigger>
                <TabsTrigger value="abatement">Abatement &amp; credits</TabsTrigger>
              </TabsList>
              <TabsContent value="screening" className="mt-4"><ScreeningResults /></TabsContent>
              <TabsContent value="abatement" className="mt-4"><AbatementResults /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const FlareToValueStudio = () => (
  <>
    <Helmet>
      <title>Flare Gas to Value Studio - Petrolord Suite</title>
      <meta name="description" content="Flared and associated gas screened against CNG, mini LNG, liquids extraction and gas to power, with route economics and a counterfactual-based abatement." />
    </Helmet>
    <FlareToValueProvider>
      <Workspace />
    </FlareToValueProvider>
  </>
);

export default FlareToValueStudio;
