// Fuel Pricing & Supply Chain Studio (Midstream & Downstream DS6).
//
// The build-up from a cargo priced off a marker to a litre at a nozzle,
// with every rate the user's own and every missing one said to be missing.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Fuel } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
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
      <div className="flex h-full flex-col bg-pl-bg text-pl-text">
        <AppHeader
          backTo="/dashboard/midstream-downstream"
          backLabel="Midstream & Downstream"
          icon={Fuel}
          eyebrow="Midstream & Downstream"
          title="Fuel Pricing & Supply Chain Studio"
          subtitle="Cargo to nozzle: the landed cost, the pump-price build-up, the lane, and the rate at which the cap breaks."
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
            </>
          )}
        />

        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
            <PricingInputs />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto flex-wrap justify-start">
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

// Design system rollout batch 5C (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so every class below is a theme role.
const FuelPricingStudio = () => (
  <div data-testid="fuel-pricing-theme-scope" className="h-full">
    <Helmet>
      <title>Fuel Pricing &amp; Supply Chain Studio - Petrolord Suite</title>
      <meta name="description" content="Import-parity landed cost, pump-price build-up and margin waterfall, depot-to-station trucking economics and station throughput sizing." />
    </Helmet>
    <FuelPricingProvider>
      <Workspace />
    </FuelPricingProvider>
  </div>
);

export default FuelPricingStudio;
