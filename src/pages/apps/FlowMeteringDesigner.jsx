// Flow Metering Designer (Facilities F12, Facilities-ROADMAP.md §3
// app 10) — a NEW app on the vendored orifice engine: Reader-Harris/
// Gallagher, plate sizing, and the uncertainty budget that is the
// actual point of a metering study.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { MeterStudioProvider, useMeter } from '@/contexts/MeterStudioContext';
import { RunInputs, FlowResults, UncertaintyResults } from '@/components/meterstudio/MeterPanels';
import MeterHelpContent from '@/components/meterstudio/MeterHelpGuide';
import { fmt, Row } from '@/components/meterstudio/fields';

const TABS = [
  { value: 'flow', label: 'Flow & Plate' },
  { value: 'uncertainty', label: 'Uncertainty' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { flow, sized, uncertainty, transmitter } = useMeter();
  return (
    <div className="space-y-1">
      {!flow.error && (
        <>
          <Row label="Beta ratio" value={fmt(flow.beta, 3)} />
          <Row label="Discharge coefficient" value={fmt(flow.cd, 4)} />
          <Row label="Mass flow" value={`${fmt(flow.massLbHr, 0)} lb/hr`} />
        </>
      )}
      {!sized.error && (
        <Row label="Plate for target" value={`${fmt(sized.orificeIdIn, 4)} in`}
          hint={`beta ${fmt(sized.beta, 3)}`} />
      )}
      {!uncertainty.error && (
        <Row label="Uncertainty" value={`${fmt(uncertainty.totalUncertaintyPct, 2)} %`}
          hint={`${uncertainty.dominant} dominates`} />
      )}
      {!transmitter.error && (
        <Row label="Transmitter at reading" value={`${fmt(transmitter.uncertaintyPctOfReading, 2)} %`}
          hint={`${fmt(transmitter.turndown, 1)} to 1 turndown`} />
      )}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'flow',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useMeter();

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
        <SectionLabel>Meter run</SectionLabel>
        <RunInputs />
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
      {activeTab === 'flow' && <FlowResults />}
      {activeTab === 'uncertainty' && <UncertaintyResults />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Flow Metering Designer | Petrolord Suite</title>
        <meta
          name="description"
          content="Orifice meter run sizing with the Reader-Harris/Gallagher discharge coefficient computed rather than assumed, plate bore solved for a target flow, permanent pressure loss, straight-run requirements by beta and upstream fitting, and a full uncertainty budget that names which term to spend money improving."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Gauge}
            iconGradientClass="from-violet-600 to-indigo-700"
            title="Flow Metering Designer"
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
              title="Flow Metering Guide"
              description="Why the discharge coefficient is not 0.61, why turndown limits an orifice run to about three to one, and why the uncertainty budget is the study."
              triggerTitle="Flow metering documentation"
            >
              <MeterHelpContent />
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

const FlowMeteringDesigner = () => (
  <MeterStudioProvider>
    <StudioContent />
  </MeterStudioProvider>
);

export default FlowMeteringDesigner;
