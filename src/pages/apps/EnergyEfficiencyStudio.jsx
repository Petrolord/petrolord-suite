// Energy & Utilities Efficiency Studio (Midstream & Downstream DS8).
//
// Track C opens here: every saving priced in money and in carbon from the
// same energy, in the same run.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { EnergyEfficiencyProvider, useEnergyEfficiency } from '@/contexts/EnergyEfficiencyContext';
import EfficiencyInputs from '@/components/energyefficiency/EfficiencyInputs';
import CombustionResults from '@/components/energyefficiency/CombustionResults';
import UtilitiesResults from '@/components/energyefficiency/UtilitiesResults';
import PinchResults from '@/components/energyefficiency/PinchResults';
import EnergyEfficiencyHelpGuide from '@/components/energyefficiency/EnergyEfficiencyHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useEnergyEfficiency();
  const [tab, setTab] = useState('combustion');

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
              <div className="bg-gradient-to-r from-lime-500 to-emerald-500 p-2 rounded-xl shadow-lg">
                <Gauge className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Energy &amp; Utilities Efficiency Studio</h1>
                <p className="text-slate-400 text-xs">
                  Stack losses, excess air, steam and heat integration, with every saving priced in money and in carbon from the same energy.
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
                  confirmDeleteMessage="Delete this efficiency study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <EnergyEfficiencyHelpGuide />
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <EfficiencyInputs />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-900 border border-slate-800">
                <TabsTrigger value="combustion">Combustion &amp; heaters</TabsTrigger>
                <TabsTrigger value="utilities">Steam, intensity &amp; register</TabsTrigger>
                <TabsTrigger value="pinch">Heat integration</TabsTrigger>
              </TabsList>
              <TabsContent value="combustion" className="mt-4"><CombustionResults /></TabsContent>
              <TabsContent value="utilities" className="mt-4"><UtilitiesResults /></TabsContent>
              <TabsContent value="pinch" className="mt-4"><PinchResults /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const EnergyEfficiencyStudio = () => (
  <>
    <Helmet>
      <title>Energy &amp; Utilities Efficiency Studio - Petrolord Suite</title>
      <meta name="description" content="Fired-heater efficiency by the indirect stack-loss method, excess-air optimisation, steam system screening, energy intensity and pinch heat-integration targets." />
    </Helmet>
    <EnergyEfficiencyProvider>
      <Workspace />
    </EnergyEfficiencyProvider>
  </>
);

export default EnergyEfficiencyStudio;
