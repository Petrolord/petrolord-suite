// Materials & Spares Planner (Supply Chain SC3, Midstream & Downstream module).
//
// The live counterpart of the NextGen course "Materials, Spares & Inventory
// Management". Every number is computed by the vendored inventory engine
// (packages/engines/engines/supplychain/inventory.js, through the shim in
// src/utils/supplychain/engine/inventory.js); the page holds the visible
// controls and prints the engine's results, reasons and refusals.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Package } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { MaterialsSparesProvider, useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import RegisterView from '@/components/materials/RegisterView';
import CriticalityAbcView from '@/components/materials/CriticalityAbcView';
import EoqView from '@/components/materials/EoqView';
import SafetyStockView from '@/components/materials/SafetyStockView';
import InsuranceSparesView from '@/components/materials/InsuranceSparesView';
import LeadTimeRiskView from '@/components/materials/LeadTimeRiskView';
import SlowMovingView from '@/components/materials/SlowMovingView';
import MaterialsSparesHelpGuide from '@/components/materials/MaterialsSparesHelpGuide';
import { ENGINE_COMMIT } from '@/utils/supplychain/materialsAdapters';

export const TABS = [
  { value: 'register', label: 'Register', View: RegisterView },
  { value: 'criticality', label: 'Criticality & ABC', View: CriticalityAbcView },
  { value: 'eoq', label: 'EOQ & discounts', View: EoqView },
  { value: 'safety', label: 'Safety stock', View: SafetyStockView },
  { value: 'spares', label: 'Insurance spares', View: InsuranceSparesView },
  { value: 'leadtime', label: 'Lead-time risk', View: LeadTimeRiskView },
  { value: 'slow', label: 'Slow-moving', View: SlowMovingView },
];

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, inputs,
  } = useMaterialsSpares();
  const [tab, setTab] = useState('register');
  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex min-h-screen flex-col bg-pl-bg text-pl-text md:h-screen">
        <AppHeader
          backTo="/dashboard/midstream-downstream"
          backLabel="Back to Midstream & Downstream"
          icon={Package}
          title="Materials & Spares Planner"
          actions={(
            <>
              <div className="w-full sm:w-52">
                <StudioProjectManager
                  label="Saved study"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this materials study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <MaterialsSparesHelpGuide />
            </>
          )}
        />
        <div className="flex-shrink-0 border-b border-pl-border px-4 py-2 sm:px-6">
          <p className="text-xs text-pl-muted">Criticality and ABC, order quantities, safety stock, insurance spares, lead-time risk and slow-moving stock, computed by the Petrolord inventory engine from inputs you state.</p>
          <p className="mt-1 text-[11px] text-pl-muted" data-testid="engine-line">
            {inputs.register.source === 'ekene' ? 'Ekene demo (synthetic). ' : ''}
            Engine: petrolord-engines {ENGINE_COMMIT.slice(0, 7)}, engines/supplychain/inventory.js.
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col md:overflow-hidden">
          <TabsList className="mx-4 mt-3 flex h-auto flex-wrap justify-start gap-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          <div className="min-h-0 flex-1 p-4 md:overflow-y-auto">
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

// Design system rollout batch 5D (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so it opens light and the header toggle
// switches it to dark per user. The engine outputs, reasons and refusals
// print as before, and the charts keep the white chart standard.
const MaterialsSparesPlanner = ({ initialInputs }) => (
  <>
    <Helmet>
      <title>Materials &amp; Spares Planner - Petrolord Suite</title>
      <meta name="description" content="Materials and spares planning: criticality and ABC classes, EOQ and quantity discounts, safety stock and reorder points for normal and Poisson demand, insurance spares, lead-time risk by seeded Monte Carlo, and slow-moving and obsolete stock." />
    </Helmet>
    <div className="min-h-screen" data-testid="materials-theme-scope">
      <MaterialsSparesProvider initialInputs={initialInputs}>
        <Workspace />
      </MaterialsSparesProvider>
    </div>
  </>
);

export default MaterialsSparesPlanner;
