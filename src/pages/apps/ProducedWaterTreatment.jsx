// Produced Water Treatment Studio (Facilities F7,
// Facilities-ROADMAP.md §3 app 7) — rebuilt on droplet physics and
// the studio kit, keeping its slug. The engine is the vendored
// produced-water domain; this page wires it.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Droplets } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { ProducedWaterProvider, useProducedWater } from '@/contexts/ProducedWaterContext';
import {
  WaterInputs, EquipmentInputs, FluidCard, TrainResults, DistributionChart,
} from '@/components/pwtstudio/PwtPanels';
import PwtHelpContent from '@/components/pwtstudio/PwtHelpGuide';
import { fmt, Row } from '@/components/pwtstudio/fields';

const TABS = [
  { value: 'train', label: 'Treatment Train' },
  { value: 'droplets', label: 'Droplets' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { fluid, result } = useProducedWater();
  return (
    <div className="space-y-1">
      {!fluid.error && (
        <>
          <Row label="Water viscosity" value={`${fmt(fluid.muCp, 3)} cp`} />
          <Row label="Density difference" value={`${fmt(fluid.deltaRho, 1)} kg/m3`} />
        </>
      )}
      {!result.error && (
        <>
          <Row label="Outlet OIW" value={`${fmt(result.outletOiwPpm, 1)} ppm`} />
          <Row label="Overall removal" value={`${fmt(result.overallRemovalPct, 1)} %`} />
          <Row label="Droplet median" value={`${fmt(result.inletMedianMicron, 0)} to ${fmt(result.outletMedianMicron, 1)} um`} />
          <Row label="Spec" value={result.meetsSpec === null ? '--' : (result.meetsSpec ? 'met' : 'missed')} />
        </>
      )}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'train',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useProducedWater();

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Study</SectionLabel>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
      </section>
      <section>
        <SectionLabel>Water and train</SectionLabel>
        <WaterInputs />
      </section>
      <section>
        <SectionLabel>Equipment</SectionLabel>
        <EquipmentInputs />
      </section>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Summary</SectionLabel>
        <Summary />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'train' && (
        <>
          <FluidCard />
          <TrainResults />
        </>
      )}
      {activeTab === 'droplets' && (
        <>
          <DistributionChart />
          <FluidCard />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Produced Water Treatment Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Produced water treatment on real droplet physics: a log-normal droplet distribution against each device's grade efficiency and cut size, with API 421 basins, plate packs, hydrocyclones, flotation and media filters sized from their own physics, and the outlet distribution carried forward so each stage faces the harder water the last one left."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Droplets}
            iconGradientClass="from-cyan-600 to-blue-700"
            title="Produced Water Treatment Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <StudioAutoSave
              isSaving={isSaving} saveError={saveError}
              lastSaveTime={lastSaveTime} onSave={manualSave}
            />
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
            <StudioHelp
              title="Produced Water Guide"
              description="Why oil in water is a distribution, why three good devices do not multiply, and where temperature and salinity come in."
              triggerTitle="Produced water documentation"
            >
              <PwtHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={rightPanel}
        main={main}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

const ProducedWaterTreatment = () => (
  <ProducedWaterProvider>
    <StudioContent />
  </ProducedWaterProvider>
);

export default ProducedWaterTreatment;
