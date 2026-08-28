// Choke & Wellhead Performance Studio (Production P8,
// Production-ROADMAP.md §3 app 8) — the bean as a constraint in the
// nodal solve, the operating envelope across bean sizes, the erosional
// limit, and fitting the correlation to a well's own tests.
//
// The choke correlations are the Suite's already-validated nodal layer
// (NA3); the wellhead limits are the vendored production engines. This
// page wires them to the shared per-well record.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { ChokePerformanceProvider, useChoke } from '@/contexts/ChokePerformanceContext';
import ChokePanel from '@/components/choke/ChokePanel';
import WellModelPanel from '@/components/choke/WellModelPanel';
import SpineLinkPanel from '@/components/choke/SpineLinkPanel';
import SummaryPanel from '@/components/choke/SummaryPanel';
import OperatingPointPanel from '@/components/choke/OperatingPointPanel';
import EnvelopePanel from '@/components/choke/EnvelopePanel';
import CoefficientsPanel from '@/components/choke/CoefficientsPanel';
import ChokeWarningsPanel from '@/components/choke/WarningsPanel';
import ChokeHelpContent from '@/components/choke/ChokeHelpGuide';

const TABS = [
  { value: 'operating', label: 'Operating Point' },
  { value: 'envelope', label: 'Performance' },
  { value: 'coefficients', label: 'Coefficients' },
  { value: 'model', label: 'Well Model' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const ChokeContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'operating',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, busyMessage,
  } = useChoke();

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
      ) : activeTab === 'coefficients' ? (
        <section>
          <SectionLabel>Production Spine</SectionLabel>
          <SpineLinkPanel />
        </section>
      ) : (
        <section>
          <SectionLabel>Choke and Flowline</SectionLabel>
          <ChokePanel />
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
      {activeTab === 'operating' && (
        <>
          <OperatingPointPanel />
          <ChokeWarningsPanel />
        </>
      )}
      {activeTab === 'envelope' && (
        <>
          <EnvelopePanel />
          <ChokeWarningsPanel />
        </>
      )}
      {activeTab === 'coefficients' && <CoefficientsPanel />}
      {activeTab === 'model' && (
        <>
          <OperatingPointPanel />
          <ChokeWarningsPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Choke &amp; Wellhead Performance Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Choke sizing and rating as a constraint in the nodal solve: the operating envelope across bean sizes, where the flow stops being critical, the API RP 14E erosional limit with its C factor as an input, Joule-Thomson cooling and hydrate screening, and fitting the Gilbert-family coefficients to a well's own tests."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Gauge}
            iconGradientClass="from-cyan-600 to-sky-700"
            title="Choke & Wellhead Performance Studio"
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
              title="Choke & Wellhead Performance Guide"
              description="How the bean becomes a rate, where the correlation stops, and what really caps a bean size."
              triggerTitle="Choke documentation"
            >
              <ChokeHelpContent />
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

export default function ChokePerformanceStudio() {
  return (
    <ChokePerformanceProvider>
      <ChokeContent />
    </ChokePerformanceProvider>
  );
}
