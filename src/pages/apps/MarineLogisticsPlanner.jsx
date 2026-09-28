// Marine Logistics Planner (Supply Chain SC4, Midstream & Downstream module).
//
// The live counterpart of the NextGen course "Offshore & Marine Logistics".
// Every number is computed by the vendored marine logistics engine
// (packages/engines/engines/supplychain/marineLogistics.js, through the shim
// in src/utils/supplychain/engine/marineLogistics.js); the page holds the
// visible controls and prints the engine's results, reasons and refusals.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Ship } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { MarineLogisticsProvider, useMarineLogistics } from '@/contexts/MarineLogisticsContext';
import InstallationsView from '@/components/marine/InstallationsView';
import VoyagePlanView from '@/components/marine/VoyagePlanView';
import FleetSizingView from '@/components/marine/FleetSizingView';
import FleetVariabilityView from '@/components/marine/FleetVariabilityView';
import DeckPlanView from '@/components/marine/DeckPlanView';
import ShoreBaseView from '@/components/marine/ShoreBaseView';
import MarineLogisticsHelpGuide from '@/components/marine/MarineLogisticsHelpGuide';
import { ENGINE_COMMIT } from '@/utils/supplychain/marineAdapters';

export const TABS = [
  { value: 'installations', label: 'Installations & demand', View: InstallationsView },
  { value: 'voyage', label: 'Voyage plan', View: VoyagePlanView },
  { value: 'fleet', label: 'Fleet sizing', View: FleetSizingView },
  { value: 'variability', label: 'Fleet variability', View: FleetVariabilityView },
  { value: 'deck', label: 'Deck plan', View: DeckPlanView },
  { value: 'shore', label: 'Shore base', View: ShoreBaseView },
];

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, inputs,
  } = useMarineLogistics();
  const [tab, setTab] = useState('installations');
  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex h-full flex-col bg-pl-bg text-pl-text">
        <AppHeader
          backTo="/dashboard/midstream-downstream"
          backLabel="Midstream & Downstream"
          icon={Ship}
          eyebrow="Midstream & Downstream"
          title="Marine Logistics Planner"
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
                  confirmDeleteMessage="Delete this marine logistics study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <MarineLogisticsHelpGuide />
            </>
          )}
        />
        <div className="flex-shrink-0 border-b border-pl-border bg-pl-surface px-4 py-2 sm:px-6">
          <p className="text-xs text-pl-muted">
            Voyage plans, supply vessel fleet sizing and its variability, deck plans and supply base queues, computed by the
            Petrolord marine logistics engine from inputs you state.
          </p>
          <p className="mt-1 text-[11px] text-pl-muted" data-testid="engine-line">
            {inputs.cluster.source === 'ekene' ? 'Ekene demo (synthetic). ' : ''}
            Engine: petrolord-engines {ENGINE_COMMIT.slice(0, 7)}, engines/supplychain/marineLogistics.js.
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 flex h-auto flex-wrap justify-start gap-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          <div className="flex-1 overflow-y-auto p-4">
            {TABS.map(({ value, View }) => (
              <TabsContent key={value} value={value} className="mt-0">
                <View />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </>
  );
};

// Design system rollout batch 5C (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so every class below is a theme role.
const MarineLogisticsPlanner = ({ initialInputs }) => (
  <div data-testid="marine-logistics-theme-scope" className="h-full">
    <Helmet>
      <title>Marine Logistics Planner - Petrolord Suite</title>
      <meta name="description" content="Offshore marine logistics: voyage plans with the binding capacity constraint named, supply vessel fleet sizing with stated rounding rules, fleet variability by seeded Monte Carlo, deck plans by first-fit decreasing, and supply base queues by M/M/c or M/D/c." />
    </Helmet>
    <MarineLogisticsProvider initialInputs={initialInputs}>
      <Workspace />
    </MarineLogisticsProvider>
  </div>
);

export default MarineLogisticsPlanner;
