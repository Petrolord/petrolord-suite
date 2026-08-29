// Fuel Pricing & Supply Chain Studio (Midstream & Downstream DS6).
//
// The build-up from a cargo priced off a marker to a litre at a nozzle,
// with every rate the user's own and every missing one said to be missing.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Fuel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { FuelPricingProvider, useFuelPricing } from '@/contexts/FuelPricingContext';
import PricingInputs from '@/components/fuelpricing/PricingInputs';
import BuildUpResults from '@/components/fuelpricing/BuildUpResults';
import SupplyChainResults from '@/components/fuelpricing/SupplyChainResults';
import FuelPricingHelpGuide from '@/components/fuelpricing/FuelPricingHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useFuelPricing();
  const [tab, setTab] = useState('price');

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
              <div className="bg-gradient-to-r from-cyan-500 to-blue-500 p-2 rounded-xl shadow-lg">
                <Fuel className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Fuel Pricing &amp; Supply Chain Studio</h1>
                <p className="text-slate-400 text-xs">
                  Cargo to nozzle: the landed cost, the pump-price build-up, the lane, and the rate at which the cap breaks.
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
                  confirmDeleteMessage="Delete this pricing study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <FuelPricingHelpGuide />
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <PricingInputs />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-900 border border-slate-800">
                <TabsTrigger value="price">Landed cost &amp; pump price</TabsTrigger>
                <TabsTrigger value="chain">Lane, fleet &amp; station</TabsTrigger>
              </TabsList>
              <TabsContent value="price" className="mt-4">
                <BuildUpResults />
              </TabsContent>
              <TabsContent value="chain" className="mt-4">
                <SupplyChainResults />
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const FuelPricingStudio = () => (
  <>
    <Helmet>
      <title>Fuel Pricing &amp; Supply Chain Studio - Petrolord Suite</title>
      <meta name="description" content="Import-parity landed cost, pump-price build-up and margin waterfall, depot-to-station trucking economics and station throughput sizing." />
    </Helmet>
    <FuelPricingProvider>
      <Workspace />
    </FuelPricingProvider>
  </>
);

export default FuelPricingStudio;
