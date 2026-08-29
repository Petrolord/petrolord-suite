// LPG & CNG Rollout Studio (Midstream & Downstream DS7).
//
// Two fuels, one commercial question. The fleet model and the queue model
// are each written once and used on both sides.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="flex flex-col h-full bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/midstream-downstream">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0 mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Midstream &amp; Downstream
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-2 rounded-xl shadow-lg">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">LPG &amp; CNG Rollout Studio</h1>
                <p className="text-slate-400 text-xs">
                  Bottling, storage and cylinder logistics for LPG; cascade, compression and dispensing for CNG; and whether the customer is better off switching.
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
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <RolloutInputs />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-900 border border-slate-800">
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

const LpgCngRolloutStudio = () => (
  <>
    <Helmet>
      <title>LPG &amp; CNG Rollout Studio - Petrolord Suite</title>
      <meta name="description" content="LPG bottling, storage and cylinder-fleet logistics; CNG cascade storage, compression and dispensing; and vehicle conversion economics with the emissions avoided." />
    </Helmet>
    <LpgCngProvider>
      <Workspace />
    </LpgCngProvider>
  </>
);

export default LpgCngRolloutStudio;
