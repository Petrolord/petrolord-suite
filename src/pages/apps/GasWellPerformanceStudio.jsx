// Gas Well Performance Studio (Production P7, Production-ROADMAP.md §3
// app 7) — deliverability, liquid loading and plunger lift over the
// validated production engines and the Suite's nodal gas layer. Studio
// kit shell; all math is pure functions in utils/production/gasWell and
// the vendored engine.
//
// The first studio built on the SHARED per-well record (P6.5) from the
// start rather than carrying its own copy of the well.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Flame } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { GasWellPerformanceProvider, useGasWell } from '@/contexts/GasWellPerformanceContext';
import WellModelPanel from '@/components/gaswell/WellModelPanel';
import ConditionsPanel from '@/components/gaswell/ConditionsPanel';
import SpineLinkPanel from '@/components/gaswell/SpineLinkPanel';
import SummaryPanel from '@/components/gaswell/SummaryPanel';
import DeliverabilityPanel from '@/components/gaswell/DeliverabilityPanel';
import LoadingPanel from '@/components/gaswell/LoadingPanel';
import ForecastPanel from '@/components/gaswell/ForecastPanel';
import PlungerPanel from '@/components/gaswell/PlungerPanel';
import GasWellWarningsPanel from '@/components/gaswell/WarningsPanel';
import GasWellHelpContent from '@/components/gaswell/GasWellHelpGuide';

const TABS = [
  { value: 'deliverability', label: 'Deliverability' },
  { value: 'loading', label: 'Liquid Loading' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'plunger', label: 'Plunger Lift' },
  { value: 'model', label: 'Well Model' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const GasWellContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'deliverability',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, busyMessage,
  } = useGasWell();

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Analysis</SectionLabel>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
      </section>
      {activeTab === 'model' ? (
        <>
          <section>
            <SectionLabel>Well Model</SectionLabel>
            <WellModelPanel />
          </section>
          <section>
            <SectionLabel>Production Spine</SectionLabel>
            <SpineLinkPanel />
          </section>
        </>
      ) : (
        <section>
          <SectionLabel>Conditions</SectionLabel>
          <ConditionsPanel />
        </section>
      )}
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Summary</SectionLabel>
        <SummaryPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'deliverability' && (
        <>
          <DeliverabilityPanel />
          <GasWellWarningsPanel />
        </>
      )}
      {activeTab === 'loading' && (
        <>
          <LoadingPanel />
          <GasWellWarningsPanel />
        </>
      )}
      {activeTab === 'forecast' && <ForecastPanel />}
      {activeTab === 'plunger' && <PlungerPanel />}
      {activeTab === 'model' && (
        <>
          <DeliverabilityPanel />
          <GasWellWarningsPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Gas Well Performance Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Gas well deliverability, liquid loading and plunger lift on validated engines: the Turner and Coleman droplet balance derived rather than quoted, the critical rate profile down the whole string, the reservoir pressure at which the well will load, tubing screening, and plunger feasibility from a static force balance."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Flame}
            iconGradientClass="from-orange-600 to-red-600"
            title="Gas Well Performance Studio"
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
              title="Gas Well Performance Studio Guide"
              description="How deliverability, liquid loading and plunger feasibility are worked out."
              triggerTitle="Gas well documentation"
            >
              <GasWellHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={rightPanel}
        main={main}
        busyMessage={busyMessage}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default function GasWellPerformanceStudio() {
  return (
    <GasWellPerformanceProvider>
      <GasWellContent />
    </GasWellPerformanceProvider>
  );
}
