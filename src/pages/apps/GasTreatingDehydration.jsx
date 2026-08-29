// Gas Processing Studio (Facilities F3, Facilities-ROADMAP.md §3
// app 3) — the upgraded Gas Treating & Dehydration on the studio kit,
// keeping its slug (gas-treating-dehydration). One app, three units
// (owner decision F#1): dehydration, sweetening, dew point.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Beaker } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { GasProcessingProvider, useGasProcessing } from '@/contexts/GasProcessingContext';
import { DehydrationInputs, DehydrationResults } from '@/components/gasprocessing/DehydrationPanels';
import {
  SweeteningInputs, SweeteningResults, DewpointInputs, DewpointResults,
} from '@/components/gasprocessing/SweeteningDewPanels';
import GasProcessingHelpContent from '@/components/gasprocessing/GasProcessingHelpGuide';
import { fmt, Row } from '@/components/gasprocessing/fields';

const TABS = [
  { value: 'dehydration', label: 'Dehydration' },
  { value: 'sweetening', label: 'Sweetening' },
  { value: 'dewpoint', label: 'Dew Point' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { dehydration, sweetening, dewpoint } = useGasProcessing();
  return (
    <div className="space-y-1">
      {!dehydration.error && (
        <>
          <Row label="TEG circulation" value={`${fmt(dehydration.circGpm, 1)} gpm`} />
          <Row label="TEG reboiler" value={`${fmt(dehydration.reboilerMMBtuHr, 2)} MMBtu/hr`} />
        </>
      )}
      {!sweetening.error && (
        <>
          <Row label="Amine circulation" value={`${fmt(sweetening.circGpm, 0)} gpm`} />
          <Row label="Amine reboiler" value={`${fmt(sweetening.reboilerMMBtuHr, 1)} MMBtu/hr`} />
        </>
      )}
      {!dewpoint.error && !dewpoint.dropError && (
        <Row label="JT cooling" value={`${fmt(dewpoint.dropF, 1)} F`} />
      )}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'dehydration',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useGasProcessing();

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
      {activeTab === 'dehydration' && (
        <section>
          <SectionLabel>TEG unit</SectionLabel>
          <DehydrationInputs />
        </section>
      )}
      {activeTab === 'sweetening' && (
        <section>
          <SectionLabel>Amine unit</SectionLabel>
          <SweeteningInputs />
        </section>
      )}
      {activeTab === 'dewpoint' && (
        <section>
          <SectionLabel>Pressure drop</SectionLabel>
          <DewpointInputs />
        </section>
      )}
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
      {activeTab === 'dehydration' && <DehydrationResults />}
      {activeTab === 'sweetening' && <SweeteningResults />}
      {activeTab === 'dewpoint' && <DewpointResults />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Gas Processing Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Glycol dehydration with the water balance and reboiler duty split into named parts, amine sweetening from the acid-gas mole balance with customary limits offered, Kremser staged absorption, Souders-Brown contactor sizing, and Joule-Thomson dew point screening derived from the validated z-factor."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Beaker}
            iconGradientClass="from-teal-600 to-cyan-700"
            title="Gas Processing Studio"
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
              title="Gas Processing Guide"
              description="What each unit computes, which choices stay yours, and where the charts remain charts."
              triggerTitle="Gas processing documentation"
            >
              <GasProcessingHelpContent />
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

const GasTreatingDehydration = () => (
  <GasProcessingProvider>
    <StudioContent />
  </GasProcessingProvider>
);

export default GasTreatingDehydration;
