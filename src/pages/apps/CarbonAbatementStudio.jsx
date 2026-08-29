// Carbon Footprint & Abatement Studio (Midstream & Downstream DS9).
//
// The roll-up of the dual ledger the rest of the module already produces.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="flex flex-col h-full bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/midstream-downstream">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0 mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Midstream &amp; Downstream
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-2 rounded-xl shadow-lg">
                <Leaf className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Carbon Footprint &amp; Abatement Studio</h1>
                <p className="text-slate-400 text-xs">
                  Scope 1 and 2 from the same data the rest of the module holds, with an abatement curve that says where the measures overlap.
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
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <CarbonInputs />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-900 border border-slate-800">
                <TabsTrigger value="inventory">Inventory &amp; intensity</TabsTrigger>
                <TabsTrigger value="abatement">Abatement &amp; path</TabsTrigger>
              </TabsList>
              <TabsContent value="inventory" className="mt-4"><InventoryResults /></TabsContent>
              <TabsContent value="abatement" className="mt-4"><AbatementResults /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const CarbonAbatementStudio = () => (
  <>
    <Helmet>
      <title>Carbon Footprint &amp; Abatement Studio - Petrolord Suite</title>
      <meta name="description" content="Scope 1 and 2 GHG inventory from stream and fuel data, carbon intensity per tonne, and a marginal abatement cost curve that flags interacting measures." />
    </Helmet>
    <CarbonAbatementProvider>
      <Workspace />
    </CarbonAbatementProvider>
  </>
);

export default CarbonAbatementStudio;
