// Marine Logistics Planner (Supply Chain SC4, Midstream & Downstream module).
//
// The live counterpart of the NextGen course "Offshore & Marine Logistics".
// Every number is computed by the vendored marine logistics engine
// (packages/engines/engines/supplychain/marineLogistics.js, through the shim
// in src/utils/supplychain/engine/marineLogistics.js); the page holds the
// visible controls and prints the engine's results, reasons and refusals.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="flex h-full flex-col bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/midstream-downstream">
            <Button variant="ghost" size="sm" className="mb-2 pl-0 text-slate-400 hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" /> Midstream &amp; Downstream
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 p-2 shadow-lg">
                <Ship className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Marine Logistics Planner</h1>
                <p className="text-xs text-slate-400">
                  Voyage plans, supply vessel fleet sizing and its variability, deck plans and supply base queues, computed by the
                  Petrolord marine logistics engine from inputs you state.
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
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500" data-testid="engine-line">
            {inputs.cluster.source === 'ekene' ? 'Ekene demo (synthetic). ' : ''}
            Engine: petrolord-engines {ENGINE_COMMIT.slice(0, 7)}, engines/supplychain/marineLogistics.js.
          </p>
        </header>
        <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 flex h-auto flex-wrap justify-start gap-1 bg-slate-900">
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

const MarineLogisticsPlanner = ({ initialInputs }) => (
  <>
    <Helmet>
      <title>Marine Logistics Planner - Petrolord Suite</title>
      <meta name="description" content="Offshore marine logistics: voyage plans with the binding capacity constraint named, supply vessel fleet sizing with stated rounding rules, fleet variability by seeded Monte Carlo, deck plans by first-fit decreasing, and supply base queues by M/M/c or M/D/c." />
    </Helmet>
    <MarineLogisticsProvider initialInputs={initialInputs}>
      <Workspace />
    </MarineLogisticsProvider>
  </>
);

export default MarineLogisticsPlanner;
