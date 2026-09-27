// Materials & Spares Planner (Supply Chain SC3, Midstream & Downstream module).
//
// The live counterpart of the NextGen course "Materials, Spares & Inventory
// Management". Every number is computed by the vendored inventory engine
// (packages/engines/engines/supplychain/inventory.js, through the shim in
// src/utils/supplychain/engine/inventory.js); the page holds the visible
// controls and prints the engine's results, reasons and refusals.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="flex h-full flex-col bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/midstream-downstream">
            <Button variant="ghost" size="sm" className="mb-2 pl-0 text-slate-400 hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" /> Midstream &amp; Downstream
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 p-2 shadow-lg">
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Materials &amp; Spares Planner</h1>
                <p className="text-xs text-slate-400">
                  Criticality and ABC, order quantities, safety stock, insurance spares, lead-time risk and slow-moving stock,
                  computed by the Petrolord inventory engine from inputs you state.
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
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500" data-testid="engine-line">
            {inputs.register.source === 'ekene' ? 'Ekene demo (synthetic). ' : ''}
            Engine: petrolord-engines {ENGINE_COMMIT.slice(0, 7)}, engines/supplychain/inventory.js.
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

const MaterialsSparesPlanner = ({ initialInputs }) => (
  <>
    <Helmet>
      <title>Materials &amp; Spares Planner - Petrolord Suite</title>
      <meta name="description" content="Materials and spares planning: criticality and ABC classes, EOQ and quantity discounts, safety stock and reorder points for normal and Poisson demand, insurance spares, lead-time risk by seeded Monte Carlo, and slow-moving and obsolete stock." />
    </Helmet>
    <MaterialsSparesProvider initialInputs={initialInputs}>
      <Workspace />
    </MaterialsSparesProvider>
  </>
);

export default MaterialsSparesPlanner;
