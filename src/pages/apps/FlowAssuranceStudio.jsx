// Flow Assurance Studio (Production P10, Production-ROADMAP.md app 10)
// — one continuous pressure and temperature trace from the
// perforations to the arrival, with the hydrate and wax questions asked
// at every station along it.
//
// The wellbore half is the Suite's already-validated nodal traverse;
// the flowline thermal model and the inhibition relations are the
// vendored production engines. This page wires them to the shared
// per-well record.
//
// It replaces the archived Flow Assurance Monitor, which computed a
// fixed 0.02 psi/ft gradient and a hydrate temperature of
// 18*ln(P) - 100 + GOR/1000. Neither was a correlation; both were
// invented. Nothing from it survives.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Snowflake } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { FlowAssuranceProvider, useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import DutyPanel from '@/components/flowassurance/DutyPanel';
import PipeLegPanel from '@/components/flowassurance/PipeLegPanel';
import WellModelPanel from '@/components/flowassurance/WellModelPanel';
import SpineLinkPanel from '@/components/flowassurance/SpineLinkPanel';
import TracePanel from '@/components/flowassurance/TracePanel';
import HydratePanel from '@/components/flowassurance/HydratePanel';
import InsulationPanel from '@/components/flowassurance/InsulationPanel';
import CooldownPanel from '@/components/flowassurance/CooldownPanel';
import SummaryPanel from '@/components/flowassurance/SummaryPanel';
import WarningsPanel from '@/components/flowassurance/WarningsPanel';
import FlowAssuranceHelpContent from '@/components/flowassurance/FlowAssuranceHelpGuide';

const TABS = [
  { value: 'trace', label: 'Trace' },
  { value: 'hydrate', label: 'Hydrates' },
  { value: 'thermal', label: 'Thermal' },
  { value: 'model', label: 'Well Model' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const FlowAssuranceContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'trace',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, busyMessage,
  } = useFlowAssurance();

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
      ) : activeTab === 'thermal' ? (
        <>
          <section>
            <SectionLabel>Flowline</SectionLabel>
            <PipeLegPanel leg="flowline" title="The flowline" />
          </section>
          <section>
            <SectionLabel>Riser</SectionLabel>
            <PipeLegPanel leg="riser" title="The riser" optional />
          </section>
        </>
      ) : (
        <section>
          <SectionLabel>Duty and Conditions</SectionLabel>
          <DutyPanel />
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
      {activeTab === 'trace' && (
        <>
          <TracePanel />
          <WarningsPanel />
        </>
      )}
      {activeTab === 'hydrate' && (
        <>
          <HydratePanel />
          <WarningsPanel />
        </>
      )}
      {activeTab === 'thermal' && (
        <>
          <InsulationPanel />
          <CooldownPanel />
          <WarningsPanel />
        </>
      )}
      {activeTab === 'model' && (
        <>
          <TracePanel />
          <WarningsPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Flow Assurance Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="One continuous pressure and temperature trace from the perforations to the arrival: the validated nodal wellbore traverse, Joule-Thomson cooling across the choke, a coupled thermal and hydraulic march down the flowline and riser, hydrate and wax exposure at every station, inhibitor dosing with both depression relations reported, and the no-touch cooldown time after a shutdown."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Snowflake}
            iconGradientClass="from-sky-600 to-cyan-700"
            title="Flow Assurance Studio"
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
              title="Flow Assurance Guide"
              description="How the trace is built, which half of it is solved, and where the hydrate question is actually asked."
              triggerTitle="Flow assurance documentation"
            >
              <FlowAssuranceHelpContent />
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

export default function FlowAssuranceStudio() {
  return (
    <FlowAssuranceProvider>
      <FlowAssuranceContent />
    </FlowAssuranceProvider>
  );
}
