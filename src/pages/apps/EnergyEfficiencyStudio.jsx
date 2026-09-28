// Energy & Utilities Efficiency Studio (Midstream & Downstream DS8).
//
// Track C opens here: every saving priced in money and in carbon from the
// same energy, in the same run.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Gauge } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { EnergyEfficiencyProvider, useEnergyEfficiency } from '@/contexts/EnergyEfficiencyContext';
import { FullPrecisionProvider, FullPrecisionToggle } from '@/components/fullprecision/FullPrecision';
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
      <div className="flex h-full flex-col bg-pl-bg text-pl-text">
        <AppHeader
          backTo="/dashboard/midstream-downstream"
          backLabel="Midstream & Downstream"
          icon={Gauge}
          eyebrow="Midstream & Downstream"
          title="Energy & Utilities Efficiency Studio"
          subtitle="Stack losses, excess air, steam and heat integration, with every saving priced in money and in carbon from the same energy."
          className="static flex-shrink-0"
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
              <FullPrecisionToggle app="energy-efficiency-studio" />
              <EnergyEfficiencyHelpGuide />
            </>
          )}
        />

        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
            <EfficiencyInputs />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto flex-wrap justify-start">
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

// Design system rollout batch 5C (docs/scope/DesignSystem-Rollout.md): the
// page wraps itself in <ThemedApp>, so every class below is a theme role.
const EnergyEfficiencyStudio = () => (
  <div data-testid="energy-efficiency-theme-scope" className="h-full">
    <Helmet>
      <title>Energy &amp; Utilities Efficiency Studio - Petrolord Suite</title>
      <meta name="description" content="Fired-heater efficiency by the indirect stack-loss method, excess-air optimisation, steam system screening, energy intensity and pinch heat-integration targets." />
    </Helmet>
    <EnergyEfficiencyProvider>
      <FullPrecisionProvider>
        <Workspace />
      </FullPrecisionProvider>
    </EnergyEfficiencyProvider>
  </div>
);

export default EnergyEfficiencyStudio;
