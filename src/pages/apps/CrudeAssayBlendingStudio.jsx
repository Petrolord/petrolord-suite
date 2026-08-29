// Crude Assay & Blending Studio (Midstream & Downstream DS1).
//
// The module's first app, and the first tile in it to go Active. Everything
// on screen is derived from the assays entered; nothing is stored but the
// inputs.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Beaker } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
                <Beaker className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Crude Assay &amp; Blending Studio</h1>
                <p className="text-slate-400 text-xs">
                  What the barrel becomes, what the blend looks like, whether it is stable, and what it is worth.
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
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <AssayPanel />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-900 border border-slate-800">
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

const CrudeAssayBlendingStudio = () => (
  <>
    <Helmet>
      <title>Crude Assay &amp; Blending Studio - Petrolord Suite</title>
      <meta name="description" content="Crude assay cut yields, blend property prediction, asphaltene stability screening and netback valuation." />
    </Helmet>
    <CrudeAssayProvider>
      <Workspace />
    </CrudeAssayProvider>
  </>
);

export default CrudeAssayBlendingStudio;
