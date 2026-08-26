// Reservoir Simulation Studio (S2 of the OPM Flow connectivity program,
// docs/scope/ReservoirSimulationStudio-STATUS.md): deck-first V1 on the
// shared Studio shell. Cases + deck upload/templates, queued runs on the
// VPS worker, honest status + results charts.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Cuboid } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { SimStudioProvider, useSimStudio } from '@/contexts/SimStudioContext';
import DeckPanel from '@/components/simstudio/DeckPanel';
import RunPanel from '@/components/simstudio/RunPanel';
import ResultsPanel from '@/components/simstudio/ResultsPanel';
import SimKpiPanel from '@/components/simstudio/SimKpiPanel';
import SimHelpGuide from '@/components/simstudio/SimHelpGuide';

const TABS = [
  { value: 'deck', label: 'Deck' },
  { value: 'runs', label: 'Runs' },
  { value: 'results', label: 'Results' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const SimStudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'deck',
  );
  const {
    cases, activeCaseId, createCase, openCase, deleteCase,
    notifications, removeNotification,
  } = useSimStudio();

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Case</SectionLabel>
        <StudioProjectManager
          projects={cases.map((c) => ({ id: c.id, name: c.name }))}
          currentProjectId={activeCaseId}
          onCreate={createCase}
          onOpen={openCase}
          onDelete={deleteCase}
        />
      </section>
      <section>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          A case is one Eclipse-format deck plus its run history. The simulation
          itself runs on the platform&apos;s OPM Flow worker; this app never fakes a
          result.
        </p>
      </section>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Run Status</SectionLabel>
        <SimKpiPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'deck' && <DeckPanel />}
      {activeTab === 'runs' && <RunPanel />}
      {activeTab === 'results' && <ResultsPanel />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Reservoir Simulation Studio | Petrolord Suite</title>
        <meta name="description" content="Run black-oil reservoir simulations on the open-source OPM Flow engine: upload an Eclipse-format deck or an SPE benchmark template, queue the run, and chart field and well results." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Cuboid}
            iconGradientClass="from-emerald-700 to-lime-600"
            title="Reservoir Simulation Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <StudioHelp
            title="Reservoir Simulation Studio Guide"
            description="Decks, runs on the OPM Flow engine, and reading the results."
            triggerTitle="Simulation documentation"
          >
            <SimHelpGuide />
          </StudioHelp>
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

export default function ReservoirSimulationStudio() {
  return (
    <SimStudioProvider>
      <SimStudioContent />
    </SimStudioProvider>
  );
}
